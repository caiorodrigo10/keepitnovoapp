BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

\set account_deletion_fixture_included true
\ir fixtures/account_deletion.sql

CREATE TEMP TABLE pg_temp.card_claims (
  label text PRIMARY KEY,
  claim jsonb NOT NULL
);

CREATE OR REPLACE FUNCTION pg_temp.purge_claim(p_label text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE v_claim jsonb;
BEGIN
  SELECT claim INTO v_claim FROM pg_temp.card_claims WHERE label = p_label;
  RETURN public.purge_account_deletion_cards(
    (v_claim ->> 'id')::uuid,
    (v_claim ->> 'leaseToken')::uuid,
    (v_claim ->> 'generation')::bigint
  );
END;
$$;

SELECT pg_temp.enable_test_policy();

INSERT INTO private.clientes_asaas (cliente_id, ambiente, asaas_customer_id, estado)
VALUES
  (pg_temp.test_id('a'), 'sandbox', 'cus_a_reusable', 'pronto'),
  (pg_temp.test_id('b'), 'sandbox', 'cus_b_reusable', 'pronto');

INSERT INTO public.clientes_cartoes
  (id, cliente_id, ambiente, asaas_customer_id, asaas_credit_card_token, bandeira, ultimo4)
VALUES
  (pg_temp.test_id('card-a'), pg_temp.test_id('a'), 'sandbox', 'cus_a_reusable', 'token_saved_a', 'VISA', '1111'),
  (pg_temp.test_id('card-b'), pg_temp.test_id('b'), 'sandbox', 'cus_b_reusable', 'token_saved_b', 'VISA', '2222');

INSERT INTO private.cartoes_operacoes
  (cliente_id, operacao_id, contexto, ambiente, asaas_customer_id, salvar_cartao,
   cartao_salvo_id, claim_token, claim_expira_em, token_temporario,
   bandeira_temporaria, ultimo4_temporario, asaas_payment_id)
VALUES
  (pg_temp.test_id('a'), pg_temp.test_id('card-operation-a'), 'perfil', 'sandbox',
   'cus_a_reusable', true, pg_temp.test_id('card-a'), pg_temp.test_id('card-operation-claim-a'),
   now() + interval '2 minutes', 'token_temp_a', 'VISA', '1111', 'payment-a'),
  (pg_temp.test_id('b'), pg_temp.test_id('card-operation-b'), 'perfil', 'sandbox',
   'cus_b_reusable', true, pg_temp.test_id('card-b'), pg_temp.test_id('card-operation-claim-b'),
   now() + interval '2 minutes', 'token_temp_b', 'VISA', '2222', 'payment-b');

INSERT INTO private.validacoes_cartoes
  (cliente_id, operacao_id, ambiente, valor_centavos, referencia_externa,
   asaas_customer_id, token_temporario, bandeira_temporaria, ultimo4_temporario,
   asaas_cobranca_id, estado, claim_etapa, claim_token, claim_expira_em)
VALUES
  (pg_temp.test_id('a'), pg_temp.test_id('validation-a'), 'sandbox', 137,
   'card-validation-a', 'cus_validation_a', 'token_validation_a', 'VISA', '1111',
   'payment-validation-a', 'concluida', 'finalizar', pg_temp.test_id('validation-claim-a'),
   now() + interval '2 minutes'),
  (pg_temp.test_id('a'), pg_temp.test_id('validation-discard-a'), 'sandbox', 138,
   'card-validation-discard-a', 'cus_validation_discard_a', NULL, NULL, NULL,
   NULL, 'concluida', NULL, NULL, NULL);

SELECT pg_temp.due_request(pg_temp.test_id('a'));
INSERT INTO pg_temp.card_claims (label, claim)
VALUES ('a-stale', pg_temp.claim_user(pg_temp.test_id('a')));

UPDATE private.account_deletion_executions
SET lease_until = now() - interval '1 second'
WHERE target_user_id = pg_temp.test_id('a');
INSERT INTO pg_temp.card_claims (label, claim)
VALUES ('a-current', pg_temp.claim_user(pg_temp.test_id('a')));

SELECT has_function('public', 'purge_account_deletion_cards', ARRAY['uuid', 'uuid', 'bigint'],
  'the checkpointing card-purge wrapper exists');
SELECT throws_ok($$ SELECT pg_temp.purge_claim('a-stale') $$,
  'P0001', 'LEASE_INVALIDA', 'a stale worker cannot advance the card checkpoint');
SELECT lives_ok($$ SELECT pg_temp.purge_claim('a-current') $$,
  'the current fenced claim purges cards and records its checkpoint');

SELECT is((SELECT count(*) FROM public.clientes_cartoes WHERE cliente_id = pg_temp.test_id('a')),
  0::bigint, 'A saved cards and tokens are removed');
SELECT is((SELECT count(*) FROM private.clientes_asaas WHERE cliente_id = pg_temp.test_id('a')),
  0::bigint, 'A reusable customer linkage is removed');
SELECT is((SELECT count(*) FROM private.cartoes_operacoes
  WHERE cliente_id = pg_temp.test_id('a')
    AND (token_temporario IS NOT NULL OR bandeira_temporaria IS NOT NULL
      OR ultimo4_temporario IS NOT NULL OR asaas_customer_id IS NOT NULL
      OR cartao_salvo_id IS NOT NULL OR claim_token IS NOT NULL OR claim_expira_em IS NOT NULL)),
  0::bigint, 'A temporary card data and claims are erased');
SELECT is((SELECT count(*) FROM private.validacoes_cartoes
  WHERE cliente_id = pg_temp.test_id('a')
    AND (token_temporario IS NOT NULL OR bandeira_temporaria IS NOT NULL
      OR ultimo4_temporario IS NOT NULL OR claim_etapa IS NOT NULL
      OR claim_token IS NOT NULL OR claim_expira_em IS NOT NULL)),
  0::bigint, 'A validation tokens and claims are erased');
SELECT is((SELECT asaas_customer_id FROM private.validacoes_cartoes
  WHERE operacao_id = pg_temp.test_id('validation-a')),
  'cus_validation_a', 'only the customer indispensable to an existing financial reconciliation remains');
SELECT is((SELECT asaas_customer_id FROM private.validacoes_cartoes
  WHERE operacao_id = pg_temp.test_id('validation-discard-a')),
  NULL, 'a validation customer without a charge or refund is not retained');
SELECT is((SELECT prazo_financeiro_anos FROM private.politicas_retencao_cartoes
  WHERE escopo = 'cartoes_salvos'), 5::smallint,
  'the retained validation customer remains subject to the fixed financial-retention term');
SELECT is((SELECT count(*) FROM private.retencoes_conta
  WHERE solicitacao_id = (SELECT (claim ->> 'id')::uuid FROM pg_temp.card_claims WHERE label = 'a-current')),
  0::bigint, 'no token or customer is copied into a retention or audit row');
SELECT is((SELECT phase FROM private.account_deletion_executions
  WHERE target_user_id = pg_temp.test_id('a')),
  'cards_purged', 'the same transaction advances only to cards_purged');

SELECT pg_temp.due_request(pg_temp.test_id('b'));
INSERT INTO pg_temp.card_claims (label, claim)
VALUES ('b-current', pg_temp.claim_user(pg_temp.test_id('b')));
SELECT throws_ok($$
  SELECT public.purge_account_deletion_cards(
    (SELECT (claim ->> 'id')::uuid FROM pg_temp.card_claims WHERE label = 'a-current'),
    (SELECT (claim ->> 'leaseToken')::uuid FROM pg_temp.card_claims WHERE label = 'b-current'),
    (SELECT (claim ->> 'generation')::bigint FROM pg_temp.card_claims WHERE label = 'b-current')
  )
$$, 'P0001', 'LEASE_INVALIDA', 'another holder request cannot reuse a lease');
SELECT is((SELECT count(*) FROM public.clientes_cartoes WHERE cliente_id = pg_temp.test_id('b')),
  1::bigint, 'B remains untouched by A card purge');

-- Task 5 changes these historical links to nullable/RESTRICT.  Simulate its
-- explicit detachment here so this Task 4 replay proof still exercises a
-- missing profile without relying on the old destructive cascade.
UPDATE private.cartoes_operacoes SET cliente_id = NULL WHERE cliente_id = pg_temp.test_id('a');
UPDATE private.validacoes_cartoes SET cliente_id = NULL WHERE cliente_id = pg_temp.test_id('a');
DELETE FROM public.clientes WHERE id = pg_temp.test_id('a');
SELECT is(pg_temp.purge_claim('a-current') ->> 'purged', 'true',
  'a valid cards_purged checkpoint replays after the customer profile is gone');

DELETE FROM public.clientes WHERE id = pg_temp.test_id('lojista');
SELECT pg_temp.due_request(pg_temp.test_id('lojista'));
INSERT INTO pg_temp.card_claims (label, claim)
VALUES ('lojista-current', pg_temp.claim_user(pg_temp.test_id('lojista')));
SELECT is(pg_temp.purge_claim('lojista-current') ->> 'purged', 'true',
  'a merchant without a customer profile advances only after proving card-link absence');
SELECT is((SELECT phase FROM private.account_deletion_executions
  WHERE target_user_id = pg_temp.test_id('lojista')),
  'cards_purged', 'the merchant absence proof records cards_purged');

INSERT INTO private.clientes_asaas (cliente_id, ambiente, asaas_customer_id, estado)
VALUES (pg_temp.test_id('duplo'), 'sandbox', 'cus_duplo_residual', 'pronto');
INSERT INTO public.clientes_cartoes
  (id, cliente_id, ambiente, asaas_customer_id, asaas_credit_card_token, bandeira, ultimo4)
VALUES
  (pg_temp.test_id('card-duplo'), pg_temp.test_id('duplo'), 'sandbox',
   'cus_duplo_residual', 'token_saved_duplo', 'VISA', '3333');
SELECT pg_temp.due_request(pg_temp.test_id('duplo'));
INSERT INTO pg_temp.card_claims (label, claim)
VALUES ('duplo-inconsistent', pg_temp.claim_user(pg_temp.test_id('duplo')));
UPDATE private.account_deletion_executions
SET has_cliente = false
WHERE target_user_id = pg_temp.test_id('duplo');
SELECT throws_ok($$ SELECT pg_temp.purge_claim('duplo-inconsistent') $$,
  'P0001', 'PURGA_CARTOES_INCOMPLETA',
  'a no-customer snapshot with residual card links fails closed instead of calling the legacy purge');
SELECT is((SELECT count(*) FROM public.clientes_cartoes WHERE cliente_id = pg_temp.test_id('duplo')),
  1::bigint, 'the failed merchant absence proof does not purge residual card data');

SET LOCAL ROLE authenticated;
SELECT throws_ok($$
  SELECT public.purge_account_deletion_cards(
    (SELECT (claim ->> 'id')::uuid FROM pg_temp.card_claims WHERE label = 'b-current'),
    (SELECT (claim ->> 'leaseToken')::uuid FROM pg_temp.card_claims WHERE label = 'b-current'),
    (SELECT (claim ->> 'generation')::bigint FROM pg_temp.card_claims WHERE label = 'b-current')
  )
$$, '42501', NULL, 'ordinary sessions cannot run the checkpointing purge');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
