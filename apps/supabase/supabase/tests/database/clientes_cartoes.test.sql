BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- Removing either storage or column grants must break the isolation contract.
SELECT has_table('private', 'clientes_asaas', 'customer is server-only');
SELECT has_table('public', 'clientes_cartoes', 'saved cards exist');
SELECT has_table('private', 'cartoes_gestao_operacoes', 'management replay ledger exists');
INSERT INTO auth.users(id, aud, role, email, raw_user_meta_data) VALUES
('87777777-0000-4000-8000-000000000001','authenticated','authenticated','card-a@example.invalid','{}'),
('87777777-0000-4000-8000-000000000002','authenticated','authenticated','card-b@example.invalid','{}'),
('87777777-0000-4000-8000-000000000003','authenticated','authenticated','card-merchant@example.invalid','{"role":"lojista"}'),
('87777777-0000-4000-8000-000000000004','authenticated','authenticated','card-admin@example.invalid','{}');
INSERT INTO public.admin_users(id,nome) VALUES ('87777777-0000-4000-8000-000000000004','Card Admin');
INSERT INTO private.clientes_asaas(cliente_id,ambiente,asaas_customer_id) VALUES
('87777777-0000-4000-8000-000000000001','sandbox','synthetic_customer_a'),
('87777777-0000-4000-8000-000000000002','sandbox','synthetic_customer_b');
INSERT INTO public.clientes_cartoes(id,cliente_id,ambiente,asaas_customer_id,asaas_credit_card_token,bandeira,ultimo4,principal,created_at) VALUES
('87777777-0000-4000-8000-000000000101','87777777-0000-4000-8000-000000000001','sandbox','synthetic_customer_a','synthetic_token_a1','VISA','1234',true,'2026-01-01'),
('87777777-0000-4000-8000-000000000102','87777777-0000-4000-8000-000000000001','sandbox','synthetic_customer_a','synthetic_token_a2','VISA','1234',false,'2026-01-02');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','87777777-0000-4000-8000-000000000002',true);
SELECT is((SELECT count(id) FROM public.clientes_cartoes),0::bigint,'B cannot read A');
SELECT set_config('request.jwt.claim.sub','87777777-0000-4000-8000-000000000003',true);
SELECT is((SELECT count(id) FROM public.clientes_cartoes),0::bigint,'merchant cannot read A');
SELECT set_config('request.jwt.claim.sub','87777777-0000-4000-8000-000000000004',true);
SELECT is((SELECT count(id) FROM public.clientes_cartoes),0::bigint,'ordinary authenticated Admin cannot read A');
SELECT throws_ok('SELECT asaas_credit_card_token FROM public.clientes_cartoes','42501',NULL,'Admin has no token grant');
SELECT set_config('request.jwt.claim.sub','87777777-0000-4000-8000-000000000001',true);
SELECT is((SELECT count(id) FROM public.clientes_cartoes),2::bigint,'owner reads public card fields');
SELECT lives_ok('SELECT id,bandeira,ultimo4,principal,created_at FROM public.clientes_cartoes','all summary fields are granted');
SELECT throws_ok('SELECT * FROM public.clientes_cartoes','42501',NULL,'wildcard is denied even to owner');
SELECT throws_ok('SELECT asaas_credit_card_token FROM public.clientes_cartoes','42501',NULL,'owner cannot read token');
SELECT throws_ok('SELECT asaas_customer_id FROM public.clientes_cartoes','42501',NULL,'owner cannot read customer');
SELECT throws_ok('SELECT * FROM private.clientes_asaas','42501',NULL,'customer table inaccessible');
SELECT throws_ok('SELECT * FROM private.cartoes_gestao_operacoes','42501',NULL,'ledger inaccessible');
SELECT throws_ok($$UPDATE public.clientes_cartoes SET principal=false$$,'42501',NULL,'direct update denied');
SELECT throws_ok($$DELETE FROM public.clientes_cartoes$$,'42501',NULL,'direct delete denied');
SELECT throws_ok($$INSERT INTO public.clientes_cartoes DEFAULT VALUES$$,'42501',NULL,'direct insert denied');
SET LOCAL ROLE anon;
SELECT throws_ok('SELECT id FROM public.clientes_cartoes','42501',NULL,'anon has no card access');
RESET ROLE;
SELECT ok((SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE oid IN ('public.clientes_cartoes'::regclass,'private.clientes_asaas'::regclass,'private.cartoes_gestao_operacoes'::regclass)),'RLS enabled and forced on all storage');

