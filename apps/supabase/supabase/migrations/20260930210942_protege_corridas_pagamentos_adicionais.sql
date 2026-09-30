BEGIN;

ALTER TABLE public.tentativas_pagamento
  ADD COLUMN reconciliacao_motivo text
  CHECK (reconciliacao_motivo IS NULL OR reconciliacao_motivo = 'pagamento_anterior_confirmado');

ALTER TABLE public.ocorrencias_pagamento
  DROP CONSTRAINT ocorrencias_pagamento_tipo_check;
ALTER TABLE public.ocorrencias_pagamento
  ADD CONSTRAINT ocorrencias_pagamento_tipo_check
  CHECK (tipo IN ('chargeback','estorno','pagamento_tardio','pagamento_adicional'));
CREATE UNIQUE INDEX ocorrencia_pagamento_adicional_unica_por_tentativa
  ON public.ocorrencias_pagamento(tentativa_id)
  WHERE tipo='pagamento_adicional';

CREATE OR REPLACE FUNCTION public.salvar_tentativa_pagamento(
  p_tentativa_id uuid,
  p_claim_token uuid,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  t public.tentativas_pagamento%ROWTYPE;
  p public.pedidos%ROWTYPE;
  novo_estado text;
  externo text;
BEGIN
  SELECT p1.* INTO STRICT p
  FROM public.pedidos p1
  JOIN public.tentativas_pagamento a ON a.pedido_id=p1.id
  WHERE a.id=p_tentativa_id
  FOR UPDATE OF p1;
  SELECT * INTO STRICT t FROM public.tentativas_pagamento WHERE id=p_tentativa_id FOR UPDATE;
  IF p_claim_token IS NULL OR t.claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'CLAIM_INVALIDO';
  END IF;

  externo:=coalesce(p_patch->>'asaas_payment_id',t.asaas_payment_id);
  -- A confirmação tardia da cobrança anterior vence a corrida. O worker que
  -- já criou B pode registrar seu ID uma única vez para devolução/conciliação,
  -- mas não altera a cobrança canônica do pedido nem sai da fila Admin.
  IF t.reconciliacao_motivo='pagamento_anterior_confirmado' THEN
    IF externo IS NULL OR (t.asaas_payment_id IS NOT NULL AND externo<>t.asaas_payment_id) THEN
      RAISE EXCEPTION 'CLAIM_OBSOLETO';
    END IF;
    UPDATE public.tentativas_pagamento
    SET estado='reconciliacao',asaas_payment_id=externo,
      qr_code_pix=coalesce(p_patch->>'qr_code_pix',qr_code_pix),
      pix_copia_e_cola=coalesce(p_patch->>'pix_copia_e_cola',pix_copia_e_cola),
      expira_em=coalesce((p_patch->>'expira_em')::timestamptz,expira_em),
      claim_token=NULL,claim_expira_em=NULL
    WHERE id=t.id RETURNING * INTO t;
    RETURN to_jsonb(t);
  END IF;

  IF t.estado NOT IN ('criando','pendente','reconciliacao') THEN RAISE EXCEPTION 'TENTATIVA_ENCERRADA'; END IF;
  novo_estado:=coalesce(p_patch->>'estado',t.estado);
  IF novo_estado NOT IN ('pendente','reconciliacao','recusado') OR (novo_estado='pendente' AND externo IS NULL)
    OR (novo_estado='recusado' AND externo IS NOT NULL)
    OR (t.asaas_payment_id IS NOT NULL AND externo<>t.asaas_payment_id)
  THEN RAISE EXCEPTION 'TRANSICAO_INVALIDA'; END IF;
  IF p.status<>'aguardando_pagamento' OR p.pago_em IS NOT NULL THEN
    RAISE EXCEPTION 'PEDIDO_NAO_PAGAVEL';
  END IF;

  UPDATE public.tentativas_pagamento SET estado=novo_estado,asaas_payment_id=externo,
    qr_code_pix=coalesce(p_patch->>'qr_code_pix',qr_code_pix),pix_copia_e_cola=coalesce(p_patch->>'pix_copia_e_cola',pix_copia_e_cola),
    expira_em=coalesce((p_patch->>'expira_em')::timestamptz,expira_em),encerrada_em=CASE WHEN novo_estado='recusado' THEN now() ELSE NULL END
  WHERE id=t.id RETURNING * INTO t;
  UPDATE public.pedidos SET asaas_payment_id=t.asaas_payment_id,qr_code_pix=t.qr_code_pix,pix_copia_e_cola=t.pix_copia_e_cola
  WHERE id=t.pedido_id AND status='aguardando_pagamento' AND pago_em IS NULL;
  RETURN to_jsonb(t);
END;
$$;

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
  v_charge_externo text;
  v_pagamento_adicional boolean := false;
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

  IF p_cobranca_id IS NOT NULL THEN
    SELECT tp.* INTO v_tentativa
    FROM public.tentativas_pagamento tp
    WHERE tp.asaas_payment_id = p_cobranca_id;
  END IF;

  IF NOT FOUND THEN
    UPDATE public.eventos_pagamento ep
    SET resultado='aguardando_vinculo',erro_codigo='COBRANCA_AGUARDANDO_VINCULO',processado_em=NULL
    WHERE ep.id=v_evento.id;
    RETURN QUERY SELECT 'aguardando_vinculo'::text,NULL::uuid;
    RETURN;
  END IF;

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
      SELECT lf.asaas_id_externo INTO v_charge_externo
      FROM public.lancamentos_financeiros lf
      WHERE lf.pedido_id=v_pedido.id AND lf.tipo='charge'
      LIMIT 1;
      v_pagamento_adicional := FOUND AND v_charge_externo IS DISTINCT FROM p_cobranca_id;

      IF v_tentativa.encerrada_em IS NOT NULL THEN
        UPDATE public.tentativas_pagamento ativa
        SET estado='reconciliacao',
          reconciliacao_motivo='pagamento_anterior_confirmado',
          claim_expira_em=now()
        WHERE ativa.pedido_id=v_tentativa.pedido_id AND ativa.id<>v_tentativa.id
          AND ativa.encerrada_em IS NULL AND ativa.estado NOT IN ('confirmado','recebido');
      END IF;
      UPDATE public.tentativas_pagamento tp
      SET estado = CASE
        WHEN p_evento = 'PAYMENT_RECEIVED' THEN 'recebido'
        WHEN tp.estado = 'recebido' THEN 'recebido'
        ELSE 'confirmado'
      END,
      reconciliacao_motivo=NULL,
      encerrada_em = CASE
        WHEN tp.encerrada_em IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.tentativas_pagamento ativa
          WHERE ativa.pedido_id=tp.pedido_id AND ativa.id<>tp.id AND ativa.encerrada_em IS NULL
        ) THEN tp.encerrada_em
        ELSE NULL
      END
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

      IF v_pagamento_adicional THEN
        v_resultado := 'pagamento_adicional';
        v_ocorrencia := 'pagamento_adicional';
      ELSIF v_pedido.status LIKE 'cancelado%' OR v_pedido.status = 'recusado' THEN
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
      IF v_tentativa.reconciliacao_motivo='pagamento_anterior_confirmado' THEN
        v_resultado := 'reconciliacao';
      ELSE
        UPDATE public.tentativas_pagamento tp SET estado='pendente',reconciliacao_motivo=NULL
        WHERE tp.id=v_tentativa.id AND tp.estado IN ('criando','pendente','reconciliacao');
        v_resultado := 'pendente';
      END IF;
    ELSIF p_evento = 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED' THEN
      UPDATE public.tentativas_pagamento tp SET estado='recusado', encerrada_em=now(),reconciliacao_motivo=NULL
      WHERE tp.id=v_tentativa.id AND tp.estado NOT IN ('confirmado','recebido');
      v_resultado := 'recusado';
    ELSIF p_evento = 'PAYMENT_OVERDUE' THEN
      UPDATE public.tentativas_pagamento tp
      SET estado='reconciliacao'
      WHERE tp.id=v_tentativa.id AND tp.encerrada_em IS NULL
        AND tp.estado NOT IN ('confirmado','recebido');
      v_resultado := 'reconciliacao';
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

  IF v_ocorrencia IS NOT NULL THEN
    INSERT INTO public.ocorrencias_pagamento (
      evento_pagamento_id,tentativa_id,pedido_id,tipo,referencia_externa,detalhe
    ) VALUES (
      v_evento.id,v_tentativa.id,v_pedido.id,v_ocorrencia,p_cobranca_id,
      CASE
        WHEN v_ocorrencia='chargeback' THEN 'Chargeback recebido; responsabilidade aguarda decisão administrativa.'
        WHEN v_ocorrencia='pagamento_adicional' THEN 'Segunda cobrança confirmada; requer devolução e resolução administrativa.'
        ELSE 'Estorno recebido; aguarda correlação com a devolução administrativa.'
      END
    ) ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.eventos_pagamento ep
  SET tentativa_id=v_tentativa.id,
      pedido_id=v_pedido.id,
      resultado=v_resultado,
      erro_codigo=v_erro,
      processado_em=now()
  WHERE ep.id=v_evento.id;

  RETURN QUERY SELECT v_resultado,v_pedido.id;
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
  v_existe boolean;
  v_regressivo boolean := false;
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
    UPDATE public.eventos_pagamento ep SET resultado='aguardando_vinculo',erro_codigo='COBRANCA_AGUARDANDO_VINCULO',processado_em=NULL
    WHERE ep.id=v_evento.id;
    RETURN QUERY SELECT 'aguardando_vinculo'::text,NULL::uuid; RETURN;
  END IF;

  PERFORM 1 FROM public.pedidos p WHERE p.id=v_tentativa.pedido_id FOR UPDATE;
  SELECT ar.* INTO v_existente FROM public.antecipacoes_recebiveis ar
  WHERE ar.antecipacao_externa_id=p_antecipacao_id FOR UPDATE;
  v_existe := FOUND;
  IF v_existe AND v_existente.cobranca_id<>p_cobranca_id THEN
    UPDATE public.eventos_pagamento ep SET tentativa_id=v_tentativa.id,pedido_id=v_tentativa.pedido_id,
      resultado='vinculo_divergente',erro_codigo='ANTECIPACAO_DIVERGENTE',processado_em=now() WHERE ep.id=v_evento.id;
    RETURN QUERY SELECT 'vinculo_divergente'::text,v_tentativa.pedido_id; RETURN;
  END IF;

  v_estado := p_estado;
  IF v_existe THEN
    v_estado := CASE
      WHEN v_existente.estado='DEBITED' THEN 'DEBITED'
      WHEN v_existente.estado='CREDITED' AND p_estado<>'DEBITED' THEN 'CREDITED'
      WHEN v_existente.estado IN ('DENIED','CANCELLED','OVERDUE') AND p_estado IN ('SCHEDULED','PENDING') THEN v_existente.estado
      ELSE p_estado
    END;
    v_regressivo := v_estado = v_existente.estado AND p_estado <> v_existente.estado;
  END IF;

  INSERT INTO public.antecipacoes_recebiveis(
    antecipacao_externa_id,tentativa_id,pedido_id,cobranca_id,estado,valor_centavos,
    tarifa_centavos,liquido_centavos,data_credito,motivo_negacao
  ) VALUES(
    p_antecipacao_id,v_tentativa.id,v_tentativa.pedido_id,p_cobranca_id,v_estado,p_valor_centavos,
    p_tarifa_centavos,p_liquido_centavos,CASE WHEN v_estado='CREDITED' THEN p_data_credito ELSE NULL END,
    CASE WHEN v_estado='DENIED' THEN left(p_motivo_negacao,500) ELSE NULL END
  ) ON CONFLICT(antecipacao_externa_id) DO UPDATE SET
    estado=excluded.estado,
    valor_centavos=CASE WHEN v_regressivo THEN public.antecipacoes_recebiveis.valor_centavos ELSE excluded.valor_centavos END,
    tarifa_centavos=CASE WHEN v_regressivo THEN public.antecipacoes_recebiveis.tarifa_centavos ELSE excluded.tarifa_centavos END,
    liquido_centavos=CASE WHEN v_regressivo THEN public.antecipacoes_recebiveis.liquido_centavos ELSE excluded.liquido_centavos END,
    data_credito=CASE WHEN v_regressivo THEN public.antecipacoes_recebiveis.data_credito ELSE coalesce(excluded.data_credito,public.antecipacoes_recebiveis.data_credito) END,
    motivo_negacao=CASE WHEN v_regressivo THEN public.antecipacoes_recebiveis.motivo_negacao ELSE coalesce(excluded.motivo_negacao,public.antecipacoes_recebiveis.motivo_negacao) END,
    atualizado_em=CASE WHEN v_regressivo THEN public.antecipacoes_recebiveis.atualizado_em ELSE now() END;

  UPDATE public.eventos_pagamento ep SET tentativa_id=v_tentativa.id,pedido_id=v_tentativa.pedido_id,
    resultado=CASE WHEN v_regressivo THEN 'antecipacao_fora_de_ordem' ELSE 'antecipacao_atualizada' END,
    erro_codigo=NULL,processado_em=now()
  WHERE ep.id=v_evento.id;
  RETURN QUERY SELECT CASE WHEN v_regressivo THEN 'antecipacao_fora_de_ordem' ELSE 'antecipacao_atualizada' END,v_tentativa.pedido_id;
END;
$$;

COMMIT;
