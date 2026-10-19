-- Persists only the explicit choice and sanitized card metadata. Gateway calls
-- stay in the Edge Function; webhook/reconciliation remains financially authoritative.
ALTER TABLE public.tentativas_pagamento ADD COLUMN aviso_cartao text
  CHECK (aviso_cartao IS NULL OR aviso_cartao='nao_salvo');
ALTER TABLE private.cartoes_operacoes ADD COLUMN resposta_cobranca_perdida boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION private.projetar_tentativa(t public.tentativas_pagamento) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',t.id,'pedidoId',t.pedido_id,'estado',t.estado,'operacaoId',t.operacao_id)
   || CASE WHEN t.aviso_cartao IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('avisoCartao',t.aviso_cartao) END
   || CASE WHEN t.qr_code_pix IS NOT NULL AND t.pix_copia_e_cola IS NOT NULL THEN jsonb_build_object('pix',jsonb_build_object('imagemBase64',t.qr_code_pix,'copiaCola',t.pix_copia_e_cola,'expiraEm',t.expira_em)) ELSE '{}'::jsonb END
$$;

CREATE FUNCTION private.finalizar_compra_cartao(p_operacao_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op private.cartoes_operacoes%ROWTYPE; v_attempt public.tentativas_pagamento%ROWTYPE; v_tentativa_id uuid;
BEGIN
  -- Every caller locks attempt → operation. The webhook already owns the
  -- attempt lock; token persistence acquires it before the operation lock.
  SELECT tentativa_id INTO v_tentativa_id FROM private.cartoes_operacoes WHERE operacao_id=p_operacao_id;
  IF v_tentativa_id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_attempt FROM public.tentativas_pagamento WHERE id=v_tentativa_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_op FROM private.cartoes_operacoes WHERE operacao_id=p_operacao_id FOR UPDATE;
  IF NOT FOUND OR v_op.contexto<>'compra' OR v_op.estado IN ('concluida','recusada','invalidada') THEN RETURN; END IF;
  IF v_attempt.estado IN ('recusado','expirado') THEN
    UPDATE private.cartoes_operacoes SET estado='recusada',token_temporario=NULL,bandeira_temporaria=NULL,ultimo4_temporario=NULL,updated_at=now() WHERE id=v_op.id;
    RETURN;
  END IF;
  IF v_attempt.estado NOT IN ('confirmado','recebido') THEN RETURN; END IF;
  -- The webhook can arrive before the HTTP response yields token metadata.
  -- Only the explicit missing-token path may close this operation with warning.
  IF NOT v_op.salvar_cartao OR v_op.token_temporario IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM public.clientes WHERE id=v_op.cliente_id FOR UPDATE;
  INSERT INTO public.clientes_cartoes(cliente_id,ambiente,asaas_customer_id,asaas_credit_card_token,bandeira,ultimo4)
  VALUES(v_op.cliente_id,v_op.ambiente,v_op.asaas_customer_id,v_op.token_temporario,v_op.bandeira_temporaria,v_op.ultimo4_temporario)
  ON CONFLICT (cliente_id,ambiente,asaas_customer_id,asaas_credit_card_token) DO NOTHING;
  -- Closing and clearing state makes deletion final: a replay cannot recreate it.
  UPDATE private.cartoes_operacoes SET estado='concluida',token_temporario=NULL,bandeira_temporaria=NULL,ultimo4_temporario=NULL,updated_at=now() WHERE id=v_op.id;
END;
$$;
REVOKE ALL ON FUNCTION private.finalizar_compra_cartao(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.finalizar_compra_cartao_tentativa() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_operacao uuid;
BEGIN
  IF NEW.estado NOT IN ('confirmado','recebido','recusado','expirado') THEN RETURN NEW; END IF;
  SELECT operacao_id INTO v_operacao FROM private.cartoes_operacoes WHERE tentativa_id=NEW.id;
  IF v_operacao IS NOT NULL THEN PERFORM private.finalizar_compra_cartao(v_operacao); END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.finalizar_compra_cartao_tentativa() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER finalizar_compra_cartao_tentativa AFTER UPDATE OF estado ON public.tentativas_pagamento
  FOR EACH ROW EXECUTE FUNCTION private.finalizar_compra_cartao_tentativa();

CREATE OR REPLACE FUNCTION private.salvar_token_operacao(p_operacao_id uuid,p_customer_id text,p_token text,p_bandeira text,p_ultimo4 text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op private.cartoes_operacoes%ROWTYPE; v_tentativa_id uuid;
BEGIN
  SELECT tentativa_id INTO v_tentativa_id FROM private.cartoes_operacoes WHERE operacao_id=p_operacao_id;
  IF v_tentativa_id IS NULL THEN RAISE EXCEPTION 'OPERACAO_INDISPONIVEL'; END IF;
  PERFORM 1 FROM public.tentativas_pagamento WHERE id=v_tentativa_id FOR UPDATE;
  SELECT * INTO v_op FROM private.cartoes_operacoes WHERE operacao_id=p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPERACAO_INDISPONIVEL'; END IF;
  PERFORM private.exigir_cliente_cartao_ativo(v_op.cliente_id);
  IF NOT v_op.salvar_cartao THEN RAISE EXCEPTION 'SALVAMENTO_NAO_AUTORIZADO'; END IF;
  IF v_op.estado IN ('recusada','invalidada') THEN RAISE EXCEPTION 'OPERACAO_ENCERRADA'; END IF;
  IF v_op.estado='concluida' THEN RETURN private.projetar_operacao_cartao(v_op); END IF;
  IF p_customer_id IS NULL OR length(btrim(p_customer_id))=0 OR p_token IS NULL OR length(btrim(p_token))=0 OR p_bandeira IS NULL OR length(btrim(p_bandeira))=0 OR p_ultimo4 !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'METADADOS_INVALIDOS'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private.clientes_asaas WHERE cliente_id=v_op.cliente_id AND ambiente=v_op.ambiente AND asaas_customer_id=p_customer_id AND estado='pronto') OR (v_op.asaas_customer_id IS NOT NULL AND v_op.asaas_customer_id<>p_customer_id) THEN RAISE EXCEPTION 'CUSTOMER_DIVERGENTE'; END IF;
  IF v_op.token_temporario IS NOT NULL AND (v_op.token_temporario<>p_token OR v_op.bandeira_temporaria<>p_bandeira OR v_op.ultimo4_temporario<>p_ultimo4) THEN RAISE EXCEPTION 'OPERACAO_DIVERGENTE'; END IF;
  UPDATE private.cartoes_operacoes SET estado='processando',asaas_customer_id=p_customer_id,token_temporario=p_token,bandeira_temporaria=p_bandeira,ultimo4_temporario=p_ultimo4,updated_at=now() WHERE id=v_op.id;
  PERFORM private.finalizar_compra_cartao(p_operacao_id);
  SELECT * INTO v_op FROM private.cartoes_operacoes WHERE id=v_op.id;
  RETURN private.projetar_operacao_cartao(v_op);
END;
$$;

CREATE FUNCTION private.marcar_cartao_nao_salvo(p_operacao_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op private.cartoes_operacoes%ROWTYPE; v_tentativa_id uuid;
BEGIN
  SELECT tentativa_id INTO v_tentativa_id FROM private.cartoes_operacoes WHERE operacao_id=p_operacao_id;
  IF v_tentativa_id IS NULL THEN RAISE EXCEPTION 'OPERACAO_INDISPONIVEL'; END IF;
  PERFORM 1 FROM public.tentativas_pagamento WHERE id=v_tentativa_id FOR UPDATE;
  SELECT * INTO v_op FROM private.cartoes_operacoes WHERE operacao_id=p_operacao_id FOR UPDATE;
  IF NOT FOUND OR v_op.contexto<>'compra' OR NOT v_op.salvar_cartao THEN RAISE EXCEPTION 'OPERACAO_INDISPONIVEL'; END IF;
  -- A timed-out RPC may already have committed the token. Never turn that
  -- recoverable response loss into a false public "not saved" warning.
  IF v_op.token_temporario IS NOT NULL OR v_op.estado='concluida' THEN RETURN private.projetar_operacao_cartao(v_op); END IF;
  UPDATE private.cartoes_operacoes SET estado='concluida',aviso_codigo='nao_salvo',updated_at=now() WHERE id=v_op.id RETURNING * INTO v_op;
  UPDATE public.tentativas_pagamento SET aviso_cartao='nao_salvo' WHERE id=v_op.tentativa_id;
  RETURN private.projetar_operacao_cartao(v_op);
END;
$$;
CREATE FUNCTION public.marcar_cartao_nao_salvo_service(p_operacao_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.marcar_cartao_nao_salvo(p_operacao_id) $$;
REVOKE ALL ON FUNCTION private.marcar_cartao_nao_salvo(uuid),public.marcar_cartao_nao_salvo_service(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.marcar_cartao_nao_salvo(uuid),public.marcar_cartao_nao_salvo_service(uuid) TO service_role;

CREATE FUNCTION private.marcar_resposta_cobranca_perdida(p_operacao_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op private.cartoes_operacoes%ROWTYPE; v_tentativa_id uuid;
BEGIN
  SELECT tentativa_id INTO v_tentativa_id FROM private.cartoes_operacoes WHERE operacao_id=p_operacao_id;
  IF v_tentativa_id IS NULL THEN RAISE EXCEPTION 'OPERACAO_INDISPONIVEL'; END IF;
  PERFORM 1 FROM public.tentativas_pagamento WHERE id=v_tentativa_id FOR UPDATE;
  SELECT * INTO v_op FROM private.cartoes_operacoes WHERE operacao_id=p_operacao_id FOR UPDATE;
  IF NOT FOUND OR v_op.contexto<>'compra' OR NOT v_op.salvar_cartao OR v_op.estado IN ('concluida','recusada','invalidada') THEN
    RAISE EXCEPTION 'OPERACAO_INDISPONIVEL';
  END IF;
  UPDATE private.cartoes_operacoes SET resposta_cobranca_perdida=true,updated_at=now() WHERE id=v_op.id RETURNING * INTO v_op;
  RETURN private.projetar_operacao_cartao(v_op);
END;
$$;
CREATE FUNCTION public.marcar_resposta_cobranca_perdida_service(p_operacao_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.marcar_resposta_cobranca_perdida(p_operacao_id) $$;
REVOKE ALL ON FUNCTION private.marcar_resposta_cobranca_perdida(uuid),public.marcar_resposta_cobranca_perdida_service(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.marcar_resposta_cobranca_perdida(uuid),public.marcar_resposta_cobranca_perdida_service(uuid) TO service_role;

-- Reconciliation is the only later path that can establish a create-response
-- loss as final. It deliberately resolves by attempt (not by user input).
CREATE FUNCTION private.marcar_cartao_nao_salvo_reconciliacao(p_tentativa_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_operacao_id uuid;
BEGIN
  SELECT operacao_id INTO v_operacao_id FROM private.cartoes_operacoes
    WHERE tentativa_id=p_tentativa_id AND contexto='compra' AND salvar_cartao=true
      AND resposta_cobranca_perdida=true;
  IF v_operacao_id IS NULL THEN RETURN NULL; END IF;
  RETURN private.marcar_cartao_nao_salvo(v_operacao_id);
END;
$$;
CREATE FUNCTION public.marcar_cartao_nao_salvo_reconciliacao_service(p_tentativa_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.marcar_cartao_nao_salvo_reconciliacao(p_tentativa_id) $$;
REVOKE ALL ON FUNCTION private.marcar_cartao_nao_salvo_reconciliacao(uuid),public.marcar_cartao_nao_salvo_reconciliacao_service(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.marcar_cartao_nao_salvo_reconciliacao(uuid),public.marcar_cartao_nao_salvo_reconciliacao_service(uuid) TO service_role;
