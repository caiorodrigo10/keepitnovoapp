BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);

\set account_deletion_fixture_included true
\ir fixtures/account_deletion.sql

SELECT pg_temp.enable_test_policy();

INSERT INTO public.hubs (id, nome, endereco, lat, lng)
VALUES (pg_temp.test_id('projection-hub'), 'Hub projections', 'Rua projections, 1', 0, 0);

INSERT INTO public.pedidos (
  id, cliente_id, estabelecimento_id, hub_id, status, pago_em, entregue_em,
  subtotal_produtos_reais, taxa_deslocamento_reais, taxa_keepit_reais, total_pago_reais
)
SELECT pg_temp.test_id('projection-order'), pg_temp.test_id('a'), e.id,
  pg_temp.test_id('projection-hub'), 'entregue', now(), now(), 10, 2, 1, 12
FROM public.estabelecimentos e
WHERE e.dono_user_id = pg_temp.test_id('lojista');

INSERT INTO public.lancamentos_financeiros (
  id, estabelecimento_id, pedido_id, tipo, valor_centavos, status, semana_inicio
)
SELECT pg_temp.test_id('projection-ledger'), e.id, pg_temp.test_id('projection-order'),
  'merchant_credit', 1100, 'concluido', date_trunc('week', now())::date
FROM public.estabelecimentos e
WHERE e.dono_user_id = pg_temp.test_id('lojista');

SELECT pg_temp.due_request(pg_temp.test_id('a'));
SELECT pg_temp.claim_user(pg_temp.test_id('a')) AS claim \gset
SELECT public.purge_account_deletion_cards(
  (:'claim'::jsonb ->> 'id')::uuid,
  (:'claim'::jsonb ->> 'leaseToken')::uuid,
  (:'claim'::jsonb ->> 'generation')::bigint
);
SELECT public.apply_account_deletion_data(
  (:'claim'::jsonb ->> 'id')::uuid,
  (:'claim'::jsonb ->> 'leaseToken')::uuid,
  (:'claim'::jsonb ->> 'generation')::bigint
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.test_id('lojista')::text, true);
SELECT is(
  (SELECT public.pedido_cliente_nome(p) FROM public.pedidos p WHERE id = pg_temp.test_id('projection-order')),
  'Cliente excluído',
  'authorized merchant sees an anonymous customer label after customer detachment'
);
SELECT is(
  (SELECT total_pago_reais FROM public.pedidos WHERE id = pg_temp.test_id('projection-order')),
  12::numeric,
  'authorized merchant keeps the settled historical total'
);
SELECT is(
  (SELECT saldo_disponivel_reais FROM public.carteira_lojista
    WHERE estabelecimento_id = (SELECT estabelecimento_id FROM public.pedidos WHERE id = pg_temp.test_id('projection-order'))),
  11::numeric,
  'wallet keeps the ledger-derived balance without recreating the deleted customer'
);
SELECT is(
  (SELECT valor_centavos FROM public.previsoes_repasse
    WHERE estabelecimento_id = (SELECT estabelecimento_id FROM public.pedidos WHERE id = pg_temp.test_id('projection-order'))),
  1100::bigint,
  'payout projection keeps the ledger-derived forecast without customer identity'
);
RESET ROLE;

INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
VALUES (pg_temp.test_id('c'), 'authenticated', 'authenticated', 'fixture-c@example.invalid', '{"nome":"Fixture C"}');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.test_id('c')::text, true);
SELECT is(
  (SELECT count(*) FROM public.pedidos WHERE id = pg_temp.test_id('projection-order')),
  0::bigint,
  'third party gains no order access when cliente_id is NULL'
);
SELECT is(
  public.pedido_cliente_nome(jsonb_populate_record(NULL::public.pedidos,
    jsonb_build_object('id', pg_temp.test_id('projection-order'), 'cliente_id', pg_temp.test_id('c')))),
  NULL::text,
  'forged composite does not reveal the anonymous order customer label'
);
SELECT throws_ok(
  'SELECT count(*) FROM private.retencoes_conta',
  '42501', NULL,
  'third party cannot recover private retention rows'
);
RESET ROLE;

SELECT pg_temp.due_request(pg_temp.test_id('lojista'));
SELECT pg_temp.claim_user(pg_temp.test_id('lojista')) AS merchant_claim \gset
SELECT public.purge_account_deletion_cards(
  (:'merchant_claim'::jsonb ->> 'id')::uuid,
  (:'merchant_claim'::jsonb ->> 'leaseToken')::uuid,
  (:'merchant_claim'::jsonb ->> 'generation')::bigint
);
SELECT public.apply_account_deletion_data(
  (:'merchant_claim'::jsonb ->> 'id')::uuid,
  (:'merchant_claim'::jsonb ->> 'leaseToken')::uuid,
  (:'merchant_claim'::jsonb ->> 'generation')::bigint
);

SET LOCAL ROLE anon;
SELECT is(
  (SELECT count(*) FROM public.estabelecimentos_publicos
    WHERE id = (SELECT estabelecimento_id FROM public.pedidos WHERE id = pg_temp.test_id('projection-order'))),
  0::bigint,
  'anonymous discovery does not list a deleted establishment shell'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.test_id('lojista')::text, true);
SELECT is(
  (SELECT count(*) FROM public.carteira_lojista
    WHERE estabelecimento_id = (SELECT estabelecimento_id FROM public.pedidos WHERE id = pg_temp.test_id('projection-order'))),
  0::bigint,
  'an old merchant JWT cannot recover a wallet row after ownership removal'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT is(
  (SELECT nome_fantasia FROM public.estabelecimentos
    WHERE id = (SELECT estabelecimento_id FROM public.pedidos WHERE id = pg_temp.test_id('projection-order'))),
  'Estabelecimento excluído',
  'historical establishment shell carries only the generic label'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
