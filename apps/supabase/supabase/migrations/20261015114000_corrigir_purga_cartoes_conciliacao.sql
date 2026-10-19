-- Task 13 review correction: scheduled deletion must never roll back a payment
-- confirmation, and financial reconciliation keeps only its non-token customer reference.
CREATE OR REPLACE FUNCTION private.preparar_cartao_salvo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- New token acquisition is guarded before it reaches this trigger.  This
  -- trigger also runs while a pre-existing payment is being confirmed, so it
  -- must not roll back that financial transaction during the seven-day window.
  PERFORM 1 FROM public.clientes WHERE id=NEW.cliente_id FOR UPDATE;
  NEW.principal := NOT EXISTS (SELECT 1 FROM public.clientes_cartoes WHERE cliente_id=NEW.cliente_id AND principal);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.purgar_cartoes_conta(p_user_id uuid, p_solicitacao_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_request public.account_deletion_requests%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_solicitacao_id IS NULL THEN RAISE EXCEPTION 'SOLICITACAO_INVALIDA'; END IF;
  SELECT * INTO v_request FROM public.account_deletion_requests WHERE id=p_solicitacao_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOLICITACAO_INDISPONIVEL'; END IF;
  IF v_request.status NOT IN ('processing','completed') AND NOT (v_request.status='scheduled' AND v_request.delete_at<=now()) THEN RAISE EXCEPTION 'SOLICITACAO_NAO_VENCIDA'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private.politicas_retencao_cartoes WHERE escopo='cartoes_salvos' AND aprovada_em<=now()) THEN RAISE EXCEPTION 'POLITICA_RETENCAO_NAO_APROVADA'; END IF;
  PERFORM 1 FROM public.clientes WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLIENTE_INDISPONIVEL'; END IF;
  UPDATE private.cartoes_operacoes SET token_temporario=NULL,bandeira_temporaria=NULL,ultimo4_temporario=NULL,asaas_customer_id=NULL,cartao_salvo_id=NULL,updated_at=now() WHERE cliente_id=p_user_id;
  -- asaas_customer_id is retained here solely to validate an existing charge/refund;
  -- clientes_asaas is deleted, so it cannot be reused to tokenize or charge anew.
  UPDATE private.validacoes_cartoes SET token_temporario=NULL,bandeira_temporaria=NULL,ultimo4_temporario=NULL,claim_token=NULL,claim_expira_em=NULL,updated_at=now() WHERE cliente_id=p_user_id;
  DELETE FROM public.clientes_cartoes WHERE cliente_id=p_user_id;
  DELETE FROM private.clientes_asaas WHERE cliente_id=p_user_id;
  IF EXISTS (SELECT 1 FROM public.clientes_cartoes WHERE cliente_id=p_user_id)
     OR EXISTS (SELECT 1 FROM private.clientes_asaas WHERE cliente_id=p_user_id)
     OR EXISTS (SELECT 1 FROM private.cartoes_operacoes WHERE cliente_id=p_user_id AND token_temporario IS NOT NULL)
     OR EXISTS (SELECT 1 FROM private.validacoes_cartoes WHERE cliente_id=p_user_id AND token_temporario IS NOT NULL) THEN RAISE EXCEPTION 'PURGA_CARTOES_INCOMPLETA'; END IF;
  RETURN jsonb_build_object('purged',true);
END;
$$;
REVOKE ALL ON FUNCTION public.purgar_cartoes_conta(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purgar_cartoes_conta(uuid,uuid) TO service_role;