CREATE FUNCTION pg_temp.add_card(p_id uuid, p_cliente uuid, p_customer text, p_token text, p_ambiente text DEFAULT 'sandbox', p_last text DEFAULT '1234') RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.clientes_cartoes(id,cliente_id,ambiente,asaas_customer_id,asaas_credit_card_token,bandeira,ultimo4)
  VALUES(p_id,p_cliente,p_ambiente,p_customer,p_token,'VISA',p_last)
$$;
SELECT throws_ok($$UPDATE private.clientes_asaas SET asaas_customer_id='synthetic_customer_a' WHERE cliente_id='87777777-0000-4000-8000-000000000002'$$,'23505',NULL,'external customer cannot belong to another client in same environment');
SELECT throws_ok($$SELECT pg_temp.add_card('87777777-0000-4000-8000-000000000201','87777777-0000-4000-8000-000000000001','synthetic_customer_b','synthetic_cross')$$,'23503',NULL,'A cannot save with B customer');
SELECT throws_ok($$SELECT pg_temp.add_card('87777777-0000-4000-8000-000000000202','87777777-0000-4000-8000-000000000001','synthetic_customer_a','synthetic_cross_env','producao')$$,'23503',NULL,'customer binding includes environment');
SELECT throws_ok($$SELECT pg_temp.add_card('87777777-0000-4000-8000-000000000203','87777777-0000-4000-8000-000000000001','synthetic_customer_a','synthetic_token_a1')$$,'23505',NULL,'same token/customer is deduplicated');
SELECT throws_ok($$SELECT pg_temp.add_card('87777777-0000-4000-8000-000000000204','87777777-0000-4000-8000-000000000001','synthetic_customer_a','synthetic_bad_final','sandbox','12345')$$,'23514',NULL,'only four trailing digits can be stored');
SELECT throws_ok($$SELECT pg_temp.add_card('87777777-0000-4000-8000-000000000205','87777777-0000-4000-8000-000000000001','synthetic_customer_a','')$$,'23514',NULL,'empty token is rejected');
SELECT is((SELECT count(*) FROM public.clientes_cartoes WHERE cliente_id='87777777-0000-4000-8000-000000000001' AND ultimo4='1234'),2::bigint,'different tokens with same final remain distinct');

