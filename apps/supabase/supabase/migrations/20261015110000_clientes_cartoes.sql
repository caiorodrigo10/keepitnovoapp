-- Incremental storage only. No gateway calls or existing payment changes.
-- Apply atomically (psql -1 when executing manually).
CREATE TABLE private.clientes_asaas (
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  ambiente text NOT NULL CHECK (ambiente IN ('sandbox', 'producao')),
  asaas_customer_id text,
  estado text NOT NULL DEFAULT 'criando' CHECK (estado IN ('criando', 'pronto', 'reconciliacao')),
  claim_token uuid,
  claim_expira_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, ambiente)
);
CREATE TABLE public.clientes_cartoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  ambiente text NOT NULL CHECK (ambiente IN ('sandbox', 'producao')),
  asaas_customer_id text NOT NULL,
  asaas_credit_card_token text NOT NULL,
  bandeira text NOT NULL,
  ultimo4 text NOT NULL,
  principal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clientes_cartoes_cliente_idx ON public.clientes_cartoes(cliente_id, created_at, id);
CREATE TABLE private.cartoes_gestao_operacoes (
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  operacao_id uuid NOT NULL,
  acao text NOT NULL CHECK (acao IN ('principal', 'remover')),
  -- Deliberately no FK: removal must retain the token-free replay identity.
  cartao_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, operacao_id)
);
ALTER TABLE private.clientes_asaas ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.clientes_asaas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.clientes_cartoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes_cartoes FORCE ROW LEVEL SECURITY;
ALTER TABLE private.cartoes_gestao_operacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.cartoes_gestao_operacoes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.clientes_asaas, public.clientes_cartoes, private.cartoes_gestao_operacoes FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT ALL ON private.clientes_asaas, public.clientes_cartoes, private.cartoes_gestao_operacoes TO service_role;
GRANT SELECT (id, bandeira, ultimo4, principal, created_at) ON public.clientes_cartoes TO authenticated;
CREATE POLICY cliente_le_cartoes ON public.clientes_cartoes FOR SELECT TO authenticated
  USING (cliente_id = (SELECT auth.uid()));

ALTER TABLE private.clientes_asaas
  ADD CONSTRAINT clientes_asaas_customer_ambiente_key UNIQUE (ambiente, asaas_customer_id),
  ADD CONSTRAINT clientes_asaas_vinculo_key UNIQUE (cliente_id, ambiente, asaas_customer_id);
ALTER TABLE public.clientes_cartoes
  ADD CONSTRAINT clientes_cartoes_customer_fkey FOREIGN KEY (cliente_id, ambiente, asaas_customer_id)
    REFERENCES private.clientes_asaas(cliente_id, ambiente, asaas_customer_id) ON DELETE CASCADE,
  ADD CONSTRAINT clientes_cartoes_token_key UNIQUE (cliente_id, ambiente, asaas_customer_id, asaas_credit_card_token),
  ADD CONSTRAINT clientes_cartoes_ultimo4_check CHECK (ultimo4 ~ '^[0-9]{4}$'),
  ADD CONSTRAINT clientes_cartoes_token_check CHECK (length(btrim(asaas_credit_card_token)) > 0);

CREATE UNIQUE INDEX clientes_cartoes_um_principal_idx ON public.clientes_cartoes(cliente_id) WHERE principal;
-- All save paths share this row lock with management; different clients do not block each other.
CREATE FUNCTION private.preparar_cartao_salvo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.clientes WHERE id=NEW.cliente_id FOR UPDATE;
  NEW.principal := NOT EXISTS (SELECT 1 FROM public.clientes_cartoes WHERE cliente_id=NEW.cliente_id AND principal);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.preparar_cartao_salvo() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER clientes_cartoes_preparar BEFORE INSERT ON public.clientes_cartoes
  FOR EACH ROW EXECUTE FUNCTION private.preparar_cartao_salvo();

CREATE FUNCTION private.cliente_gestao_cartoes() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR public.is_admin(v_uid)
    OR NOT EXISTS (SELECT 1 FROM public.clientes WHERE id=v_uid)
    OR EXISTS (SELECT 1 FROM public.estabelecimentos WHERE dono_user_id=v_uid)
  THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  RETURN v_uid;
