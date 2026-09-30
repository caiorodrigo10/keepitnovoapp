BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT has_function(
  'public',
  'aprovar_lojista_com_hubs',
  ARRAY['uuid', 'uuid[]', 'uuid']::text[],
  'aprovação transacional com hubs disponível'
);
SELECT has_function(
  'public',
  'definir_hubs_lojista',
  ARRAY['uuid', 'uuid[]', 'uuid']::text[],
  'edição transacional de hubs disponível'
);

INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
VALUES
  ('77777777-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'cliente-hubs@example.invalid', '{}', '{"nome":"Cliente Hubs"}'),
  ('77777777-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'lojista-hubs@example.invalid', '{}', '{"role":"lojista"}'),
  ('77777777-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'admin-hubs@example.invalid', '{}', '{}'),
  ('77777777-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'lojista-hubs-b@example.invalid', '{}', '{"role":"lojista"}');

INSERT INTO public.admin_users (id, nome)
VALUES ('77777777-0000-4000-8000-000000000003', 'Admin Hubs');

INSERT INTO public.hubs (id, nome, endereco, lat, lng, ativo)
VALUES
  ('77777777-0000-4000-8000-000000000010', 'Hub A', 'Rua A', 0, 0, true),
  ('77777777-0000-4000-8000-000000000011', 'Hub B', 'Rua B', 0, 0, true),
  ('77777777-0000-4000-8000-000000000012', 'Hub inativo', 'Rua C', 0, 0, false);

INSERT INTO public.estabelecimentos (
  id, dono_user_id, nome_fantasia, cnpj, responsavel_nome, telefone,
  categoria, endereco, tempo_medio_entrega_min, taxa_deslocamento_reais,
  chave_pix, chave_pix_tipo, status
)
VALUES
  (
    '77777777-0000-4000-8000-000000000020',
    '77777777-0000-4000-8000-000000000002',
    'Loja piloto A', '77777777000100', 'Lojista Hubs A', '21999999999',
    'farmacia', 'Rua da Loja A', 20, 5, 'lojista-hubs@example.invalid', 'email', 'em_analise'
  ),
  (
    '77777777-0000-4000-8000-000000000021',
    '77777777-0000-4000-8000-000000000004',
    'Loja piloto B', '77777777000101', 'Lojista Hubs B', '21888888888',
    'mercado', 'Rua da Loja B', 20, 5, 'lojista-hubs-b@example.invalid', 'email', 'em_analise'
  );

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '77777777-0000-4000-8000-000000000003', true);

SELECT throws_ok(
  $$SELECT public.aprovar_lojista_com_hubs(
    '77777777-0000-4000-8000-000000000020', ARRAY[]::uuid[],
    '77777777-0000-4000-8000-000000000101'
  )$$,
  'P0001', 'HUB_OBRIGATORIO', 'aprovação exige ao menos um hub'
);
SELECT throws_ok(
  $$SELECT public.aprovar_lojista_com_hubs(
    '77777777-0000-4000-8000-000000000020',
    ARRAY['77777777-0000-4000-8000-000000000012']::uuid[],
    '77777777-0000-4000-8000-000000000102'
  )$$,
  'P0001', 'HUB_INVALIDO', 'aprovação rejeita hub inativo'
);

RESET ROLE;
SELECT is(
  (SELECT status FROM public.estabelecimentos WHERE id = '77777777-0000-4000-8000-000000000020'),
  'em_analise', 'falhas de validação mantêm a loja em análise'
);
SELECT is(
  (SELECT count(*)::integer FROM public.estabelecimentos_hubs WHERE estabelecimento_id = '77777777-0000-4000-8000-000000000020'),
  0, 'falhas de validação não deixam vínculo parcial'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '77777777-0000-4000-8000-000000000002', true);
SELECT throws_ok(
  $$SELECT public.aprovar_lojista_com_hubs(
    '77777777-0000-4000-8000-000000000020',
    ARRAY['77777777-0000-4000-8000-000000000010']::uuid[],
    '77777777-0000-4000-8000-000000000103'
  )$$,
  'P0001', 'ACESSO_NEGADO', 'lojista não pode aprovar a própria loja'
);

SELECT set_config('request.jwt.claim.sub', '77777777-0000-4000-8000-000000000003', true);
SELECT lives_ok(
  $$SELECT public.aprovar_lojista_com_hubs(
    '77777777-0000-4000-8000-000000000020',
    ARRAY[
      '77777777-0000-4000-8000-000000000010',
      '77777777-0000-4000-8000-000000000010'
    ]::uuid[],
    '77777777-0000-4000-8000-000000000104'
  )$$,
  'aprovação aceita ids repetidos sem duplicar vínculo'
);
SELECT lives_ok(
  $$SELECT public.aprovar_lojista_com_hubs(
    '77777777-0000-4000-8000-000000000020',
    ARRAY[
      '77777777-0000-4000-8000-000000000010',
      '77777777-0000-4000-8000-000000000010'
    ]::uuid[],
    '77777777-0000-4000-8000-000000000104'
  )$$,
  'retry da mesma operação é idempotente'
);
SELECT lives_ok(
  $$SELECT public.aprovar_lojista_com_hubs(
    '77777777-0000-4000-8000-000000000021',
    ARRAY['77777777-0000-4000-8000-000000000011']::uuid[],
    '77777777-0000-4000-8000-000000000107'
  )$$,
  'segunda loja é aprovada somente no hub B'
);

RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM public.estabelecimentos_hubs WHERE estabelecimento_id = '77777777-0000-4000-8000-000000000020'),
  1, 'PK e normalização mantêm um único vínculo'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.estabelecimentos_hubs
    WHERE estabelecimento_id = '77777777-0000-4000-8000-000000000020'
      AND hub_id = '77777777-0000-4000-8000-000000000010'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.estabelecimentos_hubs
    WHERE estabelecimento_id = '77777777-0000-4000-8000-000000000021'
      AND hub_id = '77777777-0000-4000-8000-000000000010'
  ) AND EXISTS (
    SELECT 1 FROM public.estabelecimentos_hubs
    WHERE estabelecimento_id = '77777777-0000-4000-8000-000000000021'
      AND hub_id = '77777777-0000-4000-8000-000000000011'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.estabelecimentos_hubs
    WHERE estabelecimento_id = '77777777-0000-4000-8000-000000000020'
      AND hub_id = '77777777-0000-4000-8000-000000000011'
  ),
  'descoberta separa duas lojas entre os hubs A e B'
);

