BEGIN;

CREATE TABLE public.eventos_pagamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_externo_id text NOT NULL UNIQUE,
  tipo text NOT NULL,
  cobranca_id text,
  referencia text,
  valor_centavos bigint,
  metodo text CHECK (metodo IS NULL OR metodo IN ('pix','cartao')),
  tentativa_id uuid REFERENCES public.tentativas_pagamento(id) ON DELETE RESTRICT,
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE RESTRICT,
  resultado text NOT NULL DEFAULT 'processando',
  erro_codigo text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  processado_em timestamptz
);

COMMENT ON TABLE public.eventos_pagamento IS
  'Recibo idempotente dos webhooks Asaas. Guarda somente campos financeiros necessários e erro redigido; nunca payload bruto ou segredo.';

CREATE TABLE public.ocorrencias_pagamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_pagamento_id uuid NOT NULL UNIQUE REFERENCES public.eventos_pagamento(id) ON DELETE RESTRICT,
  tentativa_id uuid NOT NULL REFERENCES public.tentativas_pagamento(id) ON DELETE RESTRICT,
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('chargeback','estorno','pagamento_tardio')),
  estado text NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','em_analise','correlacionada','encerrada')),
  referencia_externa text,
  detalhe text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.antecipacoes_recebiveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  antecipacao_externa_id text NOT NULL UNIQUE,
  tentativa_id uuid NOT NULL REFERENCES public.tentativas_pagamento(id) ON DELETE RESTRICT,
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE RESTRICT,
  cobranca_id text NOT NULL,
  estado text NOT NULL CHECK (estado IN ('SCHEDULED','PENDING','CREDITED','DEBITED','DENIED','CANCELLED','OVERDUE')),
  valor_centavos bigint NOT NULL CHECK (valor_centavos >= 0),
  tarifa_centavos bigint NOT NULL CHECK (tarifa_centavos >= 0),
  liquido_centavos bigint NOT NULL CHECK (liquido_centavos >= 0),
  data_credito date,
  motivo_negacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (tarifa_centavos <= valor_centavos),
  CHECK (liquido_centavos <= valor_centavos)
);

CREATE UNIQUE INDEX lancamento_charge_unico_por_pedido
  ON public.lancamentos_financeiros(pedido_id)
  WHERE tipo = 'charge' AND pedido_id IS NOT NULL;
CREATE INDEX eventos_pagamento_reconciliacao_idx
  ON public.eventos_pagamento(resultado, recebido_em DESC);
CREATE INDEX antecipacoes_recebiveis_estado_idx
  ON public.antecipacoes_recebiveis(estado, atualizado_em DESC);

ALTER TABLE public.eventos_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_pagamento FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencias_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencias_pagamento FORCE ROW LEVEL SECURITY;
ALTER TABLE public.antecipacoes_recebiveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.antecipacoes_recebiveis FORCE ROW LEVEL SECURITY;

CREATE POLICY admin_le_eventos_pagamento ON public.eventos_pagamento
  FOR SELECT USING (public.is_admin());
CREATE POLICY admin_le_ocorrencias_pagamento ON public.ocorrencias_pagamento
  FOR SELECT USING (public.is_admin());
CREATE POLICY admin_le_antecipacoes_recebiveis ON public.antecipacoes_recebiveis
  FOR SELECT USING (public.is_admin());
CREATE POLICY admin_le_tentativas_pagamento ON public.tentativas_pagamento
  FOR SELECT USING (public.is_admin());

REVOKE ALL ON public.eventos_pagamento, public.ocorrencias_pagamento, public.antecipacoes_recebiveis
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.eventos_pagamento, public.ocorrencias_pagamento, public.antecipacoes_recebiveis
  TO authenticated;
GRANT ALL ON public.eventos_pagamento, public.ocorrencias_pagamento, public.antecipacoes_recebiveis
  TO service_role;
GRANT SELECT ON public.tentativas_pagamento TO authenticated;

