BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

\set account_deletion_fixture_included true
\ir fixtures/account_deletion.sql

SELECT pg_temp.enable_test_policy();

-- This test protects the SQL checkpoint from reintroducing direct payout PII
-- or changing the retained financial snapshot.  The migration must make an
-- all-or-nothing anonymous recipient legal, but never a partial recipient.
INSERT INTO public.repasses (
  id, estabelecimento_id, semana_inicio, previsto_para, valor_centavos, estado,
  destinatario_nome, destinatario_responsavel, chave_pix, chave_pix_tipo,
  preparado_em, preparado_por, invalidado_em, invalidado_por,
  invalidacao_operacao_id, motivo_invalidacao, referencia
)
SELECT
  pg_temp.test_id('repasse-lojista'), id, date '2026-10-12', date '2026-10-23',
  12345, 'invalidado', 'Nome Lojista', 'Responsável Lojista',
  'pix-lojista@example.invalid', 'email',
  '2026-10-12 10:00:00+00', pg_temp.test_id('lojista'),
  '2026-10-13 10:00:00+00', pg_temp.test_id('lojista'),
  pg_temp.test_id('operacao-invalidacao-lojista'), 'motivo pessoal lojista',
  'referencia-publica-lojista'
FROM public.estabelecimentos
WHERE dono_user_id = pg_temp.test_id('lojista');

INSERT INTO public.repasses (
  id, estabelecimento_id, semana_inicio, previsto_para, valor_centavos, estado,
  destinatario_nome, destinatario_responsavel, chave_pix, chave_pix_tipo,
  preparado_em, preparado_por
)
SELECT
  pg_temp.test_id('repasse-duplo'), id, date '2026-10-19', date '2026-10-30',
  67890, 'pendente', 'Nome Duplo', 'Responsável Duplo',
  'pix-duplo@example.invalid', 'email',
  '2026-10-19 10:00:00+00', pg_temp.test_id('duplo')
FROM public.estabelecimentos
WHERE dono_user_id = pg_temp.test_id('duplo');

SELECT throws_ok($$
  INSERT INTO public.repasses (
    id, estabelecimento_id, semana_inicio, previsto_para, valor_centavos, estado,
    destinatario_nome, destinatario_responsavel, chave_pix, chave_pix_tipo, preparado_por
  )
  SELECT pg_temp.test_id('repasse-pii-parcial'), id, date '2026-10-26', date '2026-11-06',
    1, 'pendente', NULL, 'Responsável parcial', 'pix-parcial@example.invalid', 'email',
    pg_temp.test_id('lojista')
  FROM public.estabelecimentos WHERE dono_user_id = pg_temp.test_id('lojista')
$$, '23514', NULL, 'the anonymous-recipient constraint rejects partial payout PII');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.test_id('admin')::text, true);
SELECT throws_ok($$
  UPDATE public.repasses SET destinatario_nome = NULL
  WHERE id = pg_temp.test_id('repasse-lojista')
$$, '42501', NULL, 'an ordinary Admin cannot enable the payout-redaction exception');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT set_config('keepit.account_deletion_request', pg_temp.test_id('request:arbitrario')::text, true);
SELECT throws_ok($$
  UPDATE public.repasses SET destinatario_nome = NULL
  WHERE id = pg_temp.test_id('repasse-lojista')
$$, '42501', NULL, 'an arbitrary request setting cannot enable the payout-redaction exception');
RESET ROLE;

CREATE TEMP TABLE pg_temp.repasse_claims (claim jsonb NOT NULL);
SELECT pg_temp.due_request(pg_temp.test_id('lojista'));
INSERT INTO pg_temp.repasse_claims SELECT pg_temp.claim_user(pg_temp.test_id('lojista'));

SELECT lives_ok($$
  SELECT public.purge_account_deletion_cards(
    (SELECT (claim->>'id')::uuid FROM pg_temp.repasse_claims),
    (SELECT (claim->>'leaseToken')::uuid FROM pg_temp.repasse_claims),
    (SELECT (claim->>'generation')::bigint FROM pg_temp.repasse_claims)
  )
$$, 'the eligible merchant reaches the cards checkpoint');
SELECT lives_ok($$
  SELECT public.apply_account_deletion_data(
    (SELECT (claim->>'id')::uuid FROM pg_temp.repasse_claims),
    (SELECT (claim->>'leaseToken')::uuid FROM pg_temp.repasse_claims),
    (SELECT (claim->>'generation')::bigint FROM pg_temp.repasse_claims)
  )
$$, 'the account-data checkpoint redacts the eligible merchant payout');

SELECT is((SELECT destinatario_nome FROM public.repasses WHERE id = pg_temp.test_id('repasse-lojista')),
  NULL::text, 'the payout recipient name is removed');
SELECT is((SELECT destinatario_responsavel FROM public.repasses WHERE id = pg_temp.test_id('repasse-lojista')),
  NULL::text, 'the payout recipient contact is removed');
SELECT is((SELECT chave_pix FROM public.repasses WHERE id = pg_temp.test_id('repasse-lojista')),
  NULL::text, 'the payout PIX key is removed');
SELECT is((SELECT chave_pix_tipo FROM public.repasses WHERE id = pg_temp.test_id('repasse-lojista')),
  NULL::text, 'the payout PIX key type is removed');
SELECT is((SELECT motivo_invalidacao FROM public.repasses WHERE id = pg_temp.test_id('repasse-lojista')),
  NULL::text, 'the payout free-text reason is removed');
SELECT is((SELECT referencia FROM public.repasses WHERE id = pg_temp.test_id('repasse-lojista')),
  NULL::text, 'the public payout reference is removed');
SELECT is((SELECT (id, estabelecimento_id, semana_inicio, previsto_para, valor_centavos, estado,
  preparado_em, invalidado_em, invalidacao_operacao_id)::text
  FROM public.repasses WHERE id = pg_temp.test_id('repasse-lojista')),
  (pg_temp.test_id('repasse-lojista'),
   (SELECT id FROM public.estabelecimentos WHERE nome_fantasia = 'Estabelecimento excluído'),
   date '2026-10-12', date '2026-10-23', 12345::bigint, 'invalidado',
   '2026-10-12 10:00:00+00'::timestamptz, '2026-10-13 10:00:00+00'::timestamptz,
   pg_temp.test_id('operacao-invalidacao-lojista'))::text,
  'the payout ID, merchant shell, schedule, value, state and timestamps remain intact');
SELECT is((SELECT (destinatario_nome, destinatario_responsavel, chave_pix, chave_pix_tipo, valor_centavos)::text
  FROM public.repasses WHERE id = pg_temp.test_id('repasse-duplo')),
  ('Nome Duplo', 'Responsável Duplo', 'pix-duplo@example.invalid', 'email', 67890::bigint)::text,
  'another merchant payout remains intact');

SELECT * FROM finish();
ROLLBACK;
