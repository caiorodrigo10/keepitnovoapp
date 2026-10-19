-- Durable, server-only state for saved-card payment/profile operations.
-- No PAN, CVV, holder data or gateway responses are persisted here.
CREATE TABLE private.cartoes_operacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  operacao_id uuid NOT NULL,
  contexto text NOT NULL CHECK (contexto IN ('compra', 'perfil')),
  tentativa_id uuid REFERENCES public.tentativas_pagamento(id) ON DELETE RESTRICT,
  ambiente text NOT NULL CHECK (ambiente IN ('sandbox', 'producao')),
  asaas_customer_id text,
  salvar_cartao boolean NOT NULL,
  cartao_salvo_id uuid REFERENCES public.clientes_cartoes(id) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'preparada' CHECK (estado IN ('preparada', 'processando', 'reconciliacao', 'concluida', 'recusada', 'invalidada')),
  claim_token uuid,
  claim_expira_em timestamptz,
  asaas_payment_id text,
  token_temporario text,
  bandeira_temporaria text,
  ultimo4_temporario text CHECK (ultimo4_temporario IS NULL OR ultimo4_temporario ~ '^[0-9]{4}$'),
  aviso_codigo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, operacao_id),
  UNIQUE (operacao_id),
  UNIQUE (ambiente, asaas_payment_id),
  CHECK ((contexto = 'compra') = (tentativa_id IS NOT NULL))
);
CREATE INDEX cartoes_operacoes_cliente_idx ON private.cartoes_operacoes(cliente_id, created_at DESC);
ALTER TABLE private.cartoes_operacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.cartoes_operacoes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.cartoes_operacoes FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.cartoes_operacoes TO service_role;