CREATE OR REPLACE FUNCTION public.processar_evento_pagamento(
  p_evento_id text,
  p_evento text,
  p_cobranca_id text,
  p_referencia text,
  p_valor_centavos bigint,
  p_metodo text
)
RETURNS TABLE (resultado text, pedido_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_evento public.eventos_pagamento%ROWTYPE;
  v_tentativa public.tentativas_pagamento%ROWTYPE;
  v_pedido public.pedidos%ROWTYPE;
  v_inseridos integer;
  v_resultado text;
  v_erro text;
  v_ocorrencia text;
  v_financeiro boolean;
BEGIN
  IF p_evento_id IS NULL OR btrim(p_evento_id) = '' OR p_evento IS NULL OR btrim(p_evento) = '' THEN
    RAISE EXCEPTION 'EVENTO_INVALIDO';
  END IF;

  INSERT INTO public.eventos_pagamento (
    evento_externo_id,tipo,cobranca_id,referencia,valor_centavos,metodo
  ) VALUES (
    p_evento_id,p_evento,p_cobranca_id,p_referencia,p_valor_centavos,p_metodo
  ) ON CONFLICT (evento_externo_id) DO NOTHING;
  GET DIAGNOSTICS v_inseridos = ROW_COUNT;

  SELECT ep.* INTO STRICT v_evento
  FROM public.eventos_pagamento ep
  WHERE ep.evento_externo_id = p_evento_id
  FOR UPDATE;

  IF v_inseridos = 0 AND v_evento.processado_em IS NOT NULL THEN
    RETURN QUERY SELECT v_evento.resultado, v_evento.pedido_id;
    RETURN;
  END IF;

  IF p_evento NOT IN (
    'PAYMENT_CONFIRMED','PAYMENT_RECEIVED','PAYMENT_AWAITING_RISK_ANALYSIS',
    'PAYMENT_CREATED','PAYMENT_UPDATED','PAYMENT_CREDIT_CARD_CAPTURE_REFUSED','PAYMENT_OVERDUE',
    'PAYMENT_CHARGEBACK_REQUESTED','PAYMENT_CHARGEBACK_DISPUTE','PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
    'PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED','PAYMENT_REFUND_IN_PROGRESS','PAYMENT_REFUND_DENIED'
  ) THEN
    UPDATE public.eventos_pagamento ep
    SET resultado='evento_desconhecido',erro_codigo='EVENTO_NAO_SUPORTADO',processado_em=now()
    WHERE ep.id=v_evento.id;
    RETURN QUERY SELECT 'evento_desconhecido'::text,NULL::uuid;
    RETURN;
  END IF;

  -- O ID externo persistido é a única chave de escolha. A referência apenas
  -- prova o vínculo; nunca participa de um OR que possa escolher outro pedido.
  IF p_cobranca_id IS NOT NULL THEN
    SELECT tp.* INTO v_tentativa
    FROM public.tentativas_pagamento tp
    WHERE tp.asaas_payment_id = p_cobranca_id;
  END IF;

  IF NOT FOUND THEN
    v_resultado := 'vinculo_nao_encontrado';
    v_erro := 'COBRANCA_DESCONHECIDA';
  ELSE
    SELECT p.* INTO STRICT v_pedido
    FROM public.pedidos p WHERE p.id = v_tentativa.pedido_id FOR UPDATE;
    SELECT tp.* INTO STRICT v_tentativa
    FROM public.tentativas_pagamento tp WHERE tp.id = v_tentativa.id FOR UPDATE;

    IF p_referencia IS NOT NULL AND p_referencia <> v_tentativa.id::text THEN
      v_resultado := 'referencia_divergente';
      v_erro := 'REFERENCIA_DIVERGENTE';
    ELSIF p_metodo IS NOT NULL AND p_metodo <> v_tentativa.forma THEN
      v_resultado := 'metodo_divergente';
      v_erro := 'METODO_DIVERGENTE';
    ELSE
      v_financeiro := p_evento IN ('PAYMENT_CONFIRMED','PAYMENT_RECEIVED');
      IF v_financeiro AND (
        p_valor_centavos IS NULL OR p_valor_centavos <> round(v_pedido.total_pago_reais * 100)::bigint
        OR p_metodo IS NULL
      ) THEN
        v_resultado := 'valor_divergente';
        v_erro := 'VALOR_DIVERGENTE';
      ELSIF v_financeiro THEN
        UPDATE public.tentativas_pagamento tp
        SET estado = CASE
          WHEN p_evento = 'PAYMENT_RECEIVED' THEN 'recebido'
          WHEN tp.estado = 'recebido' THEN 'recebido'
          ELSE 'confirmado'
        END,
        encerrada_em = NULL
        WHERE tp.id = v_tentativa.id;

        INSERT INTO public.lancamentos_financeiros (
          estabelecimento_id,pedido_id,tipo,valor_centavos,status,asaas_id_externo,detalhe
        ) SELECT
          v_pedido.estabelecimento_id,v_pedido.id,'charge',p_valor_centavos,'concluido',p_cobranca_id,
          'Cobrança validada por evento financeiro idempotente do gateway.'
        WHERE NOT EXISTS (
          SELECT 1 FROM public.lancamentos_financeiros lf
          WHERE lf.pedido_id=v_pedido.id AND lf.tipo='charge'
        );

        IF v_pedido.status LIKE 'cancelado%' OR v_pedido.status = 'recusado' THEN
          v_resultado := 'pagamento_tardio';
          INSERT INTO public.ocorrencias_pagamento (
            evento_pagamento_id,tentativa_id,pedido_id,tipo,referencia_externa,detalhe
          ) VALUES (
            v_evento.id,v_tentativa.id,v_pedido.id,'pagamento_tardio',p_cobranca_id,
            'Pagamento recebido após encerramento do pedido; requer devolução manual.'
          ) ON CONFLICT (evento_pagamento_id) DO NOTHING;
        ELSE
          IF v_pedido.status = 'aguardando_pagamento' THEN
            UPDATE public.pedidos p
            SET status='aguardando_aceite', pago_em=coalesce(p.pago_em,now()), asaas_payment_id=p_cobranca_id
            WHERE p.id=v_pedido.id;
          END IF;
          v_resultado := CASE WHEN p_evento='PAYMENT_RECEIVED' THEN 'recebido' ELSE 'confirmado' END;
        END IF;
      ELSIF p_evento IN ('PAYMENT_AWAITING_RISK_ANALYSIS','PAYMENT_CREATED','PAYMENT_UPDATED') THEN
        UPDATE public.tentativas_pagamento tp SET estado='pendente'
        WHERE tp.id=v_tentativa.id AND tp.estado IN ('criando','pendente','reconciliacao');
        v_resultado := 'pendente';
      ELSIF p_evento = 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED' THEN
        UPDATE public.tentativas_pagamento tp SET estado='recusado', encerrada_em=now()
        WHERE tp.id=v_tentativa.id AND tp.estado NOT IN ('confirmado','recebido');
        v_resultado := 'recusado';
      ELSIF p_evento = 'PAYMENT_OVERDUE' THEN
        UPDATE public.tentativas_pagamento tp SET estado='expirado', encerrada_em=now()
        WHERE tp.id=v_tentativa.id AND tp.estado NOT IN ('confirmado','recebido');
        v_resultado := 'expirado';
      ELSIF p_evento IN ('PAYMENT_CHARGEBACK_REQUESTED','PAYMENT_CHARGEBACK_DISPUTE','PAYMENT_AWAITING_CHARGEBACK_REVERSAL') THEN
        v_resultado := 'ocorrencia_registrada';
        v_ocorrencia := 'chargeback';
      ELSIF p_evento IN ('PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED','PAYMENT_REFUND_IN_PROGRESS','PAYMENT_REFUND_DENIED') THEN
        v_resultado := 'ocorrencia_registrada';
        v_ocorrencia := 'estorno';
      ELSE
        v_resultado := 'evento_desconhecido';
        v_erro := 'EVENTO_NAO_SUPORTADO';
      END IF;
    END IF;
  END IF;

  IF v_ocorrencia IS NOT NULL THEN
    INSERT INTO public.ocorrencias_pagamento (
      evento_pagamento_id,tentativa_id,pedido_id,tipo,referencia_externa,detalhe
    ) VALUES (
      v_evento.id,v_tentativa.id,v_pedido.id,v_ocorrencia,p_cobranca_id,
      CASE WHEN v_ocorrencia='chargeback'
        THEN 'Chargeback recebido; responsabilidade aguarda decisão administrativa.'
        ELSE 'Estorno recebido; aguarda correlação com a devolução administrativa.' END
    ) ON CONFLICT (evento_pagamento_id) DO NOTHING;
  END IF;

  UPDATE public.eventos_pagamento ep
  SET tentativa_id=CASE WHEN v_tentativa.id IS NULL THEN NULL ELSE v_tentativa.id END,
      pedido_id=CASE WHEN v_pedido.id IS NULL THEN NULL ELSE v_pedido.id END,
      resultado=v_resultado,
      erro_codigo=v_erro,
      processado_em=now()
  WHERE ep.id=v_evento.id;

  RETURN QUERY SELECT v_resultado, CASE WHEN v_pedido.id IS NULL THEN NULL::uuid ELSE v_pedido.id END;
END;
$$;

CREATE OR REPLACE FUNCTION public.processar_evento_antecipacao(
  p_evento_id text,
  p_evento text,
  p_antecipacao_id text,
  p_cobranca_id text,
  p_estado text,
  p_valor_centavos bigint,
  p_tarifa_centavos bigint,
  p_liquido_centavos bigint,
  p_data_credito date,
  p_motivo_negacao text
)
RETURNS TABLE (resultado text, pedido_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_evento public.eventos_pagamento%ROWTYPE;
  v_tentativa public.tentativas_pagamento%ROWTYPE;
  v_existente public.antecipacoes_recebiveis%ROWTYPE;
  v_inseridos integer;
  v_estado text;
BEGIN
  IF p_evento_id IS NULL OR btrim(p_evento_id)='' OR p_antecipacao_id IS NULL OR btrim(p_antecipacao_id)=''
    OR p_estado NOT IN ('SCHEDULED','PENDING','CREDITED','DEBITED','DENIED','CANCELLED','OVERDUE')
    OR p_valor_centavos IS NULL OR p_valor_centavos<0 OR p_tarifa_centavos IS NULL OR p_tarifa_centavos<0
    OR p_liquido_centavos IS NULL OR p_liquido_centavos<0
  THEN RAISE EXCEPTION 'EVENTO_ANTECIPACAO_INVALIDO'; END IF;

  INSERT INTO public.eventos_pagamento(evento_externo_id,tipo,cobranca_id,valor_centavos)
  VALUES(p_evento_id,p_evento,p_cobranca_id,p_valor_centavos)
  ON CONFLICT(evento_externo_id) DO NOTHING;
  GET DIAGNOSTICS v_inseridos=ROW_COUNT;
  SELECT ep.* INTO STRICT v_evento FROM public.eventos_pagamento ep
  WHERE ep.evento_externo_id=p_evento_id FOR UPDATE;
  IF v_inseridos=0 AND v_evento.processado_em IS NOT NULL THEN
    RETURN QUERY SELECT v_evento.resultado,v_evento.pedido_id; RETURN;
  END IF;

  SELECT tp.* INTO v_tentativa FROM public.tentativas_pagamento tp
  WHERE tp.asaas_payment_id=p_cobranca_id;
  IF NOT FOUND THEN
    UPDATE public.eventos_pagamento ep SET resultado='vinculo_nao_encontrado',erro_codigo='COBRANCA_DESCONHECIDA',processado_em=now()
    WHERE ep.id=v_evento.id;
    RETURN QUERY SELECT 'vinculo_nao_encontrado'::text,NULL::uuid; RETURN;
  END IF;

  PERFORM 1 FROM public.pedidos p WHERE p.id=v_tentativa.pedido_id FOR UPDATE;
  SELECT ar.* INTO v_existente FROM public.antecipacoes_recebiveis ar
  WHERE ar.antecipacao_externa_id=p_antecipacao_id FOR UPDATE;
  IF FOUND AND v_existente.cobranca_id<>p_cobranca_id THEN
    UPDATE public.eventos_pagamento ep SET tentativa_id=v_tentativa.id,pedido_id=v_tentativa.pedido_id,
      resultado='vinculo_divergente',erro_codigo='ANTECIPACAO_DIVERGENTE',processado_em=now() WHERE ep.id=v_evento.id;
    RETURN QUERY SELECT 'vinculo_divergente'::text,v_tentativa.pedido_id; RETURN;
  END IF;

  v_estado := p_estado;
  IF FOUND THEN
    v_estado := CASE
      WHEN v_existente.estado='DEBITED' THEN 'DEBITED'
      WHEN v_existente.estado='CREDITED' AND p_estado<>'DEBITED' THEN 'CREDITED'
      WHEN v_existente.estado IN ('DENIED','CANCELLED','OVERDUE') AND p_estado IN ('SCHEDULED','PENDING') THEN v_existente.estado
      ELSE p_estado
    END;
  END IF;

  INSERT INTO public.antecipacoes_recebiveis(
    antecipacao_externa_id,tentativa_id,pedido_id,cobranca_id,estado,valor_centavos,
    tarifa_centavos,liquido_centavos,data_credito,motivo_negacao
  ) VALUES(
    p_antecipacao_id,v_tentativa.id,v_tentativa.pedido_id,p_cobranca_id,v_estado,p_valor_centavos,
    p_tarifa_centavos,p_liquido_centavos,CASE WHEN v_estado='CREDITED' THEN p_data_credito ELSE NULL END,
    CASE WHEN v_estado='DENIED' THEN left(p_motivo_negacao,500) ELSE NULL END
  ) ON CONFLICT(antecipacao_externa_id) DO UPDATE SET
    estado=excluded.estado,valor_centavos=excluded.valor_centavos,tarifa_centavos=excluded.tarifa_centavos,
    liquido_centavos=excluded.liquido_centavos,
    data_credito=coalesce(excluded.data_credito,public.antecipacoes_recebiveis.data_credito),
    motivo_negacao=coalesce(excluded.motivo_negacao,public.antecipacoes_recebiveis.motivo_negacao),atualizado_em=now();

  UPDATE public.eventos_pagamento ep SET tentativa_id=v_tentativa.id,pedido_id=v_tentativa.pedido_id,
    resultado='antecipacao_atualizada',processado_em=now() WHERE ep.id=v_evento.id;
  RETURN QUERY SELECT 'antecipacao_atualizada'::text,v_tentativa.pedido_id;
END;
$$;

REVOKE ALL ON FUNCTION public.processar_evento_pagamento(text,text,text,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.processar_evento_pagamento(text,text,text,text,bigint,text) TO service_role;
REVOKE ALL ON FUNCTION public.processar_evento_antecipacao(text,text,text,text,text,bigint,bigint,bigint,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.processar_evento_antecipacao(text,text,text,text,text,bigint,bigint,bigint,date,text) TO service_role;

-- Os endpoints legados não conseguem validar evento, valor e método e faziam
-- fallback OR por referência; chargeback ainda debitava o lojista automaticamente.
DROP FUNCTION IF EXISTS public.confirmar_pagamento_pedido(text,text);
DROP FUNCTION IF EXISTS public.registrar_chargeback_pedido(text,text);

COMMIT;