SELECT pg_temp.add_card('87777777-0000-4000-8000-000000000111','87777777-0000-4000-8000-000000000002','synthetic_customer_b','synthetic_token_b1');
SELECT is((SELECT principal FROM public.clientes_cartoes WHERE id='87777777-0000-4000-8000-000000000111'),true,'first saved card becomes principal');
INSERT INTO public.clientes_cartoes(id,cliente_id,ambiente,asaas_customer_id,asaas_credit_card_token,bandeira,ultimo4,principal)
VALUES('87777777-0000-4000-8000-000000000112','87777777-0000-4000-8000-000000000002','sandbox','synthetic_customer_b','synthetic_token_b2','VISA','1234',true);
SELECT is((SELECT id FROM public.clientes_cartoes WHERE cliente_id='87777777-0000-4000-8000-000000000002' AND principal),'87777777-0000-4000-8000-000000000111'::uuid,'later saves preserve existing principal even if insertion requests primary');
SELECT throws_ok($$UPDATE public.clientes_cartoes SET principal=true WHERE id='87777777-0000-4000-8000-000000000102'$$,'23505',NULL,'partial unique index prevents two principal cards');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','87777777-0000-4000-8000-000000000001',true);
SELECT is((SELECT count(*) FROM public.listar_cartoes_cliente()),2::bigint,'list RPC returns only own cards');
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys((SELECT to_jsonb(c) FROM public.listar_cartoes_cliente() c LIMIT 1)) k),ARRAY['bandeira','created_at','id','principal','ultimo4']::text[],'list RPC exposes summary only');
SELECT set_config('request.jwt.claim.sub','87777777-0000-4000-8000-000000000003',true);
SELECT throws_ok('SELECT * FROM public.listar_cartoes_cliente()','P0001','ACESSO_NEGADO','merchant session rejected');
SELECT set_config('request.jwt.claim.sub','87777777-0000-4000-8000-000000000004',true);
SELECT throws_ok('SELECT * FROM public.listar_cartoes_cliente()','P0001','ACESSO_NEGADO','Admin session rejected');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT throws_ok('SELECT * FROM public.listar_cartoes_cliente()','P0001','ACESSO_NEGADO','missing identity rejected');
SET LOCAL ROLE anon;
SELECT throws_ok('SELECT * FROM public.listar_cartoes_cliente()','42501',NULL,'anon cannot execute privileged list');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','87777777-0000-4000-8000-000000000001',true);
SELECT is((SELECT id FROM public.definir_cartao_principal('87777777-0000-4000-8000-000000000102','87777777-0000-4000-8000-000000000301') WHERE principal),'87777777-0000-4000-8000-000000000102'::uuid,'principal RPC changes selection and returns public list');
SELECT throws_ok($$SELECT public.definir_cartao_principal('87777777-0000-4000-8000-000000000111','87777777-0000-4000-8000-000000000303')$$,'P0001','CARTAO_INDISPONIVEL','A cannot select B card');
SELECT throws_ok($$SELECT public.definir_cartao_principal('87777777-0000-4000-8000-000000000999','87777777-0000-4000-8000-000000000303')$$,'P0001','CARTAO_INDISPONIVEL','missing card rejected');
SELECT throws_ok($$SELECT public.definir_cartao_principal('87777777-0000-4000-8000-000000000101',NULL)$$,'P0001','OPERACAO_INVALIDA','operation identity is mandatory');
SELECT count(*) FROM public.definir_cartao_principal('87777777-0000-4000-8000-000000000101','87777777-0000-4000-8000-000000000302');
SELECT is((SELECT id FROM public.definir_cartao_principal('87777777-0000-4000-8000-000000000102','87777777-0000-4000-8000-000000000301') WHERE principal),'87777777-0000-4000-8000-000000000101'::uuid,'principal replay returns current state without undoing newer choice');
SELECT throws_ok($$SELECT public.definir_cartao_principal('87777777-0000-4000-8000-000000000101','87777777-0000-4000-8000-000000000301')$$,'P0001','OPERACAO_DIVERGENTE','operation ID cannot be reused for different card');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.definir_cartao_principal('87777777-0000-4000-8000-000000000101','87777777-0000-4000-8000-000000000301')$$,'42501',NULL,'anon cannot change principal');
RESET ROLE;

