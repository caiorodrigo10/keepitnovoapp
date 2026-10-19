BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

\set account_deletion_fixture_included true
\ir fixtures/account_deletion.sql

-- This wrapper keeps the first RED runnable before the public helper exists.
-- The production change that must make the asserted B case fail is removal or
-- weakening of public.conta_tem_acesso(), not an absent test dependency.
CREATE OR REPLACE FUNCTION pg_temp.conta_tem_acesso()
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE v_result boolean := false;
BEGIN
  IF to_regprocedure('public.conta_tem_acesso()') IS NOT NULL THEN
    EXECUTE 'SELECT public.conta_tem_acesso()' INTO v_result;
  END IF;
  RETURN coalesce(v_result, false);
END;
$$;

SELECT has_function('public', 'conta_tem_acesso', ARRAY[]::text[],
  'the access helper has no caller-supplied user id');
SELECT has_function('private', 'exigir_conta_gravavel', ARRAY['uuid'],
  'sensitive writers share a private writable-account guard');

SELECT pg_temp.enable_test_policy();
SELECT pg_temp.due_request(pg_temp.test_id('a'));
SELECT pg_temp.claim_user(pg_temp.test_id('a'));

SELECT set_config('request.jwt.claim.sub', pg_temp.test_id('a')::text, true);
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.conta_tem_acesso(), false,
  'a JWT issued before A was claimed loses account access');
SELECT is((SELECT count(*) FROM public.clientes), 0::bigint,
  'A cannot read business-profile data after processing starts');
WITH changed AS (
  UPDATE public.clientes
  SET telefone = '11999999999'
  WHERE id = pg_temp.test_id('a')
  RETURNING 1
)
SELECT is((SELECT count(*) FROM changed), 0::bigint,
  'A cannot write its profile after processing starts');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$SELECT public.cotar_pedido('00000000-0000-4000-8000-000000000001',
                               '00000000-0000-4000-8000-000000000002',
                               '[]'::jsonb)$$,
  'P0001', 'CONTA_EM_EXCLUSAO',
  'A cannot create a quote or order after processing starts');
SELECT throws_ok(
  $$SELECT public.criar_pedido_cotado('00000000-0000-4000-8000-000000000003',
                                      'pix', false,
                                      '00000000-0000-4000-8000-000000000004')$$,
  'P0001', 'CONTA_EM_EXCLUSAO',
  'A cannot turn a quote created before processing into a late order');
SELECT throws_ok(
  format($sql$
    SELECT public.registrar_operacao_cartao_service(
      %L::uuid, '00000000-0000-4000-8000-000000000003'::uuid,
      '00000000-0000-4000-8000-000000000004'::uuid,
      'compra', 'sandbox', true, NULL)
  $sql$, pg_temp.test_id('a')::text),
  'P0001', 'CONTA_EM_EXCLUSAO',
  'a delayed card-save writer cannot create a saved-card operation for A');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', pg_temp.test_id('a')::text, true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($sql$
    INSERT INTO storage.objects(bucket_id, name, owner_id)
    VALUES ('fachadas', %L, %L::uuid)
  $sql$, pg_temp.test_id('a')::text || '/blocked.png', pg_temp.test_id('a')::text),
  '42501', NULL,
  'A cannot upload after processing starts');
RESET ROLE;

-- Status/cancel are intentional exceptions: after Task 5 unlinks the public
-- request user id, Task 2's private execution lookup remains available.
UPDATE public.account_deletion_requests
SET user_id = NULL
WHERE user_id = pg_temp.test_id('a');
SELECT is((SELECT status FROM public.status_account_deletion_request(pg_temp.test_id('a'))),
  'processing', 'processing status remains available through its explicit exception');

SELECT set_config('request.jwt.claim.sub', pg_temp.test_id('b')::text, true);
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.conta_tem_acesso(), true,
  'B remains authorized while A is processing');
SELECT is((SELECT count(*) FROM public.clientes), 1::bigint,
  'B can still read its own profile');
WITH uploaded AS (
  INSERT INTO storage.objects(bucket_id, name, owner_id)
  VALUES ('fachadas', pg_temp.test_id('b')::text || '/allowed.png', pg_temp.test_id('b'))
  RETURNING 1
)
SELECT is((SELECT count(*) FROM uploaded), 1::bigint,
  'B can still upload to its own folder');
RESET ROLE;

-- Task 5 performs this unlink before the real Auth Admin hard delete.  The
-- session remains signed, so access must depend on Auth existence, not JWT age.
DELETE FROM auth.users WHERE id = pg_temp.test_id('a');

SELECT set_config('request.jwt.claim.sub', pg_temp.test_id('a')::text, true);
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.conta_tem_acesso(), false,
  'a still-signed JWT is denied after its Auth identity is hard-deleted');
SELECT is((SELECT count(*) FROM public.clientes), 0::bigint,
  'the hard-deleted JWT cannot regain a profile through stale claims');
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claim.user_metadata', '{"role":"service_role"}', true);
SELECT is(pg_temp.conta_tem_acesso(), false,
  'metadata or role GUC changes cannot revive a deleted identity');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
