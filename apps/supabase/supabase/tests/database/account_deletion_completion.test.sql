BEGIN;
SELECT plan(14);
\set account_deletion_fixture_included true
\ir fixtures/account_deletion.sql

SELECT has_function('public', 'complete_account_deletion', ARRAY['uuid','uuid','bigint'],
  'completion is a fenced service RPC');
SELECT has_function('public', 'fail_account_deletion', ARRAY['uuid','uuid','bigint','text'],
  'failure is a fenced service RPC');
SELECT function_privs_are('public', 'complete_account_deletion', ARRAY['uuid','uuid','bigint'],
  'service_role', ARRAY['EXECUTE'], 'only service role can complete');

SELECT pg_temp.enable_test_policy();
SELECT pg_temp.due_request(pg_temp.test_id('a')) AS request_id \gset
SELECT pg_temp.claim_user(pg_temp.test_id('a')) AS claim \gset

SELECT throws_ok(format(
  'SELECT public.complete_account_deletion(%L::uuid, %L::uuid, %s::bigint)',
  :'claim'::jsonb->>'id', :'claim'::jsonb->>'leaseToken', :'claim'::jsonb->>'generation'),
  'P0001', 'FASE_EXCLUSAO_INVALIDA', 'completion rejects a claim before its prerequisites');

SELECT public.purge_account_deletion_cards(
  (:'claim'::jsonb->>'id')::uuid, (:'claim'::jsonb->>'leaseToken')::uuid,
  (:'claim'::jsonb->>'generation')::bigint);
SELECT public.apply_account_deletion_data(
  (:'claim'::jsonb->>'id')::uuid, (:'claim'::jsonb->>'leaseToken')::uuid,
  (:'claim'::jsonb->>'generation')::bigint);
SELECT public.advance_account_deletion(
  (:'claim'::jsonb->>'id')::uuid, (:'claim'::jsonb->>'leaseToken')::uuid,
  (:'claim'::jsonb->>'generation')::bigint, 'storage_purged');
DELETE FROM auth.users WHERE id=pg_temp.test_id('a');
SELECT public.advance_account_deletion(
  (:'claim'::jsonb->>'id')::uuid, (:'claim'::jsonb->>'leaseToken')::uuid,
  (:'claim'::jsonb->>'generation')::bigint, 'auth_deleted');

SELECT is(public.complete_account_deletion(
  (:'claim'::jsonb->>'id')::uuid, (:'claim'::jsonb->>'leaseToken')::uuid,
  (:'claim'::jsonb->>'generation')::bigint)->>'completed', 'true',
  'completion succeeds only after the fenced checkpoints');
SELECT is((SELECT status FROM public.account_deletion_requests WHERE id=:'request_id'::uuid), 'completed',
  'completion changes the request exactly once');
SELECT is((SELECT user_id IS NULL FROM public.account_deletion_requests WHERE id=:'request_id'::uuid), true,
  'completed request has no public identity');
SELECT is((SELECT target_user_id IS NULL FROM private.account_deletion_executions WHERE request_id=:'request_id'::uuid), true,
  'completion removes the temporary identity from the execution record');
SELECT is((SELECT scope FROM private.account_deletion_executions WHERE request_id=:'request_id'::uuid),
  '{"pedidoIds":[],"estabelecimentoIds":[],"cotacaoIds":[]}'::jsonb,
  'completion removes the temporary execution scope');
SELECT is((SELECT count(*) FROM private.account_deletion_files WHERE request_id=:'request_id'::uuid), 0::bigint,
  'completion removes no-longer-needed manifest paths');
SELECT is(public.complete_account_deletion(
  (:'claim'::jsonb->>'id')::uuid, (:'claim'::jsonb->>'leaseToken')::uuid,
  (:'claim'::jsonb->>'generation')::bigint)->>'completed', 'true',
  'a replay uses the completed request checkpoint rather than the erased UUID');

SELECT pg_temp.due_request(pg_temp.test_id('b')) AS failed_request_id \gset
SELECT pg_temp.claim_user(pg_temp.test_id('b')) AS failed_claim \gset
SELECT throws_ok(format(
  'SELECT public.fail_account_deletion(%L::uuid, %L::uuid, %s::bigint, %L)',
  :'failed_claim'::jsonb->>'id', :'failed_claim'::jsonb->>'leaseToken', :'failed_claim'::jsonb->>'generation', 'database interrupted'),
  'P0001', 'CODIGO_FALHA_INVALIDO', 'arbitrary error messages cannot enter durable state');
SELECT public.fail_account_deletion(
  (:'failed_claim'::jsonb->>'id')::uuid, (:'failed_claim'::jsonb->>'leaseToken')::uuid,
  (:'failed_claim'::jsonb->>'generation')::bigint, 'REDACAO_DADOS_FALHOU');
SELECT is((SELECT failure_code FROM private.account_deletion_executions WHERE request_id=:'failed_request_id'::uuid),
  'REDACAO_DADOS_FALHOU', 'failure stores only the closed code');
SELECT cmp_ok((SELECT next_attempt_at FROM private.account_deletion_executions WHERE request_id=:'failed_request_id'::uuid),
  '>=', now() + interval '14 minutes', 'failure delays the retry by fifteen minutes');

SELECT * FROM finish();
ROLLBACK;
