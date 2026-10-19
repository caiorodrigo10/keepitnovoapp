-- Task 8 — fixed retention expiry. F references are removed after five years
-- from financial closure; the minimum A execution audit is removed after 180
-- days from completion/cancellation. No expiry date is configurable here.

ALTER TABLE private.retencoes_conta
  DROP CONSTRAINT retencoes_conta_solicitacao_id_fkey;

CREATE INDEX retencoes_conta_expira_em_idx
  ON private.retencoes_conta (expira_em, id);

CREATE FUNCTION public.expire_account_deletion_retention(p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_policy text;
  v_retencao private.retencoes_conta%ROWTYPE;
  v_request public.account_deletion_requests%ROWTYPE;
  v_expired integer := 0;
  v_remaining integer;
  v_pending bigint;
BEGIN
  p_limit := coalesce(p_limit, 10);
  IF p_limit < 1 OR p_limit > 20 THEN
    RAISE EXCEPTION 'LIMITE_INVALIDO';
  END IF;

  SELECT p.versao INTO v_policy
  FROM private.politicas_retencao_cartoes p
  WHERE p.escopo = 'cartoes_salvos'
  ORDER BY p.aprovada_em DESC
  LIMIT 1;
  PERFORM private.exigir_politica_retencao(v_policy);

  v_remaining := p_limit;
  FOR v_retencao IN
    SELECT *
    FROM private.retencoes_conta
    WHERE expira_em <= now()
    ORDER BY expira_em, id
    FOR UPDATE SKIP LOCKED
    LIMIT v_remaining
  LOOP
    -- Explicit handlers are the retention allowlist: no table or field is ever
    -- interpolated from data retained in a row.
    IF v_retencao.tabela = 'public.pedidos'
      AND v_retencao.campo = 'asaas_payment_id' THEN
      UPDATE public.pedidos SET asaas_payment_id = NULL
      WHERE id = v_retencao.linha_id;
    ELSIF v_retencao.tabela = 'public.tentativas_pagamento'
      AND v_retencao.campo = 'asaas_payment_id' THEN
      UPDATE public.tentativas_pagamento SET asaas_payment_id = NULL
      WHERE id = v_retencao.linha_id;
    ELSIF v_retencao.tabela = 'public.eventos_pagamento'
      AND v_retencao.campo = 'evento_externo_id' THEN
      UPDATE public.eventos_pagamento SET evento_externo_id = NULL
      WHERE id = v_retencao.linha_id;
    ELSIF v_retencao.tabela = 'public.ocorrencias_pagamento'
      AND v_retencao.campo = 'referencia_externa' THEN
      UPDATE public.ocorrencias_pagamento SET referencia_externa = NULL
      WHERE id = v_retencao.linha_id;
    ELSIF v_retencao.tabela = 'public.antecipacoes_recebiveis'
      AND v_retencao.campo = 'antecipacao_externa_id' THEN
      UPDATE public.antecipacoes_recebiveis SET antecipacao_externa_id = NULL
      WHERE id = v_retencao.linha_id;
    ELSIF v_retencao.tabela = 'public.lancamentos_financeiros'
      AND v_retencao.campo = 'asaas_id_externo' THEN
      UPDATE public.lancamentos_financeiros SET asaas_id_externo = NULL
      WHERE id = v_retencao.linha_id;
    ELSIF v_retencao.tabela = 'public.eventos_reembolso'
      AND v_retencao.campo = 'referencia' THEN
      UPDATE public.eventos_reembolso SET referencia = NULL
      WHERE id = v_retencao.linha_id;
    ELSE
      RAISE EXCEPTION 'RETENCAO_ORIGEM_INVALIDA';
    END IF;

    DELETE FROM private.retencoes_conta WHERE id = v_retencao.id;
    v_expired := v_expired + 1;
    v_remaining := v_remaining - 1;
  END LOOP;

  -- F rows retain the request UUID as a narrow operational correlation, but
  -- never require the 180-day A request/execution audit to survive five years.
  IF v_remaining > 0 THEN
    FOR v_request IN
      SELECT *
      FROM public.account_deletion_requests
      WHERE (status = 'completed' AND completed_at + interval '180 days' <= now())
         OR (status = 'cancelled' AND cancelled_at + interval '180 days' <= now())
      ORDER BY coalesce(completed_at, cancelled_at), id
      FOR UPDATE SKIP LOCKED
      LIMIT v_remaining
    LOOP
      DELETE FROM private.account_deletion_executions
      WHERE request_id = v_request.id;
      DELETE FROM public.account_deletion_requests
      WHERE id = v_request.id;
      v_expired := v_expired + 1;
      v_remaining := v_remaining - 1;
    END LOOP;
  END IF;

  SELECT count(*) INTO v_pending
  FROM private.retencoes_conta
  WHERE expira_em <= now();
  SELECT v_pending + count(*) INTO v_pending
  FROM public.account_deletion_requests
  WHERE (status = 'completed' AND completed_at + interval '180 days' <= now())
     OR (status = 'cancelled' AND cancelled_at + interval '180 days' <= now());

  RETURN jsonb_build_object('expired', v_expired, 'pending', v_pending);
END;
$$;

REVOKE ALL ON FUNCTION public.expire_account_deletion_retention(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_account_deletion_retention(integer)
  TO service_role;

COMMENT ON FUNCTION public.expire_account_deletion_retention(integer) IS
  'Service-role-only fixed expiry of F/H references after five years and A audit metadata after 180 days; preserves historical monetary totals.';
