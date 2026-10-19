BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

\set account_deletion_fixture_included true
\ir fixtures/account_deletion.sql

-- This adapter lets the RED suite demonstrate the missing expiry behaviour as
-- an assertion failure, rather than a missing-function harness error.
CREATE OR REPLACE FUNCTION pg_temp.expire_retention(p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE v_result jsonb;
BEGIN
  IF to_regprocedure('public.expire_account_deletion_retention(integer)') IS NULL THEN
    RETURN '{"expired":0,"pending":0}'::jsonb;
  END IF;
  EXECUTE 'SELECT public.expire_account_deletion_retention($1)' INTO v_result USING p_limit;
  RETURN v_result;
END;
$$;

SELECT pg_temp.enable_test_policy();
INSERT INTO public.hubs (id, nome, endereco, lat, lng)
VALUES (pg_temp.test_id('expiry-hub'), 'Hub expiry', 'Rua expiry, 1', 0, 0);
INSERT INTO public.pedidos (
  id, cliente_id, estabelecimento_id, hub_id, status, pago_em, entregue_em,
  subtotal_produtos_reais, taxa_deslocamento_reais, taxa_keepit_reais,
  total_pago_reais, asaas_payment_id
)
SELECT pg_temp.test_id('expiry-pedido-vencido'), pg_temp.test_id('a'), e.id,
  pg_temp.test_id('expiry-hub'), 'entregue', now() - interval '5 years',
  now() - interval '5 years', 10, 0, 0, 10, 'pay-expirado'
FROM public.estabelecimentos e WHERE e.dono_user_id = pg_temp.test_id('lojista');
INSERT INTO public.pedidos (
  id, cliente_id, estabelecimento_id, hub_id, status, pago_em, entregue_em,
  subtotal_produtos_reais, taxa_deslocamento_reais, taxa_keepit_reais,
  total_pago_reais, asaas_payment_id
)
SELECT pg_temp.test_id('expiry-pedido-futuro'), pg_temp.test_id('b'), e.id,
  pg_temp.test_id('expiry-hub'), 'entregue', now() - interval '4 years',
  now() - interval '4 years', 20, 0, 0, 20, 'pay-futuro'
FROM public.estabelecimentos e WHERE e.dono_user_id = pg_temp.test_id('lojista');

SELECT pg_temp.due_request(pg_temp.test_id('a')) AS expired_request_id \gset
SELECT pg_temp.due_request(pg_temp.test_id('b')) AS future_request_id \gset
INSERT INTO private.retencoes_conta (
  solicitacao_id, tabela, linha_id, campo, valor_minimo, versao_politica,
  encerramento_financeiro, expira_em
) VALUES
  (:'expired_request_id'::uuid, 'public.pedidos', pg_temp.test_id('expiry-pedido-vencido'),
    'asaas_payment_id', 'pay-expirado', 'test-mvp', now() - interval '5 years', now()),
  (:'future_request_id'::uuid, 'public.pedidos', pg_temp.test_id('expiry-pedido-futuro'),
    'asaas_payment_id', 'pay-futuro', 'test-mvp', now() - interval '4 years', now() + interval '1 year');

-- Removing either source cleanup or private cleanup makes these assertions fail.
SELECT is(pg_temp.expire_retention(10)->>'expired', '1',
  'the exact five-year boundary expires one retained financial reference');
SELECT is((SELECT asaas_payment_id FROM public.pedidos WHERE id=pg_temp.test_id('expiry-pedido-vencido')),
  NULL::text, 'an expired financial reference is removed from its historical source');
SELECT is((SELECT count(*) FROM private.retencoes_conta
  WHERE linha_id=pg_temp.test_id('expiry-pedido-vencido')), 0::bigint,
  'an expired financial reference is removed from the private copy');
SELECT is((SELECT total_pago_reais FROM public.pedidos WHERE id=pg_temp.test_id('expiry-pedido-vencido')),
  10::numeric, 'expiry preserves the historical monetary total');
SELECT is((SELECT asaas_payment_id FROM public.pedidos WHERE id=pg_temp.test_id('expiry-pedido-futuro')),
  'pay-futuro', 'a future financial reference remains available until its fixed expiry');
SELECT is((SELECT count(*) FROM private.retencoes_conta
  WHERE linha_id=pg_temp.test_id('expiry-pedido-futuro')), 1::bigint,
  'a future private retention remains available until its fixed expiry');
SELECT is(pg_temp.expire_retention(10)->>'expired', '0',
  'replaying expiry does not duplicate the already-completed effect');

-- A completed request is minimum audit A, not a five-year dependency of F.
UPDATE public.account_deletion_requests
SET status='completed', user_id=NULL, completed_at=now() - interval '180 days'
WHERE id=:'expired_request_id'::uuid;
INSERT INTO private.account_deletion_executions (
  request_id, policy_version, phase, generation, has_cliente, has_lojista
) VALUES (:'expired_request_id'::uuid, 'test-mvp', 'completed', 1, true, false);
SELECT is(pg_temp.expire_retention(10)->>'expired', '1',
  'the exact 180-day audit boundary expires independently of financial retention');
SELECT is((SELECT count(*) FROM public.account_deletion_requests WHERE id=:'expired_request_id'::uuid),
  0::bigint, 'expired audit metadata is removed after the fixed A deadline');
SELECT is((SELECT count(*) FROM private.account_deletion_executions WHERE request_id=:'expired_request_id'::uuid),
  0::bigint, 'expired private execution metadata is removed with its audit request');
UPDATE public.account_deletion_requests
SET status='completed', user_id=NULL, completed_at=now() - interval '180 days'
WHERE id=:'future_request_id'::uuid;
SELECT is(pg_temp.expire_retention(10)->>'expired', '1',
  'an expired audit can be removed while its own five-year financial retention remains');
SELECT is((SELECT count(*) FROM public.account_deletion_requests WHERE id=:'future_request_id'::uuid),
  0::bigint, 'financial retention does not require keeping its audit request for five years');
SELECT is((SELECT count(*) FROM private.retencoes_conta
  WHERE linha_id=pg_temp.test_id('expiry-pedido-futuro')), 1::bigint,
  'financial retention survives after its independent audit deadline');

SELECT pg_temp.disable_test_policy();
SELECT throws_ok($$ SELECT public.expire_account_deletion_retention(10) $$,
  'P0001', 'POLITICA_RETENCAO_NAO_HABILITADA',
  'a disabled policy prevents retention expiry');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.expire_account_deletion_retention(10) $$,
  '42501', NULL, 'ordinary sessions cannot invoke retention expiry');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
