BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

\set account_deletion_fixture_included true
\ir fixtures/account_deletion.sql

SELECT has_table('private', 'account_deletion_executions',
  'Task 2 keeps resumable deletion execution state privately');
SELECT has_column('private', 'account_deletion_executions', 'request_id',
  'an execution belongs to one deletion request');
SELECT has_column('private', 'account_deletion_executions', 'target_user_id',
  'the temporary target UUID is retained without an Auth FK');
SELECT has_column('private', 'account_deletion_executions', 'phase',
  'the private execution records its checkpoint phase');
SELECT has_column('private', 'account_deletion_executions', 'policy_version',
  'the private execution records its governing policy version');
SELECT has_column('private', 'account_deletion_executions', 'lease_token',
  'the private execution fences a worker with a lease token');
SELECT has_column('private', 'account_deletion_executions', 'generation',
  'the private execution fences workers with a monotonic generation');
SELECT has_column('private', 'account_deletion_executions', 'next_attempt_at',
  'the private execution records the next eligible retry time');
SELECT has_column('private', 'account_deletion_executions', 'has_cliente',
  'the claim records whether the target has a customer profile');
SELECT has_column('private', 'account_deletion_executions', 'has_lojista',
  'the claim records whether the target has a merchant profile');
SELECT has_column('private', 'account_deletion_executions', 'scope',
  'the execution reserves an allowlisted scope only');

SELECT ok(to_regprocedure('public.schedule_account_deletion_request(uuid)') IS NOT NULL,
  'schedule RPC exists');
SELECT ok(to_regprocedure('public.status_account_deletion_request(uuid)') IS NOT NULL,
  'status RPC exists');
SELECT ok(to_regprocedure('public.claim_account_deletions(integer)') IS NOT NULL,
  'claim RPC exists');
SELECT ok(to_regprocedure('public.renew_account_deletion(uuid,uuid,bigint)') IS NOT NULL,
  'renew RPC exists');
SELECT ok(to_regprocedure('public.fail_account_deletion(uuid,uuid,bigint,text)') IS NOT NULL,
  'fail RPC exists');

SELECT pg_temp.enable_test_policy();

INSERT INTO public.account_deletion_requests (user_id, requested_at, delete_at)
VALUES (pg_temp.test_id('a'), now() - interval '6 days', now() + interval '1 day');
SELECT is((SELECT count(*) FROM public.claim_account_deletions(10)), 0::bigint,
  'a request before the seven-day window is never claimed');
UPDATE public.account_deletion_requests SET status = 'cancelled'
WHERE user_id = pg_temp.test_id('a');

INSERT INTO public.account_deletion_requests (user_id, requested_at, delete_at)
VALUES (pg_temp.test_id('b'), now() - interval '7 days', now());
SELECT is((SELECT count(*) FROM public.cancel_account_deletion_request(pg_temp.test_id('b'))), 0::bigint,
  'cancellation at the exact database-clock boundary is denied');
UPDATE public.account_deletion_requests SET status = 'cancelled'
WHERE user_id = pg_temp.test_id('b');

SELECT pg_temp.due_request(pg_temp.test_id('admin'));
SELECT is((SELECT count(*) FROM public.claim_account_deletions(10)), 0::bigint,
  'an Admin account is kept out of automatic claims');
SELECT is((SELECT failure_code FROM public.account_deletion_requests
  WHERE user_id = pg_temp.test_id('admin')), 'CONTA_ADMIN_FORA_ESCOPO',
  'Admin exclusion is recorded with a private code');

DELETE FROM public.clientes WHERE id = pg_temp.test_id('lojista');
SELECT pg_temp.due_request(pg_temp.test_id('lojista'));
SELECT is((pg_temp.claim_user(pg_temp.test_id('lojista')) ->> 'hasCliente')::boolean, false,
  'a pure merchant without a customer profile is claimable');
SELECT is((SELECT has_lojista FROM private.account_deletion_executions
  WHERE target_user_id = pg_temp.test_id('lojista')), true,
  'the claim retains the merchant-profile flag');