SELECT pg_temp.add_card('87777777-0000-4000-8000-000000000104','87777777-0000-4000-8000-000000000001','synthetic_customer_a','synthetic_token_a4');
SELECT pg_temp.add_card('87777777-0000-4000-8000-000000000103','87777777-0000-4000-8000-000000000001','synthetic_customer_a','synthetic_token_a3');
UPDATE public.clientes_cartoes SET created_at='2025-01-01' WHERE id IN ('87777777-0000-4000-8000-000000000103','87777777-0000-4000-8000-000000000104');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','87777777-0000-4000-8000-000000000001',true);
SELECT is((SELECT id FROM public.remover_cartao_cliente('87777777-0000-4000-8000-000000000102','87777777-0000-4000-8000-000000000401') WHERE principal),'87777777-0000-4000-8000-000000000101'::uuid,'removing non-primary preserves selection');
SELECT is((SELECT count(*) FROM public.remover_cartao_cliente('87777777-0000-4000-8000-000000000102','87777777-0000-4000-8000-000000000401')),3::bigint,'removal replay succeeds with current list');
SELECT throws_ok($$SELECT public.definir_cartao_principal('87777777-0000-4000-8000-000000000102','87777777-0000-4000-8000-000000000401')$$,'P0001','OPERACAO_DIVERGENTE','operation cannot change action after removal');
SELECT throws_ok($$SELECT public.remover_cartao_cliente('87777777-0000-4000-8000-000000000101','87777777-0000-4000-8000-000000000401')$$,'P0001','OPERACAO_DIVERGENTE','removal cannot reuse operation for different card');
SELECT throws_ok($$SELECT public.remover_cartao_cliente('87777777-0000-4000-8000-000000000111','87777777-0000-4000-8000-000000000499')$$,'P0001','CARTAO_INDISPONIVEL','A cannot remove B card');
SELECT throws_ok($$SELECT public.remover_cartao_cliente(NULL,'87777777-0000-4000-8000-000000000499')$$,'P0001','OPERACAO_INVALIDA','missing removal target rejected');
SELECT is((SELECT id FROM public.remover_cartao_cliente('87777777-0000-4000-8000-000000000101','87777777-0000-4000-8000-000000000402') WHERE principal),'87777777-0000-4000-8000-000000000103'::uuid,'removing principal promotes oldest then smallest ID');
SELECT is((SELECT id FROM public.remover_cartao_cliente('87777777-0000-4000-8000-000000000103','87777777-0000-4000-8000-000000000403') WHERE principal),'87777777-0000-4000-8000-000000000104'::uuid,'next remaining card is promoted');
SELECT is((SELECT count(*) FROM public.remover_cartao_cliente('87777777-0000-4000-8000-000000000104','87777777-0000-4000-8000-000000000404')),0::bigint,'removing final card returns empty list');
SELECT is((SELECT count(*) FROM public.remover_cartao_cliente('87777777-0000-4000-8000-000000000104','87777777-0000-4000-8000-000000000404')),0::bigint,'final removal replay never recreates card');
SELECT set_config('request.jwt.claim.sub','87777777-0000-4000-8000-000000000003',true);
SELECT throws_ok($$SELECT public.remover_cartao_cliente('87777777-0000-4000-8000-000000000111','87777777-0000-4000-8000-000000000499')$$,'P0001','ACESSO_NEGADO','merchant cannot manage cards');
SELECT set_config('request.jwt.claim.sub','87777777-0000-4000-8000-000000000004',true);
SELECT throws_ok($$SELECT public.definir_cartao_principal('87777777-0000-4000-8000-000000000111','87777777-0000-4000-8000-000000000499')$$,'P0001','ACESSO_NEGADO','ordinary Admin cannot manage cards');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.remover_cartao_cliente('87777777-0000-4000-8000-000000000111','87777777-0000-4000-8000-000000000499')$$,'42501',NULL,'anon cannot remove cards');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.clientes_cartoes WHERE cliente_id='87777777-0000-4000-8000-000000000002'),2::bigint,'other client remains intact');
SELECT pg_temp.add_card('87777777-0000-4000-8000-000000000105','87777777-0000-4000-8000-000000000001','synthetic_customer_a','synthetic_token_a5');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','87777777-0000-4000-8000-000000000001',true);
SELECT is((SELECT id FROM public.remover_cartao_cliente('87777777-0000-4000-8000-000000000104','87777777-0000-4000-8000-000000000404') WHERE principal),'87777777-0000-4000-8000-000000000105'::uuid,'old removal returns current newly saved card');
SELECT is((SELECT id FROM public.definir_cartao_principal('87777777-0000-4000-8000-000000000102','87777777-0000-4000-8000-000000000301') WHERE principal),'87777777-0000-4000-8000-000000000105'::uuid,'principal replay after removal never resurrects old card');
RESET ROLE;
SELECT is((SELECT count(*) FROM private.cartoes_gestao_operacoes WHERE cliente_id='87777777-0000-4000-8000-000000000001'),6::bigint,'ledger records successful operations once and omits rejected ones');

SELECT * FROM finish();
ROLLBACK;
