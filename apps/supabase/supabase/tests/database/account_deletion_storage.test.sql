BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

\set account_deletion_fixture_included true
\ir fixtures/account_deletion.sql

-- These three contracts are deliberately the first RED: the database has no
-- way to page a manifest, acknowledge a proved absence, or fence a phase
-- advance until Task 6 supplies them.
SELECT has_function('public', 'list_account_deletion_files',
  ARRAY['uuid', 'uuid', 'bigint', 'integer'],
  'the service-only manifest page RPC exists');
SELECT has_function('public', 'ack_account_deletion_files',
  ARRAY['uuid', 'uuid', 'bigint', 'uuid[]'],
  'the fenced manifest acknowledgement RPC exists');
SELECT has_function('public', 'advance_account_deletion',
  ARRAY['uuid', 'uuid', 'bigint', 'text'],
  'the fenced checkpoint RPC exists');

SELECT pg_temp.enable_test_policy();
SELECT pg_temp.due_request(pg_temp.test_id('a'));
CREATE TEMP TABLE pg_temp.storage_claims (claim jsonb NOT NULL);
INSERT INTO pg_temp.storage_claims VALUES (pg_temp.claim_user(pg_temp.test_id('a')));
SELECT public.purge_account_deletion_cards(
  (claim->>'id')::uuid, (claim->>'leaseToken')::uuid, (claim->>'generation')::bigint)
FROM pg_temp.storage_claims;
SELECT public.apply_account_deletion_data(
  (claim->>'id')::uuid, (claim->>'leaseToken')::uuid, (claim->>'generation')::bigint)
FROM pg_temp.storage_claims;

-- A large manifest proves that a shrinking pending set is reread, not offset.
INSERT INTO private.account_deletion_files(request_id,bucket,path)
SELECT (claim->>'id')::uuid,
  CASE WHEN n % 2 = 0 THEN 'fachadas' ELSE 'produtos' END,
  pg_temp.test_id('a')::text || '/arquivo-' || n || '.png'
FROM pg_temp.storage_claims CROSS JOIN generate_series(1,201) AS n;
SELECT pg_temp.due_request(pg_temp.test_id('b'));
INSERT INTO private.account_deletion_files(request_id,bucket,path)
SELECT pg_temp.test_id('request:' || pg_temp.test_id('b')::text),'fachadas',
  pg_temp.test_id('b')::text || '/arquivo-b.png';

SELECT throws_ok($$ SELECT public.advance_account_deletion(
  (SELECT (claim->>'id')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'leaseToken')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'generation')::bigint FROM pg_temp.storage_claims),'storage_purged') $$,
  'P0001','ARQUIVOS_STORAGE_PENDENTES','storage cannot advance before every manifest path is acknowledged');
SELECT is((SELECT count(*) FROM public.list_account_deletion_files(
  (SELECT (claim->>'id')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'leaseToken')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'generation')::bigint FROM pg_temp.storage_claims),100)),100::bigint,
  'the first manifest page is limited to 100');
SELECT public.ack_account_deletion_files(
  (SELECT (claim->>'id')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'leaseToken')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'generation')::bigint FROM pg_temp.storage_claims),
  (SELECT array_agg(id ORDER BY id) FROM (
    SELECT id FROM private.account_deletion_files WHERE request_id=(SELECT (claim->>'id')::uuid FROM pg_temp.storage_claims)
      AND estado='pendente' ORDER BY id LIMIT 100) AS page));
SELECT is((SELECT count(*) FROM public.list_account_deletion_files(
  (SELECT (claim->>'id')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'leaseToken')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'generation')::bigint FROM pg_temp.storage_claims),100)),100::bigint,
  'the second page rereads remaining paths without an offset');
SELECT public.ack_account_deletion_files(
  (SELECT (claim->>'id')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'leaseToken')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'generation')::bigint FROM pg_temp.storage_claims),
  (SELECT array_agg(id ORDER BY id) FROM (
    SELECT id FROM private.account_deletion_files WHERE request_id=(SELECT (claim->>'id')::uuid FROM pg_temp.storage_claims)
      AND estado='pendente' ORDER BY id LIMIT 100) AS page));
SELECT is((SELECT count(*) FROM public.list_account_deletion_files(
  (SELECT (claim->>'id')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'leaseToken')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'generation')::bigint FROM pg_temp.storage_claims),100)),1::bigint,
  'the final reread returns exactly the 201st path');
SELECT public.ack_account_deletion_files(
  (SELECT (claim->>'id')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'leaseToken')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'generation')::bigint FROM pg_temp.storage_claims),
  (SELECT array_agg(id) FROM private.account_deletion_files WHERE request_id=(SELECT (claim->>'id')::uuid FROM pg_temp.storage_claims)
    AND estado='pendente'));
SELECT is((SELECT count(*) FROM private.account_deletion_files WHERE request_id=(SELECT (claim->>'id')::uuid FROM pg_temp.storage_claims)
  AND estado='removido'),201::bigint,'every acknowledged A path has a durable checkpoint');
SELECT is((SELECT estado FROM private.account_deletion_files WHERE request_id=pg_temp.test_id('request:' || pg_temp.test_id('b')::text)),
  'pendente','B manifest rows remain untouched');

UPDATE private.account_deletion_executions SET lease_until=now()-interval '1 second'
WHERE request_id=(SELECT (claim->>'id')::uuid FROM pg_temp.storage_claims);
SELECT throws_ok($$ SELECT public.ack_account_deletion_files(
  (SELECT (claim->>'id')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'leaseToken')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'generation')::bigint FROM pg_temp.storage_claims),ARRAY[]::uuid[]) $$,
  'P0001','LEASE_INVALIDA','a lost lease cannot acknowledge or advance a checkpoint');
UPDATE private.account_deletion_executions SET lease_until=now()+interval '2 minutes'
WHERE request_id=(SELECT (claim->>'id')::uuid FROM pg_temp.storage_claims);
SELECT lives_ok($$ SELECT public.advance_account_deletion(
  (SELECT (claim->>'id')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'leaseToken')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'generation')::bigint FROM pg_temp.storage_claims),'storage_purged') $$,
  'storage advances only from data_purged after every acknowledgement');
SELECT throws_ok($$ SELECT public.advance_account_deletion(
  (SELECT (claim->>'id')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'leaseToken')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'generation')::bigint FROM pg_temp.storage_claims),'auth_deleted') $$,
  'P0001','AUTH_EXCLUSAO_NAO_CONFIRMADA','auth cannot advance while the user exists');
DELETE FROM auth.users WHERE id=pg_temp.test_id('a');
SELECT lives_ok($$ SELECT public.advance_account_deletion(
  (SELECT (claim->>'id')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'leaseToken')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'generation')::bigint FROM pg_temp.storage_claims),'auth_deleted') $$,
  'auth advances only after identity and managed sessions are absent');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.list_account_deletion_files(
  (SELECT (claim->>'id')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'leaseToken')::uuid FROM pg_temp.storage_claims),
  (SELECT (claim->>'generation')::bigint FROM pg_temp.storage_claims),100) $$,
  '42501',NULL,'ordinary sessions cannot list the private Storage manifest');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