END;
$$;
REVOKE ALL ON FUNCTION private.cliente_gestao_cartoes() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.listar_cartoes_cliente()
RETURNS TABLE(id uuid, bandeira text, ultimo4 text, principal boolean, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := private.cliente_gestao_cartoes();
BEGIN
  RETURN QUERY SELECT c.id,c.bandeira,c.ultimo4,c.principal,c.created_at
    FROM public.clientes_cartoes c WHERE c.cliente_id=v_uid
    ORDER BY c.principal DESC,c.created_at,c.id;
END;
$$;
REVOKE ALL ON FUNCTION public.listar_cartoes_cliente() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_cartoes_cliente() TO authenticated;

CREATE FUNCTION private.registrar_gestao_cartao(p_cliente_id uuid, p_cartao_id uuid, p_operacao_id uuid, p_acao text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_operacao private.cartoes_gestao_operacoes%ROWTYPE;
BEGIN
  IF p_cartao_id IS NULL OR p_operacao_id IS NULL THEN RAISE EXCEPTION 'OPERACAO_INVALIDA'; END IF;
  SELECT * INTO v_operacao FROM private.cartoes_gestao_operacoes
    WHERE cliente_id=p_cliente_id AND operacao_id=p_operacao_id;
  IF FOUND THEN
    IF v_operacao.acao IS DISTINCT FROM p_acao OR v_operacao.cartao_id IS DISTINCT FROM p_cartao_id
    THEN RAISE EXCEPTION 'OPERACAO_DIVERGENTE'; END IF;
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes_cartoes WHERE id=p_cartao_id AND cliente_id=p_cliente_id)
  THEN RAISE EXCEPTION 'CARTAO_INDISPONIVEL'; END IF;
  INSERT INTO private.cartoes_gestao_operacoes(cliente_id,operacao_id,acao,cartao_id)
    VALUES(p_cliente_id,p_operacao_id,p_acao,p_cartao_id);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION private.registrar_gestao_cartao(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.definir_cartao_principal(p_cartao_id uuid, p_operacao_id uuid)
RETURNS TABLE(id uuid, bandeira text, ultimo4 text, principal boolean, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := private.cliente_gestao_cartoes();
BEGIN
  PERFORM 1 FROM public.clientes WHERE clientes.id=v_uid FOR UPDATE;
  IF private.registrar_gestao_cartao(v_uid,p_cartao_id,p_operacao_id,'principal') THEN
    UPDATE public.clientes_cartoes c SET principal=false WHERE c.cliente_id=v_uid AND c.principal;
    UPDATE public.clientes_cartoes c SET principal=true WHERE c.cliente_id=v_uid AND c.id=p_cartao_id;
  END IF;
  RETURN QUERY SELECT * FROM public.listar_cartoes_cliente();
END;
$$;
REVOKE ALL ON FUNCTION public.definir_cartao_principal(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.definir_cartao_principal(uuid,uuid) TO authenticated;

CREATE FUNCTION public.remover_cartao_cliente(p_cartao_id uuid, p_operacao_id uuid)
RETURNS TABLE(id uuid, bandeira text, ultimo4 text, principal boolean, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := private.cliente_gestao_cartoes();
BEGIN
  PERFORM 1 FROM public.clientes WHERE clientes.id=v_uid FOR UPDATE;
  IF private.registrar_gestao_cartao(v_uid,p_cartao_id,p_operacao_id,'remover') THEN
    DELETE FROM public.clientes_cartoes c WHERE c.cliente_id=v_uid AND c.id=p_cartao_id;
    IF NOT EXISTS (SELECT 1 FROM public.clientes_cartoes c WHERE c.cliente_id=v_uid AND c.principal) THEN
      UPDATE public.clientes_cartoes c SET principal=true WHERE c.id=(
        SELECT s.id FROM public.clientes_cartoes s WHERE s.cliente_id=v_uid
        ORDER BY s.created_at,s.id LIMIT 1
      );
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.listar_cartoes_cliente();
END;
$$;
REVOKE ALL ON FUNCTION public.remover_cartao_cliente(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.remover_cartao_cliente(uuid,uuid) TO authenticated;
