-- Task 7.  Timestamp 112000 was already applied by the Task 6 incremental
-- migration, therefore this is deliberately a later, additive migration.
-- PAN/CVV and holder information never enter this ledger.
CREATE TABLE private.validacoes_cartoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  operacao_id uuid NOT NULL UNIQUE,
  ambiente text NOT NULL CHECK (ambiente IN ('sandbox','producao')),
  valor_centavos integer NOT NULL CHECK (valor_centavos > 0),
  referencia_externa text NOT NULL UNIQUE,
  asaas_customer_id text,
  token_temporario text,
  bandeira_temporaria text,
  ultimo4_temporario text CHECK (ultimo4_temporario IS NULL OR ultimo4_temporario ~ '^[0-9]{4}$'),
  asaas_cobranca_id text UNIQUE,
  asaas_estorno_id text,
  valor_estornado_centavos integer,
  estorno_confirmado boolean NOT NULL DEFAULT false,
  estado text NOT NULL DEFAULT 'preparada' CHECK (estado IN ('preparada','tokenizado','validando','estorno_pendente','concluida','recusada','reconciliacao')),
  claim_etapa text CHECK (claim_etapa IN ('tokenizar','cobrar','estornar','finalizar')),
  claim_token uuid,
  claim_expira_em timestamptz,
  erro_seguro text CHECK (erro_seguro IS NULL OR erro_seguro IN ('RECUSADA','RECONCILIACAO')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX validacoes_cartoes_uma_ativa_cliente_idx ON private.validacoes_cartoes(cliente_id)
  WHERE estado NOT IN ('concluida','recusada');
ALTER TABLE private.validacoes_cartoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.validacoes_cartoes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.validacoes_cartoes FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.validacoes_cartoes TO service_role;

CREATE FUNCTION private.projetar_validacao_cartao(p private.validacoes_cartoes, p_incluir_token boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('id',p.operacao_id,'clienteId',p.cliente_id,'ambiente',p.ambiente,'valorCentavos',p.valor_centavos,
    'estado',p.estado,'customerId',p.asaas_customer_id,'bandeira',p.bandeira_temporaria,'ultimo4',p.ultimo4_temporario,
    'cobrancaId',p.asaas_cobranca_id,'estornoId',p.asaas_estorno_id,'estornoConfirmado',p.estorno_confirmado)
    || CASE WHEN p_incluir_token THEN jsonb_build_object('token',p.token_temporario) ELSE '{}'::jsonb END
$$;
REVOKE ALL ON FUNCTION private.projetar_validacao_cartao(private.validacoes_cartoes,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.registrar_validacao_cartao(p_cliente_id uuid,p_operacao_id uuid,p_ambiente text,p_valor_centavos integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op private.validacoes_cartoes%ROWTYPE;
BEGIN
  PERFORM private.exigir_cliente_cartao_ativo(p_cliente_id);
  IF p_operacao_id IS NULL OR p_ambiente NOT IN ('sandbox','producao') OR p_valor_centavos IS NULL OR p_valor_centavos <= 0 THEN RAISE EXCEPTION 'VALIDACAO_INVALIDA'; END IF;
  PERFORM 1 FROM public.clientes WHERE id=p_cliente_id FOR UPDATE;
  SELECT * INTO v_op FROM private.validacoes_cartoes WHERE cliente_id=p_cliente_id AND operacao_id=p_operacao_id FOR UPDATE;
  IF FOUND THEN
    IF v_op.ambiente<>p_ambiente OR v_op.valor_centavos<>p_valor_centavos THEN RAISE EXCEPTION 'OPERACAO_DIVERGENTE'; END IF;
    RETURN private.projetar_validacao_cartao(v_op,true);
  END IF;
  SELECT * INTO v_op FROM private.validacoes_cartoes WHERE cliente_id=p_cliente_id AND estado NOT IN ('concluida','recusada') FOR UPDATE;
  IF FOUND THEN RETURN private.projetar_validacao_cartao(v_op,true); END IF;
  INSERT INTO private.validacoes_cartoes(cliente_id,operacao_id,ambiente,valor_centavos,referencia_externa)
    VALUES(p_cliente_id,p_operacao_id,p_ambiente,p_valor_centavos,'card-validation:'||p_operacao_id)
    RETURNING * INTO v_op;
  RETURN private.projetar_validacao_cartao(v_op,true);
END;
$$;

CREATE FUNCTION private.obter_validacao_cartao(p_operacao_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.projetar_validacao_cartao(v,true) FROM private.validacoes_cartoes v WHERE v.operacao_id=p_operacao_id $$;

CREATE FUNCTION private.claim_validacao_cartao(p_operacao_id uuid,p_etapa text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op private.validacoes_cartoes%ROWTYPE; v_esperado text;
BEGIN
  IF p_etapa NOT IN ('tokenizar','cobrar','estornar','finalizar') THEN RAISE EXCEPTION 'ETAPA_INVALIDA'; END IF;
  SELECT * INTO v_op FROM private.validacoes_cartoes WHERE operacao_id=p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPERACAO_INDISPONIVEL'; END IF;
  v_esperado := CASE p_etapa WHEN 'tokenizar' THEN 'preparada' WHEN 'cobrar' THEN 'tokenizado' WHEN 'estornar' THEN 'validando' ELSE 'estorno_pendente' END;
  IF v_op.estado<>v_esperado THEN RETURN jsonb_build_object('acquired',false,'operacao',private.projetar_validacao_cartao(v_op,true)); END IF;
  -- A lease that reaches the gateway but loses its response is not safe to
  -- reissue.  Reconciliation (Task 8) owns recovery; ordinary retries only
  -- observe the durable operation and can never send a second financial POST.
  IF v_op.claim_token IS NOT NULL THEN RETURN jsonb_build_object('acquired',false,'operacao',private.projetar_validacao_cartao(v_op,true)); END IF;
  UPDATE private.validacoes_cartoes SET claim_etapa=p_etapa,claim_token=gen_random_uuid(),claim_expira_em=now()+interval '2 minutes',updated_at=now()
    WHERE id=v_op.id RETURNING * INTO v_op;
  RETURN jsonb_build_object('acquired',true,'operacao',private.projetar_validacao_cartao(v_op,true));
END;
$$;

CREATE FUNCTION private.salvar_token_validacao_cartao(p_operacao_id uuid,p_customer_id text,p_token text,p_bandeira text,p_ultimo4 text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op private.validacoes_cartoes%ROWTYPE;
BEGIN
  SELECT * INTO v_op FROM private.validacoes_cartoes WHERE operacao_id=p_operacao_id FOR UPDATE;
  IF NOT FOUND OR v_op.estado<>'preparada' OR v_op.claim_etapa<>'tokenizar' OR v_op.claim_token IS NULL THEN RAISE EXCEPTION 'CLAIM_INVALIDO'; END IF;
  PERFORM private.exigir_cliente_cartao_ativo(v_op.cliente_id);
  IF p_customer_id IS NULL OR length(btrim(p_customer_id))=0 OR p_token IS NULL OR length(btrim(p_token))=0 OR p_bandeira IS NULL OR length(btrim(p_bandeira))=0 OR p_ultimo4 !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'METADADOS_INVALIDOS'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private.clientes_asaas c WHERE c.cliente_id=v_op.cliente_id AND c.ambiente=v_op.ambiente AND c.asaas_customer_id=p_customer_id AND c.estado='pronto') THEN RAISE EXCEPTION 'CUSTOMER_DIVERGENTE'; END IF;
  UPDATE private.validacoes_cartoes SET estado='tokenizado',asaas_customer_id=p_customer_id,token_temporario=p_token,bandeira_temporaria=p_bandeira,ultimo4_temporario=p_ultimo4,claim_etapa=NULL,claim_token=NULL,claim_expira_em=NULL,updated_at=now() WHERE id=v_op.id RETURNING * INTO v_op;
  RETURN private.projetar_validacao_cartao(v_op,true);
END;
$$;

CREATE FUNCTION private.registrar_cobranca_validacao_cartao(p_operacao_id uuid,p_cobranca_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op private.validacoes_cartoes%ROWTYPE;
BEGIN
  SELECT * INTO v_op FROM private.validacoes_cartoes WHERE operacao_id=p_operacao_id FOR UPDATE;
  IF NOT FOUND OR v_op.estado<>'tokenizado' OR v_op.claim_etapa<>'cobrar' OR v_op.claim_token IS NULL OR p_cobranca_id IS NULL OR length(btrim(p_cobranca_id))=0 THEN RAISE EXCEPTION 'CLAIM_INVALIDO'; END IF;
  UPDATE private.validacoes_cartoes SET estado='validando',asaas_cobranca_id=p_cobranca_id,claim_etapa=NULL,claim_token=NULL,claim_expira_em=NULL,updated_at=now() WHERE id=v_op.id RETURNING * INTO v_op;
  RETURN private.projetar_validacao_cartao(v_op,true);
END;
$$;

CREATE FUNCTION private.registrar_estorno_validacao_cartao(p_operacao_id uuid,p_estorno_id text,p_valor_centavos integer,p_confirmado boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op private.validacoes_cartoes%ROWTYPE;
BEGIN
  SELECT * INTO v_op FROM private.validacoes_cartoes WHERE operacao_id=p_operacao_id FOR UPDATE;
  IF NOT FOUND OR v_op.estado<>'validando' OR v_op.claim_etapa<>'estornar' OR v_op.claim_token IS NULL OR p_estorno_id IS NULL OR length(btrim(p_estorno_id))=0 OR p_valor_centavos IS NULL OR p_valor_centavos<0 OR p_confirmado IS NULL THEN RAISE EXCEPTION 'CLAIM_INVALIDO'; END IF;
  UPDATE private.validacoes_cartoes SET estado='estorno_pendente',asaas_estorno_id=p_estorno_id,valor_estornado_centavos=p_valor_centavos,estorno_confirmado=(p_confirmado AND p_valor_centavos=v_op.valor_centavos),claim_etapa=NULL,claim_token=NULL,claim_expira_em=NULL,updated_at=now() WHERE id=v_op.id RETURNING * INTO v_op;
  RETURN private.projetar_validacao_cartao(v_op,true);
END;
$$;

CREATE FUNCTION private.confirmar_estorno_validacao_cartao(p_operacao_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op private.validacoes_cartoes%ROWTYPE;
BEGIN
  SELECT * INTO v_op FROM private.validacoes_cartoes WHERE operacao_id=p_operacao_id FOR UPDATE;
  IF NOT FOUND OR v_op.estado<>'estorno_pendente' OR v_op.claim_etapa<>'finalizar' OR v_op.claim_token IS NULL OR v_op.valor_estornado_centavos<>v_op.valor_centavos THEN RAISE EXCEPTION 'CLAIM_INVALIDO'; END IF;
  UPDATE private.validacoes_cartoes SET estorno_confirmado=true,updated_at=now() WHERE id=v_op.id RETURNING * INTO v_op;
  RETURN private.projetar_validacao_cartao(v_op,true);
END;
$$;

CREATE FUNCTION private.finalizar_validacao_cartao(p_operacao_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op private.validacoes_cartoes%ROWTYPE;
BEGIN
  SELECT * INTO v_op FROM private.validacoes_cartoes WHERE operacao_id=p_operacao_id FOR UPDATE;
  IF NOT FOUND OR v_op.estado<>'estorno_pendente' OR v_op.claim_etapa<>'finalizar' OR v_op.claim_token IS NULL OR NOT v_op.estorno_confirmado OR v_op.valor_estornado_centavos<>v_op.valor_centavos THEN RAISE EXCEPTION 'CLAIM_INVALIDO'; END IF;
  PERFORM private.exigir_cliente_cartao_ativo(v_op.cliente_id);
  INSERT INTO public.clientes_cartoes(cliente_id,ambiente,asaas_customer_id,asaas_credit_card_token,bandeira,ultimo4)
    VALUES(v_op.cliente_id,v_op.ambiente,v_op.asaas_customer_id,v_op.token_temporario,v_op.bandeira_temporaria,v_op.ultimo4_temporario)
    ON CONFLICT (cliente_id,ambiente,asaas_customer_id,asaas_credit_card_token) DO NOTHING;
  UPDATE private.validacoes_cartoes SET estado='concluida',token_temporario=NULL,bandeira_temporaria=NULL,ultimo4_temporario=NULL,claim_etapa=NULL,claim_token=NULL,claim_expira_em=NULL,updated_at=now() WHERE id=v_op.id RETURNING * INTO v_op;
  RETURN private.projetar_validacao_cartao(v_op,true);
END;
$$;

CREATE FUNCTION private.falhar_validacao_cartao(p_operacao_id uuid,p_codigo text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op private.validacoes_cartoes%ROWTYPE;
BEGIN
  SELECT * INTO v_op FROM private.validacoes_cartoes WHERE operacao_id=p_operacao_id FOR UPDATE;
  IF NOT FOUND OR p_codigo NOT IN ('RECUSADA','RECONCILIACAO') THEN RAISE EXCEPTION 'OPERACAO_INDISPONIVEL'; END IF;
  UPDATE private.validacoes_cartoes SET estado=CASE WHEN p_codigo='RECUSADA' THEN 'recusada' ELSE 'reconciliacao' END,erro_seguro=p_codigo,
    token_temporario=CASE WHEN p_codigo='RECUSADA' THEN NULL ELSE token_temporario END,
    bandeira_temporaria=CASE WHEN p_codigo='RECUSADA' THEN NULL ELSE bandeira_temporaria END,
    ultimo4_temporario=CASE WHEN p_codigo='RECUSADA' THEN NULL ELSE ultimo4_temporario END,
    claim_etapa=NULL,claim_token=NULL,claim_expira_em=NULL,updated_at=now() WHERE id=v_op.id RETURNING * INTO v_op;
  RETURN private.projetar_validacao_cartao(v_op,true);
END;
$$;

CREATE FUNCTION public.consultar_cadastro_cartao(p_operacao_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE WHEN auth.uid()=v.cliente_id THEN jsonb_build_object('id',v.operacao_id,'estado',v.estado,'valorCentavos',v.valor_centavos,'bandeira',v.bandeira_temporaria,'ultimo4',v.ultimo4_temporario) ELSE NULL END
  FROM private.validacoes_cartoes v WHERE v.operacao_id=p_operacao_id
$$;
CREATE FUNCTION public.registrar_validacao_cartao_service(p_cliente_id uuid,p_operacao_id uuid,p_ambiente text,p_valor_centavos integer) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.registrar_validacao_cartao(p_cliente_id,p_operacao_id,p_ambiente,p_valor_centavos) $$;
CREATE FUNCTION public.obter_validacao_cartao_service(p_operacao_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.obter_validacao_cartao(p_operacao_id) $$;
CREATE FUNCTION public.claim_validacao_cartao_service(p_operacao_id uuid,p_etapa text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.claim_validacao_cartao(p_operacao_id,p_etapa) $$;
CREATE FUNCTION public.salvar_token_validacao_cartao_service(p_operacao_id uuid,p_customer_id text,p_token text,p_bandeira text,p_ultimo4 text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.salvar_token_validacao_cartao(p_operacao_id,p_customer_id,p_token,p_bandeira,p_ultimo4) $$;
CREATE FUNCTION public.registrar_cobranca_validacao_cartao_service(p_operacao_id uuid,p_cobranca_id text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.registrar_cobranca_validacao_cartao(p_operacao_id,p_cobranca_id) $$;
CREATE FUNCTION public.registrar_estorno_validacao_cartao_service(p_operacao_id uuid,p_estorno_id text,p_valor_centavos integer,p_confirmado boolean) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.registrar_estorno_validacao_cartao(p_operacao_id,p_estorno_id,p_valor_centavos,p_confirmado) $$;
CREATE FUNCTION public.confirmar_estorno_validacao_cartao_service(p_operacao_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.confirmar_estorno_validacao_cartao(p_operacao_id) $$;
CREATE FUNCTION public.finalizar_validacao_cartao_service(p_operacao_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.finalizar_validacao_cartao(p_operacao_id) $$;
CREATE FUNCTION public.falhar_validacao_cartao_service(p_operacao_id uuid,p_codigo text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.falhar_validacao_cartao(p_operacao_id,p_codigo) $$;
REVOKE ALL ON FUNCTION public.consultar_cadastro_cartao(uuid),public.registrar_validacao_cartao_service(uuid,uuid,text,integer),public.obter_validacao_cartao_service(uuid),public.claim_validacao_cartao_service(uuid,text),public.salvar_token_validacao_cartao_service(uuid,text,text,text,text),public.registrar_cobranca_validacao_cartao_service(uuid,text),public.registrar_estorno_validacao_cartao_service(uuid,text,integer,boolean),public.confirmar_estorno_validacao_cartao_service(uuid),public.finalizar_validacao_cartao_service(uuid),public.falhar_validacao_cartao_service(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_cadastro_cartao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_validacao_cartao_service(uuid,uuid,text,integer),public.obter_validacao_cartao_service(uuid),public.claim_validacao_cartao_service(uuid,text),public.salvar_token_validacao_cartao_service(uuid,text,text,text,text),public.registrar_cobranca_validacao_cartao_service(uuid,text),public.registrar_estorno_validacao_cartao_service(uuid,text,integer,boolean),public.confirmar_estorno_validacao_cartao_service(uuid),public.finalizar_validacao_cartao_service(uuid),public.falhar_validacao_cartao_service(uuid,text) TO service_role;