CREATE FUNCTION private.exigir_cliente_cartao_ativo(p_cliente_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_cliente_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.clientes WHERE id=p_cliente_id) THEN
    RAISE EXCEPTION 'CLIENTE_INDISPONIVEL';
  END IF;
  IF EXISTS (SELECT 1 FROM public.account_deletion_requests
             WHERE user_id=p_cliente_id AND status IN ('scheduled','processing')) THEN
    RAISE EXCEPTION 'CONTA_EM_EXCLUSAO';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.exigir_cliente_cartao_ativo(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.projetar_operacao_cartao(p private.cartoes_operacoes) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id',p.id,'estado',p.estado,'salvarCartao',p.salvar_cartao,'avisoCodigo',p.aviso_codigo)
$$;
REVOKE ALL ON FUNCTION private.projetar_operacao_cartao(private.cartoes_operacoes) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.registrar_operacao_cartao(
  p_cliente_id uuid, p_tentativa_id uuid, p_operacao_id uuid, p_contexto text,
  p_ambiente text, p_salvar_cartao boolean, p_cartao_salvo_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_op private.cartoes_operacoes%ROWTYPE; v_customer text;
BEGIN
  PERFORM private.exigir_cliente_cartao_ativo(p_cliente_id);
  IF p_operacao_id IS NULL OR p_contexto NOT IN ('compra','perfil') OR p_ambiente NOT IN ('sandbox','producao')
    OR p_salvar_cartao IS NULL OR ((p_contexto='compra') IS DISTINCT FROM (p_tentativa_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'OPERACAO_INVALIDA';
  END IF;
  -- Serializes an absent-row replay before INSERT, avoiding a unique violation
  -- for two deliveries of the same operation on the same customer.
  PERFORM 1 FROM public.clientes WHERE id=p_cliente_id FOR UPDATE;
  SELECT * INTO v_op FROM private.cartoes_operacoes WHERE cliente_id=p_cliente_id AND operacao_id=p_operacao_id FOR UPDATE;
  IF FOUND THEN
    IF v_op.tentativa_id IS DISTINCT FROM p_tentativa_id OR v_op.contexto IS DISTINCT FROM p_contexto
       OR v_op.ambiente IS DISTINCT FROM p_ambiente OR v_op.salvar_cartao IS DISTINCT FROM p_salvar_cartao
       OR v_op.cartao_salvo_id IS DISTINCT FROM p_cartao_salvo_id THEN
      RAISE EXCEPTION 'OPERACAO_DIVERGENTE';
    END IF;
    RETURN private.projetar_operacao_cartao(v_op);
  END IF;
  IF p_tentativa_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tentativas_pagamento WHERE id=p_tentativa_id AND cliente_id=p_cliente_id AND forma='cartao'
  ) THEN RAISE EXCEPTION 'TENTATIVA_INDISPONIVEL'; END IF;
  IF p_cartao_salvo_id IS NOT NULL THEN
    SELECT asaas_customer_id INTO v_customer FROM public.clientes_cartoes
      WHERE id=p_cartao_salvo_id AND cliente_id=p_cliente_id AND ambiente=p_ambiente;
    IF NOT FOUND THEN RAISE EXCEPTION 'CARTAO_INDISPONIVEL'; END IF;
  END IF;
  INSERT INTO private.cartoes_operacoes(cliente_id,operacao_id,contexto,tentativa_id,ambiente,asaas_customer_id,salvar_cartao,cartao_salvo_id)
  VALUES(p_cliente_id,p_operacao_id,p_contexto,p_tentativa_id,p_ambiente,v_customer,p_salvar_cartao,p_cartao_salvo_id)
  RETURNING * INTO v_op;
  RETURN private.projetar_operacao_cartao(v_op);
END;
$$;
REVOKE ALL ON FUNCTION private.registrar_operacao_cartao(uuid,uuid,uuid,text,text,boolean,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.registrar_operacao_cartao(uuid,uuid,uuid,text,text,boolean,uuid) TO service_role;

CREATE FUNCTION private.obter_cartao_operacao(p_cliente_id uuid,p_cartao_id uuid,p_ambiente text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.clientes_cartoes%ROWTYPE;
BEGIN
  PERFORM private.exigir_cliente_cartao_ativo(p_cliente_id);
  SELECT * INTO c FROM public.clientes_cartoes WHERE id=p_cartao_id AND cliente_id=p_cliente_id AND ambiente=p_ambiente;
  IF NOT FOUND THEN RAISE EXCEPTION 'CARTAO_INDISPONIVEL'; END IF;
  RETURN jsonb_build_object('id',c.id,'customerId',c.asaas_customer_id,'token',c.asaas_credit_card_token,'bandeira',c.bandeira,'ultimo4',c.ultimo4);
END;
$$;
REVOKE ALL ON FUNCTION private.obter_cartao_operacao(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.obter_cartao_operacao(uuid,uuid,text) TO service_role;

CREATE FUNCTION private.salvar_token_operacao(p_operacao_id uuid,p_customer_id text,p_token text,p_bandeira text,p_ultimo4 text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_op private.cartoes_operacoes%ROWTYPE;
BEGIN
  SELECT * INTO v_op FROM private.cartoes_operacoes WHERE operacao_id=p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPERACAO_INDISPONIVEL'; END IF;
  PERFORM private.exigir_cliente_cartao_ativo(v_op.cliente_id);
  IF NOT v_op.salvar_cartao THEN RAISE EXCEPTION 'SALVAMENTO_NAO_AUTORIZADO'; END IF;
  IF p_customer_id IS NULL OR length(btrim(p_customer_id))=0 OR p_token IS NULL OR length(btrim(p_token))=0
    OR p_bandeira IS NULL OR length(btrim(p_bandeira))=0 OR p_ultimo4 !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'METADADOS_INVALIDOS'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private.clientes_asaas WHERE cliente_id=v_op.cliente_id AND ambiente=v_op.ambiente
                 AND asaas_customer_id=p_customer_id AND estado='pronto') THEN RAISE EXCEPTION 'CUSTOMER_DIVERGENTE'; END IF;
  IF v_op.asaas_customer_id IS NOT NULL AND v_op.asaas_customer_id<>p_customer_id THEN RAISE EXCEPTION 'CUSTOMER_DIVERGENTE'; END IF;
  IF v_op.token_temporario IS NOT NULL AND (v_op.token_temporario<>p_token OR v_op.bandeira_temporaria<>p_bandeira OR v_op.ultimo4_temporario<>p_ultimo4)
  THEN RAISE EXCEPTION 'OPERACAO_DIVERGENTE'; END IF;
  UPDATE private.cartoes_operacoes SET asaas_customer_id=p_customer_id,token_temporario=p_token,bandeira_temporaria=p_bandeira,ultimo4_temporario=p_ultimo4,updated_at=now()
    WHERE id=v_op.id RETURNING * INTO v_op;
  RETURN private.projetar_operacao_cartao(v_op);
END;
$$;
REVOKE ALL ON FUNCTION private.salvar_token_operacao(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.salvar_token_operacao(uuid,text,text,text,text) TO service_role;

CREATE FUNCTION private.invalidar_cartao_operacao(p_cliente_id uuid,p_cartao_id uuid,p_operacao_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_op private.cartoes_operacoes%ROWTYPE;
BEGIN
  PERFORM private.exigir_cliente_cartao_ativo(p_cliente_id);
  SELECT * INTO v_op FROM private.cartoes_operacoes WHERE cliente_id=p_cliente_id AND operacao_id=p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPERACAO_INDISPONIVEL'; END IF;
  IF p_cartao_id IS NULL OR v_op.cartao_salvo_id IS DISTINCT FROM p_cartao_id THEN RAISE EXCEPTION 'OPERACAO_DIVERGENTE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes_cartoes WHERE id=p_cartao_id AND cliente_id=p_cliente_id AND ambiente=v_op.ambiente) THEN RAISE EXCEPTION 'CARTAO_INDISPONIVEL'; END IF;
  DELETE FROM public.clientes_cartoes WHERE id=p_cartao_id AND cliente_id=p_cliente_id AND ambiente=v_op.ambiente;
  UPDATE private.cartoes_operacoes SET estado='invalidada',aviso_codigo='CARTAO_INVALIDADO',updated_at=now() WHERE id=v_op.id RETURNING * INTO v_op;
  RETURN private.projetar_operacao_cartao(v_op);
END;
$$;
REVOKE ALL ON FUNCTION private.invalidar_cartao_operacao(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.invalidar_cartao_operacao(uuid,uuid,uuid) TO service_role;

CREATE FUNCTION private.claim_cliente_asaas(p_cliente_id uuid,p_ambiente text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row private.clientes_asaas%ROWTYPE;
BEGIN
  PERFORM private.exigir_cliente_cartao_ativo(p_cliente_id);
  IF p_ambiente NOT IN ('sandbox','producao') THEN RAISE EXCEPTION 'AMBIENTE_INVALIDO'; END IF;
  PERFORM 1 FROM public.clientes WHERE id=p_cliente_id FOR UPDATE;
  SELECT * INTO v_row FROM private.clientes_asaas WHERE cliente_id=p_cliente_id AND ambiente=p_ambiente FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO private.clientes_asaas(cliente_id,ambiente,estado,claim_token,claim_expira_em)
    VALUES(p_cliente_id,p_ambiente,'criando',gen_random_uuid(),now()+interval '2 minutes') RETURNING * INTO v_row;
    RETURN jsonb_build_object('estado','criando','acquired',true,'claimToken',v_row.claim_token);
  END IF;
  IF v_row.estado='pronto' AND v_row.asaas_customer_id IS NOT NULL THEN
    RETURN jsonb_build_object('estado','pronto','acquired',false,'customerId',v_row.asaas_customer_id);
  END IF;
  IF v_row.estado='criando' AND v_row.claim_expira_em > now() THEN
    RETURN jsonb_build_object('estado','criando','acquired',false);
  END IF;
  IF v_row.estado='criando' THEN
    UPDATE private.clientes_asaas SET estado='reconciliacao',claim_token=NULL,claim_expira_em=now(),updated_at=now()
      WHERE cliente_id=p_cliente_id AND ambiente=p_ambiente RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object('estado',v_row.estado,'acquired',false);
END;
$$;
REVOKE ALL ON FUNCTION private.claim_cliente_asaas(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.claim_cliente_asaas(uuid,text) TO service_role;

CREATE FUNCTION private.finalizar_cliente_asaas(p_cliente_id uuid,p_ambiente text,p_claim_token uuid,p_customer_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row private.clientes_asaas%ROWTYPE;
BEGIN
  IF p_customer_id IS NULL OR length(btrim(p_customer_id))=0 THEN RAISE EXCEPTION 'CUSTOMER_INVALIDO'; END IF;
  SELECT * INTO v_row FROM private.clientes_asaas WHERE cliente_id=p_cliente_id AND ambiente=p_ambiente FOR UPDATE;
  IF NOT FOUND OR v_row.estado<>'criando' OR v_row.claim_token IS DISTINCT FROM p_claim_token THEN RAISE EXCEPTION 'CLAIM_INVALIDO'; END IF;
  UPDATE private.clientes_asaas SET asaas_customer_id=p_customer_id,estado='pronto',claim_token=NULL,claim_expira_em=NULL,updated_at=now()
    WHERE cliente_id=p_cliente_id AND ambiente=p_ambiente RETURNING * INTO v_row;
  RETURN jsonb_build_object('customerId',v_row.asaas_customer_id);
END;
$$;
REVOKE ALL ON FUNCTION private.finalizar_cliente_asaas(uuid,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.finalizar_cliente_asaas(uuid,text,uuid,text) TO service_role;

CREATE FUNCTION private.marcar_cliente_asaas_reconciliacao(p_cliente_id uuid,p_ambiente text,p_claim_token uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE private.clientes_asaas SET estado='reconciliacao',claim_token=NULL,claim_expira_em=now(),updated_at=now()
   WHERE cliente_id=p_cliente_id AND ambiente=p_ambiente AND (p_claim_token IS NULL OR claim_token=p_claim_token);
END;
$$;
REVOKE ALL ON FUNCTION private.marcar_cliente_asaas_reconciliacao(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.marcar_cliente_asaas_reconciliacao(uuid,text,uuid) TO service_role;

CREATE FUNCTION private.obter_cliente_cartao(p_cliente_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN c.id IS NULL OR c.cpf IS NULL OR length(btrim(c.cpf))=0 THEN NULL
    ELSE jsonb_build_object('id',c.id,'nome',c.nome,'cpf',c.cpf) END
  FROM public.clientes c WHERE c.id=p_cliente_id
$$;
REVOKE ALL ON FUNCTION private.obter_cliente_cartao(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.obter_cliente_cartao(uuid) TO service_role;

CREATE FUNCTION private.vincular_cliente_asaas_recuperado(p_cliente_id uuid,p_ambiente text,p_customer_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row private.clientes_asaas%ROWTYPE;
BEGIN
  PERFORM private.exigir_cliente_cartao_ativo(p_cliente_id);
  IF p_customer_id IS NULL OR length(btrim(p_customer_id))=0 THEN RAISE EXCEPTION 'CUSTOMER_INVALIDO'; END IF;
  SELECT * INTO v_row FROM private.clientes_asaas WHERE cliente_id=p_cliente_id AND ambiente=p_ambiente FOR UPDATE;
  IF NOT FOUND OR v_row.estado NOT IN ('criando','reconciliacao') OR v_row.asaas_customer_id IS NOT NULL THEN RAISE EXCEPTION 'CUSTOMER_DIVERGENTE'; END IF;
  UPDATE private.clientes_asaas SET asaas_customer_id=p_customer_id,estado='pronto',claim_token=NULL,claim_expira_em=NULL,updated_at=now()
    WHERE cliente_id=p_cliente_id AND ambiente=p_ambiente RETURNING * INTO v_row;
  RETURN jsonb_build_object('customerId',v_row.asaas_customer_id);
END;
$$;
REVOKE ALL ON FUNCTION private.vincular_cliente_asaas_recuperado(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.vincular_cliente_asaas_recuperado(uuid,text,text) TO service_role;

-- PostgREST exposes only public.  These narrow wrappers are the Edge Function
-- RPC surface; all storage and implementation remain private and every entry
-- point is executable only by service_role.
CREATE FUNCTION public.registrar_operacao_cartao_service(p_cliente_id uuid,p_tentativa_id uuid,p_operacao_id uuid,p_contexto text,p_ambiente text,p_salvar_cartao boolean,p_cartao_salvo_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.registrar_operacao_cartao(p_cliente_id,p_tentativa_id,p_operacao_id,p_contexto,p_ambiente,p_salvar_cartao,p_cartao_salvo_id)
$$;
CREATE FUNCTION public.obter_cartao_operacao_service(p_cliente_id uuid,p_cartao_id uuid,p_ambiente text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.obter_cartao_operacao(p_cliente_id,p_cartao_id,p_ambiente)
$$;
CREATE FUNCTION public.salvar_token_operacao_service(p_operacao_id uuid,p_customer_id text,p_token text,p_bandeira text,p_ultimo4 text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.salvar_token_operacao(p_operacao_id,p_customer_id,p_token,p_bandeira,p_ultimo4)
$$;
CREATE FUNCTION public.invalidar_cartao_operacao_service(p_cliente_id uuid,p_cartao_id uuid,p_operacao_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.invalidar_cartao_operacao(p_cliente_id,p_cartao_id,p_operacao_id)
$$;
CREATE FUNCTION public.claim_cliente_asaas_service(p_cliente_id uuid,p_ambiente text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.claim_cliente_asaas(p_cliente_id,p_ambiente)
$$;
CREATE FUNCTION public.finalizar_cliente_asaas_service(p_cliente_id uuid,p_ambiente text,p_claim_token uuid,p_customer_id text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.finalizar_cliente_asaas(p_cliente_id,p_ambiente,p_claim_token,p_customer_id)
$$;
CREATE FUNCTION public.marcar_cliente_asaas_reconciliacao_service(p_cliente_id uuid,p_ambiente text,p_claim_token uuid DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.marcar_cliente_asaas_reconciliacao(p_cliente_id,p_ambiente,p_claim_token)
$$;
CREATE FUNCTION public.obter_cliente_cartao_service(p_cliente_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.obter_cliente_cartao(p_cliente_id)
$$;
CREATE FUNCTION public.vincular_cliente_asaas_recuperado_service(p_cliente_id uuid,p_ambiente text,p_customer_id text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.vincular_cliente_asaas_recuperado(p_cliente_id,p_ambiente,p_customer_id)
$$;
REVOKE ALL ON FUNCTION public.registrar_operacao_cartao_service(uuid,uuid,uuid,text,text,boolean,uuid),
  public.obter_cartao_operacao_service(uuid,uuid,text), public.salvar_token_operacao_service(uuid,text,text,text,text),
  public.invalidar_cartao_operacao_service(uuid,uuid,uuid), public.claim_cliente_asaas_service(uuid,text),
  public.finalizar_cliente_asaas_service(uuid,text,uuid,text), public.marcar_cliente_asaas_reconciliacao_service(uuid,text,uuid),
  public.obter_cliente_cartao_service(uuid), public.vincular_cliente_asaas_recuperado_service(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_operacao_cartao_service(uuid,uuid,uuid,text,text,boolean,uuid),
  public.obter_cartao_operacao_service(uuid,uuid,text), public.salvar_token_operacao_service(uuid,text,text,text,text),
  public.invalidar_cartao_operacao_service(uuid,uuid,uuid), public.claim_cliente_asaas_service(uuid,text),
  public.finalizar_cliente_asaas_service(uuid,text,uuid,text), public.marcar_cliente_asaas_reconciliacao_service(uuid,text,uuid),
  public.obter_cliente_cartao_service(uuid), public.vincular_cliente_asaas_recuperado_service(uuid,text,text) TO service_role;
