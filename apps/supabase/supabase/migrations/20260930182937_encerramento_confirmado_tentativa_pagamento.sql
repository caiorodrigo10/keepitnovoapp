BEGIN;
ALTER TABLE public.tentativas_pagamento
  ADD COLUMN encerramento_operacao_id uuid,
  ADD COLUMN encerramento_claim_token uuid,
  ADD COLUMN encerramento_claim_expira_em timestamptz,
  ADD COLUMN encerramento_confirmacao jsonb;
CREATE UNIQUE INDEX tentativa_encerramento_operacao ON public.tentativas_pagamento(cliente_id,encerramento_operacao_id)
  WHERE encerramento_operacao_id IS NOT NULL;

CREATE FUNCTION public.preparar_encerramento_tentativa(p_tentativa_id uuid,p_operacao_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.pedidos%ROWTYPE; t public.tentativas_pagamento%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  SELECT p1.* INTO p FROM public.pedidos p1 JOIN public.tentativas_pagamento t1 ON t1.pedido_id=p1.id
    WHERE t1.id=p_tentativa_id FOR UPDATE OF p1;
  IF NOT FOUND OR p.cliente_id<>auth.uid() THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  SELECT * INTO STRICT t FROM public.tentativas_pagamento WHERE id=p_tentativa_id FOR UPDATE;
  IF p_operacao_id IS NULL THEN RAISE EXCEPTION 'ENTRADA_INVALIDA'; END IF;
  IF t.encerramento_operacao_id IS NOT NULL THEN
    IF t.encerramento_operacao_id<>p_operacao_id THEN RAISE EXCEPTION 'OPERACAO_CONFLITANTE'; END IF;
    RETURN private.projetar_tentativa(t);
  END IF;
  IF p.status<>'aguardando_pagamento' OR p.pago_em IS NOT NULL OR t.estado IN ('confirmado','recebido') THEN RAISE EXCEPTION 'PEDIDO_NAO_PAGAVEL'; END IF;
  IF t.estado='criando' AND t.asaas_payment_id IS NULL AND t.claim_token IS NOT NULL AND t.claim_expira_em>now()
    THEN RAISE EXCEPTION 'TENTATIVA_CRIANDO'; END IF;
  -- Revoga o worker anterior. Uma resposta atrasada de criação/QR não pode reabrir a tentativa.
  UPDATE public.tentativas_pagamento SET encerramento_operacao_id=p_operacao_id,claim_token=gen_random_uuid(),
    estado=CASE WHEN encerrada_em IS NULL THEN 'reconciliacao' ELSE estado END
    WHERE id=t.id RETURNING * INTO t;
  RETURN private.projetar_tentativa(t);
END;
$$;
CREATE FUNCTION public.claim_encerramento_tentativa(p_tentativa_id uuid,p_operacao_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.pedidos%ROWTYPE; t public.tentativas_pagamento%ROWTYPE; total bigint; acquired boolean:=false;
BEGIN
  SELECT p1.* INTO p FROM public.pedidos p1 JOIN public.tentativas_pagamento t1 ON t1.pedido_id=p1.id
    WHERE t1.id=p_tentativa_id FOR UPDATE OF p1;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENTATIVA_NAO_ENCONTRADA'; END IF;
  SELECT * INTO STRICT t FROM public.tentativas_pagamento WHERE id=p_tentativa_id FOR UPDATE;
  IF p_operacao_id IS NULL OR t.encerramento_operacao_id IS DISTINCT FROM p_operacao_id THEN RAISE EXCEPTION 'OPERACAO_CONFLITANTE'; END IF;
  SELECT total_centavos INTO total FROM private.cotacoes WHERE id=p.cotacao_id;
  IF t.encerrada_em IS NULL THEN
    IF p.status<>'aguardando_pagamento' OR p.pago_em IS NOT NULL OR t.estado IN ('confirmado','recebido') THEN RAISE EXCEPTION 'PEDIDO_NAO_PAGAVEL'; END IF;
    IF t.encerramento_claim_token IS NULL OR t.encerramento_claim_expira_em<=now() THEN
      UPDATE public.tentativas_pagamento SET encerramento_claim_token=gen_random_uuid(),encerramento_claim_expira_em=now()+interval '2 minutes'
      WHERE id=t.id RETURNING * INTO t;
      acquired:=true;
    END IF;
  END IF;
  RETURN jsonb_build_object('attempt',to_jsonb(t),'total_centavos',total,'acquired',acquired,'claim_token',t.encerramento_claim_token);
END;
$$;
CREATE FUNCTION public.registrar_incerteza_encerramento(p_tentativa_id uuid,p_claim_token uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tentativas_pagamento%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.pedidos p JOIN public.tentativas_pagamento a ON a.pedido_id=p.id WHERE a.id=p_tentativa_id FOR UPDATE OF p;
  SELECT * INTO STRICT t FROM public.tentativas_pagamento WHERE id=p_tentativa_id FOR UPDATE;
  IF p_claim_token IS NULL OR t.encerramento_claim_token IS DISTINCT FROM p_claim_token THEN RAISE EXCEPTION 'CLAIM_INVALIDO'; END IF;
  IF t.encerrada_em IS NULL AND t.estado NOT IN ('confirmado','recebido') THEN
    UPDATE public.tentativas_pagamento SET estado='reconciliacao',encerramento_claim_expira_em=now() WHERE id=t.id;
  END IF;
END;
$$;
CREATE FUNCTION public.concluir_encerramento_tentativa(p_tentativa_id uuid,p_claim_token uuid,p_confirmacao jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.pedidos%ROWTYPE; t public.tentativas_pagamento%ROWTYPE; total bigint;
BEGIN
  SELECT p1.* INTO p FROM public.pedidos p1 JOIN public.tentativas_pagamento t1 ON t1.pedido_id=p1.id
    WHERE t1.id=p_tentativa_id FOR UPDATE OF p1;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENTATIVA_NAO_ENCONTRADA'; END IF;
  SELECT * INTO STRICT t FROM public.tentativas_pagamento WHERE id=p_tentativa_id FOR UPDATE;
  IF p_claim_token IS NULL OR t.encerramento_claim_token IS DISTINCT FROM p_claim_token THEN RAISE EXCEPTION 'CLAIM_INVALIDO'; END IF;
  IF t.encerrada_em IS NOT NULL THEN RETURN private.projetar_tentativa(t); END IF;
  IF p.status<>'aguardando_pagamento' OR p.pago_em IS NOT NULL OR t.estado IN ('confirmado','recebido') THEN RAISE EXCEPTION 'PEDIDO_NAO_PAGAVEL'; END IF;
  SELECT total_centavos INTO total FROM private.cotacoes WHERE id=p.cotacao_id;
  IF NOT coalesce(jsonb_typeof(p_confirmacao)='object'
    AND p_confirmacao->'deleted'='true'::jsonb AND length(p_confirmacao->>'id')>0
    AND (t.asaas_payment_id IS NULL OR t.asaas_payment_id=p_confirmacao->>'id')
    AND p_confirmacao->>'externalReference'=t.id::text
    AND p_confirmacao->>'billingType'=CASE WHEN t.forma='pix' THEN 'PIX' ELSE 'CREDIT_CARD' END
    AND jsonb_typeof(p_confirmacao->'value')='number' AND (p_confirmacao->>'value')::numeric*100=total
    AND p_confirmacao->>'status' IN ('PENDING','OVERDUE')
    AND p_confirmacao->>'paymentDate' IS NULL AND p_confirmacao->>'clientPaymentDate' IS NULL,false)
  THEN RAISE EXCEPTION 'ENCERRAMENTO_NAO_CONFIRMADO'; END IF;
  UPDATE public.tentativas_pagamento SET estado='expirado',encerrada_em=now(),asaas_payment_id=p_confirmacao->>'id',
    qr_code_pix=NULL,pix_copia_e_cola=NULL,encerramento_claim_expira_em=NULL,
    encerramento_confirmacao=jsonb_build_object('id',p_confirmacao->>'id','deleted',true,'status',p_confirmacao->>'status',
      'value',p_confirmacao->'value','billingType',p_confirmacao->>'billingType','externalReference',p_confirmacao->>'externalReference')
  WHERE id=t.id RETURNING * INTO t;
  UPDATE public.pedidos SET asaas_payment_id=NULL,qr_code_pix=NULL,pix_copia_e_cola=NULL WHERE id=t.pedido_id;
  RETURN private.projetar_tentativa(t);
END;
$$;
REVOKE ALL ON FUNCTION public.preparar_encerramento_tentativa(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preparar_encerramento_tentativa(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_encerramento_tentativa(uuid,uuid),public.registrar_incerteza_encerramento(uuid,uuid),public.concluir_encerramento_tentativa(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_encerramento_tentativa(uuid,uuid),public.registrar_incerteza_encerramento(uuid,uuid),public.concluir_encerramento_tentativa(uuid,uuid,jsonb) TO service_role;
COMMIT;
