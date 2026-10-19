-- Task 13: the timestamp 20261015113000 is already applied.  This migration is
-- intentionally additive and contains no gateway call or token in an audit.
CREATE TABLE private.politicas_retencao_cartoes (
  escopo text PRIMARY KEY CHECK (escopo = 'cartoes_salvos'),
  aprovada_em timestamptz NOT NULL,
  aprovado_por text NOT NULL CHECK (length(btrim(aprovado_por)) > 0),
  evidencia text NOT NULL CHECK (length(btrim(evidencia)) > 0)
);
ALTER TABLE private.politicas_retencao_cartoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.politicas_retencao_cartoes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.politicas_retencao_cartoes FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.politicas_retencao_cartoes TO service_role;

-- A completed deletion is a permanent card-recreation block.  The request row
-- is the durable tombstone; it stores no token or payment credential.
CREATE OR REPLACE FUNCTION private.exigir_cliente_cartao_ativo(p_cliente_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_cliente_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.clientes WHERE id=p_cliente_id) THEN
    RAISE EXCEPTION 'CLIENTE_INDISPONIVEL';
  END IF;
  IF EXISTS (SELECT 1 FROM public.account_deletion_requests
             WHERE user_id=p_cliente_id AND status IN ('scheduled','processing','completed')) THEN
    RAISE EXCEPTION 'CONTA_EM_EXCLUSAO';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.preparar_cartao_salvo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.exigir_cliente_cartao_ativo(NEW.cliente_id);
  PERFORM 1 FROM public.clientes WHERE id=NEW.cliente_id FOR UPDATE;
  NEW.principal := NOT EXISTS (SELECT 1 FROM public.clientes_cartoes WHERE cliente_id=NEW.cliente_id AND principal);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.finalizar_cliente_asaas(p_cliente_id uuid,p_ambiente text,p_claim_token uuid,p_customer_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row private.clientes_asaas%ROWTYPE;
BEGIN
  PERFORM private.exigir_cliente_cartao_ativo(p_cliente_id);
  IF p_customer_id IS NULL OR length(btrim(p_customer_id))=0 THEN RAISE EXCEPTION 'CUSTOMER_INVALIDO'; END IF;
  SELECT * INTO v_row FROM private.clientes_asaas WHERE cliente_id=p_cliente_id AND ambiente=p_ambiente FOR UPDATE;
  IF NOT FOUND OR v_row.estado<>'criando' OR v_row.claim_token IS DISTINCT FROM p_claim_token THEN RAISE EXCEPTION 'CLAIM_INVALIDO'; END IF;
  UPDATE private.clientes_asaas SET asaas_customer_id=p_customer_id,estado='pronto',claim_token=NULL,claim_expira_em=NULL,updated_at=now()
    WHERE cliente_id=p_cliente_id AND ambiente=p_ambiente RETURNING * INTO v_row;
  RETURN jsonb_build_object('customerId',v_row.asaas_customer_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.purgar_cartoes_conta(p_user_id uuid, p_solicitacao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_request public.account_deletion_requests%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_solicitacao_id IS NULL THEN RAISE EXCEPTION 'SOLICITACAO_INVALIDA'; END IF;
  SELECT * INTO v_request FROM public.account_deletion_requests
    WHERE id=p_solicitacao_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOLICITACAO_INDISPONIVEL'; END IF;
  IF v_request.status NOT IN ('processing','completed')
     AND NOT (v_request.status='scheduled' AND v_request.delete_at <= now()) THEN
    RAISE EXCEPTION 'SOLICITACAO_NAO_VENCIDA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM private.politicas_retencao_cartoes WHERE escopo='cartoes_salvos' AND aprovada_em <= now()) THEN
    RAISE EXCEPTION 'POLITICA_RETENCAO_NAO_APROVADA';
  END IF;
  -- This is the per-client mutex shared by every save/customer claim path.
  PERFORM 1 FROM public.clientes WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLIENTE_INDISPONIVEL'; END IF;

  -- Keep payment/refund identifiers for financial reconciliation only; erase
  -- every reusable customer linkage and every temporary token projection.
  UPDATE private.cartoes_operacoes
     SET token_temporario=NULL,bandeira_temporaria=NULL,ultimo4_temporario=NULL,
         asaas_customer_id=NULL,cartao_salvo_id=NULL,updated_at=now()
   WHERE cliente_id=p_user_id;
  UPDATE private.validacoes_cartoes
     SET token_temporario=NULL,bandeira_temporaria=NULL,ultimo4_temporario=NULL,
         asaas_customer_id=NULL,claim_token=NULL,claim_expira_em=NULL,updated_at=now()
   WHERE cliente_id=p_user_id;
  DELETE FROM public.clientes_cartoes WHERE cliente_id=p_user_id;
  DELETE FROM private.clientes_asaas WHERE cliente_id=p_user_id;

  IF EXISTS (SELECT 1 FROM public.clientes_cartoes WHERE cliente_id=p_user_id)
     OR EXISTS (SELECT 1 FROM private.clientes_asaas WHERE cliente_id=p_user_id)
     OR EXISTS (SELECT 1 FROM private.cartoes_operacoes WHERE cliente_id=p_user_id AND token_temporario IS NOT NULL)
     OR EXISTS (SELECT 1 FROM private.validacoes_cartoes WHERE cliente_id=p_user_id AND token_temporario IS NOT NULL) THEN
    RAISE EXCEPTION 'PURGA_CARTOES_INCOMPLETA';
  END IF;
  RETURN jsonb_build_object('purged',true);
END;
$$;
REVOKE ALL ON FUNCTION public.purgar_cartoes_conta(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purgar_cartoes_conta(uuid,uuid) TO service_role;
COMMENT ON FUNCTION public.purgar_cartoes_conta(uuid,uuid) IS
  'Service-role-only final account-deletion purge. Returns only an opaque absence proof, never a token.';
