BEGIN;

CREATE OR REPLACE FUNCTION private.conciliar_reembolso(
  p_lancamento_id uuid,p_resultado text,p_referencia text,p_operacao_id uuid,p_detalhe text,p_ator_id uuid,p_evento_externo_id text DEFAULT NULL
) RETURNS public.lancamentos_financeiros LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_pedido_id uuid; v_lancamento public.lancamentos_financeiros%ROWTYPE; v_evento public.eventos_reembolso%ROWTYPE;
BEGIN
  IF p_resultado NOT IN ('concluido','erro') OR p_resultado IS NULL THEN RAISE EXCEPTION 'RESULTADO_INVALIDO'; END IF;
  IF p_resultado='concluido' AND (p_referencia IS NULL OR btrim(p_referencia)='') THEN RAISE EXCEPTION 'REFERENCIA_OBRIGATORIA'; END IF;
  IF p_resultado='erro' AND (p_detalhe IS NULL OR btrim(p_detalhe)='') THEN RAISE EXCEPTION 'DETALHE_OBRIGATORIO'; END IF;
  SELECT pedido_id INTO v_pedido_id FROM public.lancamentos_financeiros WHERE id=p_lancamento_id AND tipo='refund';
  IF NOT FOUND THEN RAISE EXCEPTION 'REEMBOLSO_NAO_ENCONTRADO'; END IF;
  PERFORM 1 FROM public.pedidos WHERE id=v_pedido_id FOR UPDATE;
  SELECT * INTO v_lancamento FROM public.lancamentos_financeiros WHERE id=p_lancamento_id FOR UPDATE;
  IF v_lancamento.estado_reserva<>'ativa' THEN RAISE EXCEPTION 'RESERVA_LIBERADA'; END IF;
  IF v_lancamento.asaas_id_externo IS NOT NULL AND p_referencia IS NOT NULL AND v_lancamento.asaas_id_externo<>btrim(p_referencia) THEN
    RAISE EXCEPTION 'REFERENCIA_DIVERGENTE';
  END IF;
  IF p_operacao_id IS NOT NULL THEN
    SELECT * INTO v_evento FROM public.eventos_reembolso WHERE operacao_id=p_operacao_id;
    IF FOUND THEN
      IF v_evento.lancamento_id<>p_lancamento_id OR v_evento.tipo<>(CASE WHEN p_resultado='erro' THEN 'falha' ELSE 'confirmacao' END)
        OR v_evento.ator_id IS DISTINCT FROM p_ator_id
        OR NULLIF(btrim(v_evento.detalhe),'') IS DISTINCT FROM NULLIF(btrim(p_detalhe),'')
        THEN RAISE EXCEPTION 'OPERACAO_ID_EM_USO'; END IF;
      IF NULLIF(btrim(v_evento.referencia),'') IS DISTINCT FROM NULLIF(btrim(p_referencia),'')
        THEN RAISE EXCEPTION 'REFERENCIA_DIVERGENTE'; END IF;
      RETURN v_lancamento;
    END IF;
  END IF;
  IF v_lancamento.status='concluido' THEN
    IF p_resultado<>'concluido' THEN RAISE EXCEPTION 'ESTADO_INVALIDO'; END IF;
    RETURN v_lancamento;
  END IF;
  UPDATE public.lancamentos_financeiros SET status=p_resultado,
    asaas_id_externo=COALESCE(asaas_id_externo,NULLIF(btrim(p_referencia),'')),
    ator_admin_id=COALESCE(p_ator_id,ator_admin_id),
    detalhe=COALESCE(NULLIF(btrim(p_detalhe),''),detalhe),
    concluido_em=CASE WHEN p_resultado='concluido' THEN now() ELSE NULL END,
    operacao_confirmacao_id=CASE WHEN p_resultado='concluido' THEN p_operacao_id ELSE operacao_confirmacao_id END
    WHERE id=p_lancamento_id RETURNING * INTO v_lancamento;
  INSERT INTO public.eventos_reembolso(lancamento_id,operacao_id,evento_externo_id,tipo,referencia,detalhe,ator_id)
  VALUES(p_lancamento_id,p_operacao_id,p_evento_externo_id,
    CASE WHEN p_evento_externo_id IS NOT NULL THEN 'webhook' WHEN p_resultado='erro' THEN 'falha' ELSE 'confirmacao' END,
    p_referencia,p_detalhe,p_ator_id);
  IF p_resultado='concluido' THEN
    IF v_lancamento.responsavel_reembolso='lojista' THEN
      INSERT INTO public.lancamentos_financeiros(estabelecimento_id,pedido_id,tipo,valor_centavos,status,ator_admin_id,detalhe,reembolso_origem_id)
      VALUES(v_lancamento.estabelecimento_id,v_lancamento.pedido_id,'merchant_credit',v_lancamento.valor_centavos,'concluido',p_ator_id,
        'Responsabilidade por devolução confirmada',v_lancamento.id)
      ON CONFLICT (reembolso_origem_id) WHERE tipo='merchant_credit' AND reembolso_origem_id IS NOT NULL DO NOTHING;
    ELSE
      INSERT INTO public.despesas_reembolso(lancamento_id,valor_centavos)
      VALUES(v_lancamento.id,-v_lancamento.valor_centavos) ON CONFLICT (lancamento_id) DO NOTHING;
    END IF;
  END IF;
  RETURN v_lancamento;
