-- Task 4 — fence the existing card purge and persist its resumable checkpoint.
-- This migration neither enables the MVP policy nor invokes a purge itself.

CREATE FUNCTION public.purge_account_deletion_cards(
  p_request_id uuid,
  p_lease_token uuid,
  p_generation bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_execution private.account_deletion_executions%ROWTYPE;
  v_request public.account_deletion_requests%ROWTYPE;
  v_target_user_id uuid;
BEGIN
  IF p_request_id IS NULL OR p_lease_token IS NULL OR p_generation IS NULL THEN
    RAISE EXCEPTION 'SOLICITACAO_INVALIDA';
  END IF;

  SELECT e.target_user_id
  INTO v_target_user_id
  FROM private.account_deletion_executions e
  WHERE e.request_id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOLICITACAO_INDISPONIVEL';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('account-deletion:' || v_target_user_id::text, 0)
  );

  SELECT e.*
  INTO v_execution
  FROM private.account_deletion_executions e
  JOIN public.account_deletion_requests r ON r.id = e.request_id
  WHERE e.request_id = p_request_id
  FOR UPDATE OF e, r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOLICITACAO_INDISPONIVEL';
  END IF;

  SELECT r.*
  INTO v_request
  FROM public.account_deletion_requests r
  WHERE r.id = p_request_id;

  IF v_request.status <> 'processing'
    OR v_execution.lease_token IS DISTINCT FROM p_lease_token
    OR v_execution.generation IS DISTINCT FROM p_generation
    OR v_execution.lease_until IS NULL
    OR v_execution.lease_until <= now()
  THEN
    RAISE EXCEPTION 'LEASE_INVALIDA';
  END IF;

  PERFORM private.exigir_politica_retencao(v_execution.policy_version);

  IF v_execution.phase = 'cards_purged' THEN
    NULL;
  ELSIF v_execution.phase = 'claimed' THEN
    IF v_execution.has_cliente THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.clientes c WHERE c.id = v_execution.target_user_id
      ) THEN
        RAISE EXCEPTION 'CLIENTE_INDISPONIVEL';
      END IF;

      -- Keep the maintained purge as the single owner of saved-card and token
      -- deletion. The wrapper only fences it and clears residual claim state.
      PERFORM public.purgar_cartoes_conta(v_execution.target_user_id, p_request_id);

      UPDATE private.cartoes_operacoes
      SET claim_token = NULL,
          claim_expira_em = NULL,
          updated_at = now()
      WHERE cliente_id = v_execution.target_user_id;

      UPDATE private.validacoes_cartoes
      SET claim_etapa = NULL,
          claim_token = NULL,
          claim_expira_em = NULL,
          -- A customer identifier without a charge/refund cannot serve
          -- reconciliation and is not retained.
          asaas_customer_id = CASE
            WHEN asaas_cobranca_id IS NULL AND asaas_estorno_id IS NULL THEN NULL
            ELSE asaas_customer_id
          END,
          updated_at = now()
      WHERE cliente_id = v_execution.target_user_id;
    ELSIF EXISTS (
      SELECT 1 FROM public.clientes_cartoes c WHERE c.cliente_id = v_execution.target_user_id
      UNION ALL
      SELECT 1 FROM private.clientes_asaas c WHERE c.cliente_id = v_execution.target_user_id
      UNION ALL
      SELECT 1 FROM private.cartoes_operacoes c WHERE c.cliente_id = v_execution.target_user_id
      UNION ALL
      SELECT 1 FROM private.validacoes_cartoes c WHERE c.cliente_id = v_execution.target_user_id
    ) THEN
      RAISE EXCEPTION 'PURGA_CARTOES_INCOMPLETA';
    END IF;
  ELSE
    RAISE EXCEPTION 'FASE_EXCLUSAO_INVALIDA';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clientes_cartoes c WHERE c.cliente_id = v_execution.target_user_id
  ) OR EXISTS (
    SELECT 1 FROM private.clientes_asaas c WHERE c.cliente_id = v_execution.target_user_id
  ) OR EXISTS (
    SELECT 1
    FROM private.cartoes_operacoes c
    WHERE c.cliente_id = v_execution.target_user_id
      AND (c.token_temporario IS NOT NULL OR c.bandeira_temporaria IS NOT NULL
        OR c.ultimo4_temporario IS NOT NULL OR c.asaas_customer_id IS NOT NULL
        OR c.cartao_salvo_id IS NOT NULL OR c.claim_token IS NOT NULL
        OR c.claim_expira_em IS NOT NULL)
  ) OR EXISTS (
    SELECT 1
    FROM private.validacoes_cartoes c
    WHERE c.cliente_id = v_execution.target_user_id
      AND (c.token_temporario IS NOT NULL OR c.bandeira_temporaria IS NOT NULL
        OR c.ultimo4_temporario IS NOT NULL OR c.claim_etapa IS NOT NULL
        OR c.claim_token IS NOT NULL OR c.claim_expira_em IS NOT NULL
        OR (c.asaas_customer_id IS NOT NULL
          AND c.asaas_cobranca_id IS NULL AND c.asaas_estorno_id IS NULL))
  ) THEN
    RAISE EXCEPTION 'PURGA_CARTOES_INCOMPLETA';
  END IF;

  UPDATE private.account_deletion_executions
  SET phase = 'cards_purged', updated_at = now()
  WHERE request_id = p_request_id
    AND lease_token = p_lease_token
    AND generation = p_generation
    AND lease_until > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEASE_INVALIDA';
  END IF;

  RETURN jsonb_build_object('purged', true);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_account_deletion_cards(uuid, uuid, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_account_deletion_cards(uuid, uuid, bigint)
  TO service_role;

COMMENT ON FUNCTION public.purge_account_deletion_cards(uuid, uuid, bigint) IS
  'Service-role-only fenced wrapper around purgar_cartoes_conta. It records cards_purged only with an active matching lease and token-free absence proof.';