INSERT INTO public.pedidos (
  id, cliente_id, estabelecimento_id, hub_id, status,
  subtotal_produtos_reais, taxa_deslocamento_reais, taxa_keepit_reais,
  taxa_servico_comprador_reais, total_pago_reais, forma_pagamento, pago_em
)
VALUES (
  '77777777-0000-4000-8000-000000000030',
  '77777777-0000-4000-8000-000000000001',
  '77777777-0000-4000-8000-000000000020',
  '77777777-0000-4000-8000-000000000010',
  'aguardando_aceite', 10, 5, 1, 2.9, 17.9, 'pix', now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '77777777-0000-4000-8000-000000000003', true);
SELECT lives_ok(
  $$SELECT public.definir_hubs_lojista(
    '77777777-0000-4000-8000-000000000020',
    ARRAY['77777777-0000-4000-8000-000000000011']::uuid[],
    '77777777-0000-4000-8000-000000000105'
  )$$,
  'admin substitui os hubs para novas compras'
);
RESET ROLE;

SELECT is(
  (SELECT hub_id::text FROM public.pedidos WHERE id = '77777777-0000-4000-8000-000000000030'),
  '77777777-0000-4000-8000-000000000010',
  'mudança de vínculos preserva o hub do pedido antigo'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.estabelecimentos_hubs
    WHERE estabelecimento_id = '77777777-0000-4000-8000-000000000020'
      AND hub_id = '77777777-0000-4000-8000-000000000011'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.estabelecimentos_hubs
    WHERE estabelecimento_id = '77777777-0000-4000-8000-000000000020'
      AND hub_id = '77777777-0000-4000-8000-000000000010'
  ),
  'loja aparece no hub B e deixa de aparecer no hub A'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '77777777-0000-4000-8000-000000000001', true);
SELECT is(
  (SELECT count(*)::integer FROM public.pedidos WHERE id = '77777777-0000-4000-8000-000000000030'),
  1, 'cliente continua acessando o pedido antigo após o desvínculo do hub'
);
SELECT set_config('request.jwt.claim.sub', '77777777-0000-4000-8000-000000000002', true);
SELECT is(
  (SELECT count(*)::integer FROM public.pedidos WHERE id = '77777777-0000-4000-8000-000000000030'),
  1, 'lojista continua acessando o pedido antigo após o desvínculo do hub'
);
RESET ROLE;

CREATE FUNCTION pg_temp.falhar_vinculo_hub()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'FALHA_VINCULO_TESTE';
END;
$$;
CREATE TRIGGER falha_vinculo_teste
  BEFORE INSERT ON public.estabelecimentos_hubs
  FOR EACH ROW EXECUTE FUNCTION pg_temp.falhar_vinculo_hub();

UPDATE public.estabelecimentos
SET status = 'em_analise', aprovado_em = NULL, aprovado_por = NULL
WHERE id = '77777777-0000-4000-8000-000000000020';
DELETE FROM public.estabelecimentos_hubs
WHERE estabelecimento_id = '77777777-0000-4000-8000-000000000020';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '77777777-0000-4000-8000-000000000003', true);
SELECT throws_ok(
  $$SELECT public.aprovar_lojista_com_hubs(
    '77777777-0000-4000-8000-000000000020',
    ARRAY['77777777-0000-4000-8000-000000000010']::uuid[],
    '77777777-0000-4000-8000-000000000106'
  )$$,
  'P0001', 'FALHA_VINCULO_TESTE', 'falha ao inserir vínculo aborta aprovação inteira'
);
RESET ROLE;

SELECT is(
  (SELECT status FROM public.estabelecimentos WHERE id = '77777777-0000-4000-8000-000000000020'),
  'em_analise', 'rollback mantém loja em análise após falha de vínculo'
);
SELECT is(
  (SELECT count(*)::integer FROM public.estabelecimentos_hubs WHERE estabelecimento_id = '77777777-0000-4000-8000-000000000020'),
  0, 'rollback não deixa associação parcial'
);

DROP TRIGGER falha_vinculo_teste ON public.estabelecimentos_hubs;

SELECT * FROM finish();
ROLLBACK;
