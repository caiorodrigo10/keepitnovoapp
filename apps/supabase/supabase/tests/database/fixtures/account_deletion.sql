-- Reusable synthetic identities for account-deletion pgTAP suites.  This file
-- never represents an approved operational policy and runs inside each test
-- transaction.
\if :{?account_deletion_fixture_included}
\else
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(1);
\endif

CREATE OR REPLACE FUNCTION pg_temp.test_id(p_label text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ('00000000-0000-4000-8000-' || substr(md5(p_label), 1, 12))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_test_policy(
  p_version text DEFAULT 'test-mvp',
  p_enabled boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- The RED suite is intentionally runnable before Task 1's columns exist.
  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    WHERE a.attrelid = 'private.politicas_retencao_cartoes'::regclass
      AND a.attname = 'versao'
      AND NOT a.attisdropped
  ) AND EXISTS (
    SELECT 1
    FROM pg_attribute a
    WHERE a.attrelid = 'private.politicas_retencao_cartoes'::regclass
      AND a.attname = 'habilitada'
      AND NOT a.attisdropped
  ) THEN
    DELETE FROM private.politicas_retencao_cartoes
    WHERE escopo = 'cartoes_salvos';
    INSERT INTO private.politicas_retencao_cartoes
      (escopo, aprovada_em, aprovado_por, evidencia, versao, habilitada)
    VALUES
      ('cartoes_salvos', now(), 'fixture-sintetica', 'fixture-sintetica', p_version, p_enabled);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.enable_test_policy()
RETURNS void
LANGUAGE sql
AS $$ SELECT pg_temp.set_test_policy('test-mvp', true) $$;

CREATE OR REPLACE FUNCTION pg_temp.disable_test_policy()
RETURNS void
LANGUAGE sql
AS $$ SELECT pg_temp.set_test_policy('test-mvp', false) $$;

INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
VALUES
  (pg_temp.test_id('a'), 'authenticated', 'authenticated', 'fixture-a@example.invalid', '{"nome":"Fixture A"}'),
  (pg_temp.test_id('b'), 'authenticated', 'authenticated', 'fixture-b@example.invalid', '{"nome":"Fixture B"}'),
  (pg_temp.test_id('lojista'), 'authenticated', 'authenticated', 'fixture-lojista@example.invalid', '{"nome":"Fixture Lojista"}'),
  (pg_temp.test_id('duplo'), 'authenticated', 'authenticated', 'fixture-duplo@example.invalid', '{"nome":"Fixture Duplo"}'),
  (pg_temp.test_id('admin'), 'authenticated', 'authenticated', 'fixture-admin@example.invalid', '{"nome":"Fixture Admin"}');

-- The Auth trigger owns profile creation.  Fixtures only complete its rows;
-- they never duplicate a clientes insert.
UPDATE public.clientes
SET nome = 'Fixture ' || upper(label)
FROM (VALUES
  (pg_temp.test_id('a'), 'a'),
  (pg_temp.test_id('b'), 'b'),
  (pg_temp.test_id('lojista'), 'lojista'),
  (pg_temp.test_id('duplo'), 'duplo'),
  (pg_temp.test_id('admin'), 'admin')
) AS fixture(id, label)
WHERE public.clientes.id = fixture.id;

INSERT INTO public.estabelecimentos
  (dono_user_id, nome_fantasia, cnpj, responsavel_nome, telefone, categoria,
   endereco, tempo_medio_entrega_min, chave_pix, chave_pix_tipo)
VALUES
  (pg_temp.test_id('lojista'), 'Loja fixture L', '00000000000191', 'Fixture Lojista',
   '11900000001', 'alimentacao', 'Rua fixture L, 1', 30, 'fixture-lojista', 'aleatoria'),
  (pg_temp.test_id('duplo'), 'Loja fixture D', '00000000000272', 'Fixture Duplo',
   '11900000002', 'alimentacao', 'Rua fixture D, 2', 30, 'fixture-duplo', 'aleatoria');

INSERT INTO public.admin_users (id, nome)
VALUES (pg_temp.test_id('admin'), 'Fixture Admin');

CREATE OR REPLACE FUNCTION pg_temp.due_request(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE v_request_id uuid := pg_temp.test_id('request:' || p_user_id::text);
BEGIN
  INSERT INTO public.account_deletion_requests
    (id, user_id, status, requested_at, delete_at)
  VALUES (v_request_id, p_user_id, 'scheduled', now() - interval '8 days', now() - interval '1 day')
  ON CONFLICT (id) DO UPDATE
    SET status = 'scheduled', requested_at = EXCLUDED.requested_at, delete_at = EXCLUDED.delete_at,
        cancelled_at = NULL, processing_at = NULL, completed_at = NULL, failed_at = NULL, failure_code = NULL;
  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.claim_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_claims jsonb;
BEGIN
  -- Dynamic SQL keeps the reusable Task 1 fixture loadable before the claimant
  -- exists; Task 2 tests exercise the real RPC and never manufacture a lease.
  EXECUTE 'SELECT coalesce(jsonb_agg(claim), ''[]''::jsonb)
             FROM public.claim_account_deletions(20) AS claim'
    INTO v_claims;

  IF jsonb_array_length(v_claims) <> 1
    OR v_claims -> 0 ->> 'userId' IS DISTINCT FROM p_user_id::text THEN
    RAISE EXCEPTION 'expected exactly one real claim for %, got %', p_user_id, v_claims;
  END IF;

  RETURN v_claims -> 0;
END;
$$;

\if :{?account_deletion_fixture_included}
\else
SELECT pass('the reusable account-deletion fixture loads independently');
SELECT * FROM finish();
ROLLBACK;
\endif