END;
$$;

CREATE OR REPLACE FUNCTION public.processar_evento_reembolso(
  p_evento_id text,p_evento text,p_cobranca_id text,p_reembolso_id text,p_valor_centavos bigint,p_metodo text,p_referencia text
) RETURNS TABLE(resultado text,pedido_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_evento public.eventos_pagamento%ROWTYPE; v_tentativa public.tentativas_pagamento%ROWTYPE;
  v_pedido public.pedidos%ROWTYPE; v_refund_id uuid; v_candidatos integer; v_erro text; v_resultado text;
BEGIN
  IF p_evento_id IS NULL OR btrim(p_evento_id)='' OR p_evento NOT IN
    ('PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED','PAYMENT_REFUND_IN_PROGRESS','PAYMENT_REFUND_DENIED')
    THEN RAISE EXCEPTION 'EVENTO_INVALIDO'; END IF;
  INSERT INTO public.eventos_pagamento(evento_externo_id,tipo,cobranca_id,referencia,valor_centavos,metodo,reembolso_externo_id)
    VALUES(p_evento_id,p_evento,p_cobranca_id,p_referencia,p_valor_centavos,p_metodo,p_reembolso_id)
    ON CONFLICT(evento_externo_id) DO NOTHING;
  SELECT * INTO v_evento FROM public.eventos_pagamento WHERE evento_externo_id=p_evento_id FOR UPDATE;
  IF v_evento.tipo<>p_evento OR v_evento.cobranca_id IS DISTINCT FROM p_cobranca_id
    OR v_evento.reembolso_externo_id IS DISTINCT FROM p_reembolso_id
    OR v_evento.valor_centavos IS DISTINCT FROM p_valor_centavos
    OR v_evento.metodo IS DISTINCT FROM p_metodo
    OR v_evento.referencia IS DISTINCT FROM p_referencia THEN RAISE EXCEPTION 'EVENTO_DIVERGENTE'; END IF;
  IF v_evento.processado_em IS NOT NULL THEN RETURN QUERY SELECT v_evento.resultado,v_evento.pedido_id; RETURN; END IF;
  SELECT * INTO v_tentativa FROM public.tentativas_pagamento WHERE asaas_payment_id=p_cobranca_id;
  IF NOT FOUND THEN
    UPDATE public.eventos_pagamento SET resultado='aguardando_vinculo',erro_codigo='COBRANCA_AGUARDANDO_VINCULO'
      WHERE id=v_evento.id;
    RETURN QUERY SELECT 'aguardando_vinculo'::text,NULL::uuid; RETURN;
  END IF;
  SELECT * INTO v_pedido FROM public.pedidos WHERE id=v_tentativa.pedido_id FOR UPDATE;
  IF p_referencia IS NOT NULL AND p_referencia<>v_tentativa.id::text THEN v_erro:='REFERENCIA_DIVERGENTE'; END IF;
  IF p_metodo IS NOT NULL AND p_metodo<>v_tentativa.forma THEN v_erro:='METODO_DIVERGENTE'; END IF;
  IF p_reembolso_id IS NULL OR btrim(p_reembolso_id)='' OR p_valor_centavos IS NULL OR p_valor_centavos<=0
    THEN v_erro:='REEMBOLSO_IDENTIDADE_INVALIDA'; END IF;
  IF v_erro IS NULL THEN
    SELECT lf.id INTO v_refund_id FROM public.lancamentos_financeiros lf
      WHERE lf.pedido_id=v_pedido.id AND lf.tipo='refund' AND lf.asaas_id_externo=p_reembolso_id;
    IF v_refund_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.lancamentos_financeiros lf WHERE lf.id=v_refund_id
        AND lf.estado_reserva='ativa' AND -lf.valor_centavos=p_valor_centavos) THEN v_erro:='VALOR_DIVERGENTE'; END IF;
    ELSE
      SELECT count(*)::integer,min(lf.id::text)::uuid INTO v_candidatos,v_refund_id FROM public.lancamentos_financeiros lf
        WHERE lf.pedido_id=v_pedido.id AND lf.tipo='refund' AND lf.estado_reserva='ativa'
          AND lf.status IN ('pendente','erro') AND lf.asaas_id_externo IS NULL AND -lf.valor_centavos=p_valor_centavos;
      IF v_candidatos<>1 THEN v_erro:='REEMBOLSO_AMBIGUO'; END IF;
    END IF;
  END IF;
  IF v_erro IS NULL AND p_evento='PAYMENT_REFUND_DENIED' AND EXISTS (
    SELECT 1 FROM public.lancamentos_financeiros lf WHERE lf.id=v_refund_id AND lf.status='concluido'
  ) THEN v_erro:='ESTADO_DIVERGENTE'; END IF;
  IF v_erro IS NOT NULL THEN
    v_resultado:='conciliacao_necessaria';
  ELSIF p_evento='PAYMENT_REFUND_IN_PROGRESS' THEN
    -- O lock do pedido serializa novos reembolsos; vincule a identidade antes de confirmar o evento.
    UPDATE public.lancamentos_financeiros SET asaas_id_externo=p_reembolso_id
      WHERE id=v_refund_id AND estado_reserva='ativa' AND -valor_centavos=p_valor_centavos
        AND (asaas_id_externo IS NULL OR asaas_id_externo=p_reembolso_id);
    IF NOT FOUND THEN RAISE EXCEPTION 'REEMBOLSO_DIVERGENTE'; END IF;
    v_resultado:='estorno_em_processamento';
  ELSIF p_evento='PAYMENT_REFUND_DENIED' THEN
    PERFORM private.conciliar_reembolso(v_refund_id,'erro',p_reembolso_id,NULL,'Estorno negado pelo gateway',NULL,p_evento_id);
    v_resultado:='falha_registrada';
  ELSE
    PERFORM private.conciliar_reembolso(v_refund_id,'concluido',p_reembolso_id,NULL,NULL,NULL,p_evento_id);
    v_resultado:='reembolso_conciliado';
  END IF;
  UPDATE public.eventos_pagamento SET tentativa_id=v_tentativa.id,pedido_id=v_pedido.id,
    resultado=v_resultado,erro_codigo=v_erro,processado_em=now() WHERE id=v_evento.id;
  IF v_erro IS NOT NULL THEN
    INSERT INTO public.ocorrencias_pagamento(evento_pagamento_id,tentativa_id,pedido_id,tipo,referencia_externa,detalhe)
    VALUES(v_evento.id,v_tentativa.id,v_pedido.id,'estorno',p_reembolso_id,v_erro)
    ON CONFLICT(evento_pagamento_id) DO NOTHING;
  END IF;
  RETURN QUERY SELECT v_resultado,v_pedido.id;
END;
$$;

COMMIT;