SELECT pg_temp.due_request(pg_temp.test_id('duplo'));
INSERT INTO public.hubs (id, nome, endereco, lat, lng)
VALUES (pg_temp.test_id('claim-hub'), 'Hub claim', 'Rua claim, 1', 0, 0);
INSERT INTO public.pedidos (
  id, cliente_id, estabelecimento_id, hub_id, status, pago_em,
  subtotal_produtos_reais, taxa_deslocamento_reais, taxa_keepit_reais, total_pago_reais
)
SELECT pg_temp.test_id('claim-open-order'), pg_temp.test_id('duplo'), e.id, pg_temp.test_id('claim-hub'),
  'em_preparo', now(), 10, 0, 1, 11
FROM public.estabelecimentos e WHERE e.dono_user_id = pg_temp.test_id('duplo');
SELECT is((SELECT count(*) FROM public.claim_account_deletions(10)), 0::bigint,
  'an operationally pending account remains scheduled');
SELECT is((SELECT failure_code FROM public.account_deletion_requests
  WHERE user_id = pg_temp.test_id('duplo')), 'PENDENCIA_OPERACIONAL',
  'the operational gate stores only the private pending code');

SELECT pg_temp.due_request(pg_temp.test_id('a'));
SELECT is((SELECT count(*) FROM public.claim_account_deletions(10)), 1::bigint,
  'one due eligible account receives one lease');
SELECT is((SELECT count(*) FROM public.claim_account_deletions(10)), 0::bigint,
  'a second claimant cannot acquire the same live lease');

UPDATE private.account_deletion_executions
SET lease_until = now() - interval '1 second'
WHERE target_user_id = pg_temp.test_id('a');
SELECT is((SELECT count(*) FROM public.claim_account_deletions(10)), 1::bigint,
  'an expired lease is resumed only by a subsequent manual claim');
SELECT is((SELECT generation FROM private.account_deletion_executions
  WHERE target_user_id = pg_temp.test_id('a')), 2::bigint,
  'a resumed lease receives a new monotonic generation');

SELECT public.fail_account_deletion(e.request_id, e.lease_token, e.generation, 'RETRYABLE_TEST')
FROM private.account_deletion_executions e WHERE e.target_user_id = pg_temp.test_id('a');
SELECT is((SELECT status FROM public.account_deletion_requests
  WHERE user_id = pg_temp.test_id('a') AND status = 'processing'), 'processing',
  'a transient failure does not return the account to scheduled');
SELECT is((SELECT count(*) FROM public.claim_account_deletions(10)), 0::bigint,
  'a failed attempt is not retried before the fixed delay');
UPDATE private.account_deletion_executions
SET next_attempt_at = now() - interval '1 second'
WHERE target_user_id = pg_temp.test_id('a');
SELECT is((SELECT count(*) FROM public.claim_account_deletions(10)), 1::bigint,
  'retry happens only on the next manual claim after the delay even when fail cleared the lease');

UPDATE public.account_deletion_requests SET user_id = NULL
WHERE id = (SELECT request_id FROM private.account_deletion_executions
  WHERE target_user_id = pg_temp.test_id('a'));
SELECT is((SELECT status FROM public.status_account_deletion_request(pg_temp.test_id('a'))), 'processing',
  'status remains available through the private target UUID after public unlinking');

SELECT is((SELECT count(*) FROM public.schedule_account_deletion_request(pg_temp.test_id('b'))), 1::bigint,
  'schedule creates a request through the RPC');
SELECT is((SELECT count(*) FROM public.schedule_account_deletion_request(pg_temp.test_id('b'))), 1::bigint,
  'repeated schedule returns the same active request');

INSERT INTO public.account_deletion_requests (user_id, status, requested_at, delete_at)
VALUES (pg_temp.test_id('a'), 'failed', now() - interval '8 days', now() - interval '1 day');
SELECT is((SELECT count(*) FROM public.schedule_account_deletion_request(pg_temp.test_id('a'))), 1::bigint,
  'a legacy failed request without an execution is returned for review instead of creating a new request');
SELECT is((SELECT count(*) FROM public.account_deletion_requests
  WHERE user_id = pg_temp.test_id('a') AND status <> 'cancelled'), 1::bigint,
  'a legacy failed request is not silently duplicated by schedule');

SELECT * FROM finish();
ROLLBACK;
