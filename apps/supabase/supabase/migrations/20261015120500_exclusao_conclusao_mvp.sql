-- Task 6 — the externally destructive Storage/Auth effects stay outside SQL.
-- These fenced RPCs expose only the validated manifest and persist proofs
-- returned by the worker.  Task 7 adds complete/fail to this same migration.

CREATE FUNCTION public.list_account_deletion_files(
  p_request_id uuid, p_lease_token uuid, p_generation bigint, p_limit integer
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_execution private.account_deletion_executions%ROWTYPE;
BEGIN
  IF p_request_id IS NULL OR p_lease_token IS NULL OR p_generation IS NULL
    OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'SOLICITACAO_INVALIDA';
  END IF;
  SELECT e.* INTO v_execution
  FROM private.account_deletion_executions e
  JOIN public.account_deletion_requests r ON r.id=e.request_id
  WHERE e.request_id=p_request_id AND r.status='processing'
  FOR UPDATE OF e;
  IF NOT FOUND OR v_execution.lease_token IS DISTINCT FROM p_lease_token
    OR v_execution.generation IS DISTINCT FROM p_generation
    OR v_execution.lease_until IS NULL OR v_execution.lease_until <= now() THEN
    RAISE EXCEPTION 'LEASE_INVALIDA';
  END IF;
  IF v_execution.phase <> 'data_purged' THEN RAISE EXCEPTION 'FASE_EXCLUSAO_INVALIDA'; END IF;
  RETURN QUERY
  SELECT jsonb_build_object('id',f.id,'bucket',f.bucket,'path',f.path)
  FROM private.account_deletion_files f
  WHERE f.request_id=p_request_id AND f.estado='pendente'
  ORDER BY f.id
  LIMIT p_limit;
END;
$$;

CREATE FUNCTION public.ack_account_deletion_files(
  p_request_id uuid, p_lease_token uuid, p_generation bigint, p_file_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_execution private.account_deletion_executions%ROWTYPE; v_updated integer;
BEGIN
  IF p_request_id IS NULL OR p_lease_token IS NULL OR p_generation IS NULL THEN
    RAISE EXCEPTION 'SOLICITACAO_INVALIDA';
  END IF;
  SELECT e.* INTO v_execution
  FROM private.account_deletion_executions e
  JOIN public.account_deletion_requests r ON r.id=e.request_id
  WHERE e.request_id=p_request_id AND r.status='processing'
  FOR UPDATE OF e;
  IF NOT FOUND OR v_execution.lease_token IS DISTINCT FROM p_lease_token
    OR v_execution.generation IS DISTINCT FROM p_generation
    OR v_execution.lease_until IS NULL OR v_execution.lease_until <= now() THEN
    RAISE EXCEPTION 'LEASE_INVALIDA';
  END IF;
  IF v_execution.phase <> 'data_purged' THEN RAISE EXCEPTION 'FASE_EXCLUSAO_INVALIDA'; END IF;
  IF p_file_ids IS NULL OR cardinality(p_file_ids)=0 OR cardinality(p_file_ids) <> (
    SELECT count(*) FROM private.account_deletion_files f
    WHERE f.request_id=p_request_id AND f.estado='pendente' AND f.id=ANY(p_file_ids)
  ) THEN RAISE EXCEPTION 'MANIFESTO_STORAGE_INVALIDO'; END IF;
  UPDATE private.account_deletion_files f SET estado='removido'
  WHERE f.request_id=p_request_id AND f.estado='pendente' AND f.id=ANY(p_file_ids)
    AND EXISTS (
      SELECT 1 FROM private.account_deletion_executions e
      WHERE e.request_id=p_request_id AND e.lease_token=p_lease_token
        AND e.generation=p_generation AND e.lease_until>now() AND e.phase='data_purged'
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> cardinality(p_file_ids) THEN RAISE EXCEPTION 'LEASE_INVALIDA'; END IF;
END;
$$;

CREATE FUNCTION public.advance_account_deletion(
  p_request_id uuid, p_lease_token uuid, p_generation bigint, p_phase text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_execution private.account_deletion_executions%ROWTYPE;
BEGIN
  IF p_request_id IS NULL OR p_lease_token IS NULL OR p_generation IS NULL
    OR p_phase NOT IN ('storage_purged','auth_deleted') THEN
    RAISE EXCEPTION 'SOLICITACAO_INVALIDA';
  END IF;
  SELECT e.* INTO v_execution
  FROM private.account_deletion_executions e
  JOIN public.account_deletion_requests r ON r.id=e.request_id
  WHERE e.request_id=p_request_id AND r.status='processing'
  FOR UPDATE OF e;
  IF NOT FOUND OR v_execution.lease_token IS DISTINCT FROM p_lease_token
    OR v_execution.generation IS DISTINCT FROM p_generation
    OR v_execution.lease_until IS NULL OR v_execution.lease_until <= now() THEN
    RAISE EXCEPTION 'LEASE_INVALIDA';
  END IF;
  IF p_phase='storage_purged' THEN
    IF v_execution.phase <> 'data_purged' THEN RAISE EXCEPTION 'FASE_EXCLUSAO_INVALIDA'; END IF;
    IF EXISTS (SELECT 1 FROM private.account_deletion_files f
      WHERE f.request_id=p_request_id AND f.estado <> 'removido') THEN
      RAISE EXCEPTION 'ARQUIVOS_STORAGE_PENDENTES';
    END IF;
  ELSE
    IF v_execution.phase <> 'storage_purged' THEN RAISE EXCEPTION 'FASE_EXCLUSAO_INVALIDA'; END IF;
    IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id=v_execution.target_user_id)
      OR EXISTS (SELECT 1 FROM auth.sessions s WHERE s.user_id=v_execution.target_user_id) THEN
      RAISE EXCEPTION 'AUTH_EXCLUSAO_NAO_CONFIRMADA';
    END IF;
  END IF;
  UPDATE private.account_deletion_executions e SET phase=p_phase,updated_at=now()
  WHERE e.request_id=p_request_id AND e.lease_token=p_lease_token
    AND e.generation=p_generation AND e.lease_until>now() AND e.phase=v_execution.phase;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEASE_INVALIDA'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.list_account_deletion_files(uuid,uuid,bigint,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ack_account_deletion_files(uuid,uuid,bigint,uuid[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.advance_account_deletion(uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_account_deletion_files(uuid,uuid,bigint,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ack_account_deletion_files(uuid,uuid,bigint,uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_account_deletion(uuid,uuid,bigint,text) TO service_role;

COMMENT ON FUNCTION public.list_account_deletion_files(uuid,uuid,bigint,integer) IS
  'Service-role-only, fenced reread of pending validated Storage manifest paths.';
COMMENT ON FUNCTION public.ack_account_deletion_files(uuid,uuid,bigint,uuid[]) IS
  'Service-role-only acknowledgement after the worker proves each Storage object absent.';

-- Task 7 — only this final checkpoint removes the temporary execution identity.
ALTER TABLE private.account_deletion_executions
  ALTER COLUMN target_user_id DROP NOT NULL;

CREATE FUNCTION public.complete_account_deletion(
  p_request_id uuid, p_lease_token uuid, p_generation bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_execution private.account_deletion_executions%ROWTYPE;
  v_status text;
BEGIN
  IF p_request_id IS NULL OR p_lease_token IS NULL OR p_generation IS NULL THEN
    RAISE EXCEPTION 'SOLICITACAO_INVALIDA';
  END IF;

  SELECT e.*
  INTO v_execution
  FROM private.account_deletion_executions e
  WHERE e.request_id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOLICITACAO_INDISPONIVEL'; END IF;
  SELECT r.status INTO v_status
  FROM public.account_deletion_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  -- A retry finds the durable checkpoint; it never needs the removed identity.
  IF v_status = 'completed' AND v_execution.phase = 'completed' THEN
    RETURN jsonb_build_object('completed', true);
  END IF;

  IF v_status <> 'processing'
    OR v_execution.lease_token IS DISTINCT FROM p_lease_token
    OR v_execution.generation IS DISTINCT FROM p_generation
    OR v_execution.lease_until IS NULL OR v_execution.lease_until <= now()
  THEN RAISE EXCEPTION 'LEASE_INVALIDA'; END IF;
  IF v_execution.phase <> 'auth_deleted' THEN RAISE EXCEPTION 'FASE_EXCLUSAO_INVALIDA'; END IF;

  PERFORM private.exigir_politica_retencao(v_execution.policy_version);
  IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_execution.target_user_id)
    OR EXISTS (SELECT 1 FROM auth.sessions s WHERE s.user_id = v_execution.target_user_id)
    OR EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = v_execution.target_user_id)
    OR (v_execution.has_lojista AND EXISTS (
      SELECT 1 FROM public.estabelecimentos e WHERE e.dono_user_id = v_execution.target_user_id
    ))
  THEN RAISE EXCEPTION 'AUSENCIA_EXCLUSAO_NAO_CONFIRMADA'; END IF;
  IF EXISTS (
    SELECT 1 FROM private.retencoes_conta rc
    WHERE rc.solicitacao_id = p_request_id
      AND rc.versao_politica IS DISTINCT FROM v_execution.policy_version
  ) THEN RAISE EXCEPTION 'RETENCAO_EXCLUSAO_INVALIDA'; END IF;

  DELETE FROM private.account_deletion_files WHERE request_id = p_request_id;
  UPDATE private.account_deletion_executions
  SET phase = 'completed', target_user_id = NULL,
      scope = '{"pedidoIds":[],"estabelecimentoIds":[],"cotacaoIds":[]}'::jsonb,
      lease_token = NULL, lease_until = NULL, next_attempt_at = NULL,
      failure_code = NULL, updated_at = now()
  WHERE request_id = p_request_id AND lease_token = p_lease_token
    AND generation = p_generation AND lease_until > now() AND phase = 'auth_deleted';
  IF NOT FOUND THEN RAISE EXCEPTION 'LEASE_INVALIDA'; END IF;
  UPDATE public.account_deletion_requests
  SET user_id = NULL, status = 'completed', completed_at = coalesce(completed_at, now()),
      failure_code = NULL, updated_at = now()
  WHERE id = p_request_id AND status = 'processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'LEASE_INVALIDA'; END IF;
  RETURN jsonb_build_object('completed', true);
END;
$$;

CREATE FUNCTION public.reload_account_deletion(
  p_request_id uuid, p_lease_token uuid, p_generation bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_execution private.account_deletion_executions%ROWTYPE;
BEGIN
  SELECT e.* INTO v_execution FROM private.account_deletion_executions e
  JOIN public.account_deletion_requests r ON r.id=e.request_id
  WHERE e.request_id=p_request_id AND r.status='processing'
  FOR UPDATE OF e;
  IF NOT FOUND OR v_execution.lease_token IS DISTINCT FROM p_lease_token
    OR v_execution.generation IS DISTINCT FROM p_generation
    OR v_execution.lease_until IS NULL OR v_execution.lease_until<=now()
  THEN RAISE EXCEPTION 'LEASE_INVALIDA'; END IF;
  RETURN jsonb_build_object('id',v_execution.request_id,'userId',v_execution.target_user_id,
    'policyVersion',v_execution.policy_version,'leaseToken',v_execution.lease_token,
    'generation',v_execution.generation,'phase',v_execution.phase,
    'hasCliente',v_execution.has_cliente,'hasLojista',v_execution.has_lojista);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_account_deletion(
  p_request_id uuid, p_lease_token uuid, p_generation bigint, p_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_request_id IS NULL OR p_lease_token IS NULL OR p_generation IS NULL
    OR p_code NOT IN (
      'RETRYABLE_TEST', 'PURGA_CARTOES_FALHOU', 'REDACAO_DADOS_FALHOU',
      'PURGA_STORAGE_FALHOU', 'AUTH_EXCLUSAO_FALHOU', 'CONCLUSAO_FALHOU',
      'PENDENCIA_OPERACIONAL'
    )
  THEN RAISE EXCEPTION 'CODIGO_FALHA_INVALIDO'; END IF;

  UPDATE private.account_deletion_executions e
  SET failure_code = p_code, next_attempt_at = now() + interval '15 minutes',
      lease_until = NULL, updated_at = now()
  WHERE e.request_id = p_request_id AND e.lease_token = p_lease_token
    AND e.generation = p_generation AND e.lease_until > now() AND e.phase <> 'completed';
  IF NOT FOUND THEN RAISE EXCEPTION 'LEASE_INVALIDA'; END IF;
  UPDATE public.account_deletion_requests r
  SET status = 'processing', failure_code = p_code, failed_at = now(), updated_at = now()
  WHERE r.id = p_request_id AND r.status = 'processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'LEASE_INVALIDA'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_account_deletion(uuid,uuid,bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reload_account_deletion(uuid,uuid,bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fail_account_deletion(uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_account_deletion(uuid,uuid,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.reload_account_deletion(uuid,uuid,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_account_deletion(uuid,uuid,bigint,text) TO service_role;

COMMENT ON FUNCTION public.complete_account_deletion(uuid,uuid,bigint) IS
  'Service-role-only final fenced checkpoint; validates absence and retention before erasing temporary execution identity.';
COMMENT ON FUNCTION public.fail_account_deletion(uuid,uuid,bigint,text) IS
  'Service-role-only fenced retry record with a closed failure code and a fixed fifteen-minute delay.';

-- A data checkpoint deliberately removes public.user_id, so recovery must use
-- the private execution target and return its persisted phase rather than
-- pretending every resumed lease is a fresh claim.
CREATE OR REPLACE FUNCTION public.claim_account_deletions(p_limit integer)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v record; v_policy text; v_token uuid; v_generation bigint; v_phase text; v_cliente boolean; v_lojista boolean; v_user_id uuid;
BEGIN
  p_limit:=coalesce(p_limit,10); IF p_limit<1 OR p_limit>20 THEN RAISE EXCEPTION 'LIMITE_INVALIDO'; END IF;
  SELECT versao INTO v_policy FROM private.politicas_retencao_cartoes WHERE escopo='cartoes_salvos' ORDER BY aprovada_em DESC LIMIT 1;
  PERFORM private.exigir_politica_retencao(v_policy);
  FOR v IN
    SELECT r.id,coalesce(r.user_id,e.target_user_id) AS user_id,r.status,e.request_id IS NOT NULL AS existing
    FROM public.account_deletion_requests r LEFT JOIN private.account_deletion_executions e ON e.request_id=r.id
    WHERE (r.status='scheduled' AND r.user_id IS NOT NULL AND r.delete_at<=now())
      OR (r.status IN ('processing','failed') AND e.request_id IS NOT NULL
        AND (e.lease_until IS NULL OR e.lease_until<=now())
        AND coalesce(e.next_attempt_at,'-infinity')<=now())
    ORDER BY r.delete_at LIMIT p_limit
  LOOP
    -- Keep the resumable predicate explicit after the SQL precedence guard.
    IF v.existing AND NOT EXISTS (
      SELECT 1 FROM private.account_deletion_executions e WHERE e.request_id=v.id
        AND (e.lease_until IS NULL OR e.lease_until<=now())
        AND coalesce(e.next_attempt_at,'-infinity')<=now()
    ) THEN CONTINUE; END IF;
    v_user_id := v.user_id;
    PERFORM pg_advisory_xact_lock(hashtextextended('account-deletion:' || v_user_id::text,0));
    PERFORM 1 FROM public.account_deletion_requests WHERE id=v.id FOR UPDATE SKIP LOCKED; IF NOT FOUND THEN CONTINUE; END IF;
    IF NOT v.existing AND EXISTS(SELECT 1 FROM public.admin_users a WHERE a.id=v_user_id) THEN
      UPDATE public.account_deletion_requests SET failure_code='CONTA_ADMIN_FORA_ESCOPO',updated_at=now() WHERE id=v.id; CONTINUE;
    END IF;
    IF NOT v.existing AND private.account_deletion_has_pending(v_user_id) THEN
      UPDATE public.account_deletion_requests SET failure_code='PENDENCIA_OPERACIONAL',updated_at=now() WHERE id=v.id; CONTINUE;
    END IF;
    v_cliente:=EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=v_user_id);
    v_lojista:=EXISTS(SELECT 1 FROM public.estabelecimentos e WHERE e.dono_user_id=v_user_id);
    v_token:=gen_random_uuid();
    INSERT INTO private.account_deletion_executions(request_id,target_user_id,policy_version,lease_token,lease_until,generation,next_attempt_at,has_cliente,has_lojista)
    VALUES(v.id,v_user_id,v_policy,v_token,now()+interval '120 seconds',1,NULL,v_cliente,v_lojista)
    ON CONFLICT(request_id) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until,
      generation=private.account_deletion_executions.generation+1,next_attempt_at=NULL,updated_at=now()
      WHERE (private.account_deletion_executions.lease_until IS NULL OR private.account_deletion_executions.lease_until<=now())
        AND coalesce(private.account_deletion_executions.next_attempt_at,'-infinity')<=now()
    RETURNING generation,phase,has_cliente,has_lojista,target_user_id INTO v_generation,v_phase,v_cliente,v_lojista,v_user_id;
    IF v_generation IS NULL THEN CONTINUE; END IF;
    UPDATE public.account_deletion_requests SET status='processing',processing_at=coalesce(processing_at,now()),failure_code=NULL,updated_at=now() WHERE id=v.id;
    RETURN NEXT jsonb_build_object('id',v.id,'userId',v_user_id,'policyVersion',v_policy,'leaseToken',v_token,'generation',v_generation,'phase',v_phase,'hasCliente',v_cliente,'hasLojista',v_lojista);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_account_deletions(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_account_deletions(integer) TO service_role;
