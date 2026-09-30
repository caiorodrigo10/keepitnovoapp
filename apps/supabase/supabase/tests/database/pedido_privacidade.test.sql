-- Integração pgTAP: atores fictícios, JWT real e funções/RLS do banco.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(39);
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
SELECT ('22222222-0000-4000-8000-00000000000' || n)::uuid,
 'authenticated','authenticated','task2-' || n || '@example.invalid','{}',
 CASE WHEN n > 2 THEN '{"role":"lojista"}'::jsonb ELSE '{"nome":"Cliente teste"}'::jsonb END
FROM generate_series(1,5) n;
INSERT INTO public.admin_users (id,nome) VALUES ('22222222-0000-4000-8000-000000000005','Admin teste');
INSERT INTO public.hubs (id,nome,endereco,lat,lng) VALUES ('22222222-0000-4000-8000-000000000010','Hub teste','Endereço teste',0,0);
INSERT INTO public.estabelecimentos (id,dono_user_id,nome_fantasia,cnpj,responsavel_nome,telefone,categoria,endereco,tempo_medio_entrega_min,chave_pix,chave_pix_tipo,status)
SELECT ('22222222-0000-4000-8000-00000000002' || n)::uuid,
 ('22222222-0000-4000-8000-00000000000' || (n+2))::uuid,
 'Loja teste', '0000000000000' || n,'Responsável','00000000000','farmacia','Endereço',10,'teste@example.invalid','email','ativo'
FROM generate_series(1,2) n;
INSERT INTO public.estabelecimentos_hubs (estabelecimento_id,hub_id)
VALUES ('22222222-0000-4000-8000-000000000021','22222222-0000-4000-8000-000000000010');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-0000-4000-8000-000000000001',true);
CREATE TEMP TABLE teste_pedido AS SELECT * FROM public.criar_pedido(
 '22222222-0000-4000-8000-000000000021','22222222-0000-4000-8000-000000000010',
 '[{"nome_snapshot":"Item teste","preco_unitario":10,"quantidade":1}]',10,0,1,0,10,false);
SELECT ok(NOT EXISTS(SELECT FROM (SELECT * FROM public.pedidos) p WHERE to_jsonb(p) ?| ARRAY['pin_texto','pin_hash']), 'cliente A SELECT * sem segredos');
SELECT ok(NOT EXISTS(SELECT FROM teste_pedido p WHERE to_jsonb(p) ?| ARRAY['pin_texto','pin_hash']), 'criação retorna somente dados públicos');
SELECT ok(NOT EXISTS(SELECT FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('pin_texto','pin_hash')), 'nenhuma coluna pública secreta');
SELECT ok(public.obter_pin_cliente((SELECT pedido_id FROM teste_pedido)) ~ '^\d{4}$','cliente dono lê PIN pago');
DO $$ BEGIN PERFORM set_config('test.pin',public.obter_pin_cliente((SELECT pedido_id FROM teste_pedido)),true); END $$;
RESET ROLE;
UPDATE public.pedidos SET pago_em=NULL WHERE id=(SELECT pedido_id FROM teste_pedido);
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT public.obter_pin_cliente((SELECT pedido_id FROM teste_pedido))','P0001','ACESSO_NEGADO','pedido não pago nega PIN');
RESET ROLE;
UPDATE public.pedidos SET pago_em=now(),status='no_hub' WHERE id=(SELECT pedido_id FROM teste_pedido);
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT * FROM private.pedido_segredos','42501',NULL,'cliente não lê schema privado');
SELECT is((SELECT public.pedido_cliente_nome(p) FROM public.pedidos p WHERE id=(SELECT pedido_id FROM teste_pedido)), 'Cliente teste','projeção autorizada do nome');
SELECT set_config('request.jwt.claim.sub','22222222-0000-4000-8000-000000000002',true);
SELECT is(public.pedido_cliente_nome(jsonb_populate_record(NULL::public.pedidos,jsonb_build_object('id',(SELECT pedido_id FROM teste_pedido),'cliente_id',auth.uid()))),NULL::text,'composite forjado não revela nome de outro cliente');
SELECT set_config('request.jwt.claims','{"user_metadata":{"role":"admin"}}',true);
SELECT throws_ok('SELECT public.obter_pin_cliente((SELECT pedido_id FROM teste_pedido))','P0001','ACESSO_NEGADO','metadata editável não autoriza PIN');
SELECT ok(NOT EXISTS(SELECT FROM (SELECT * FROM public.pedidos) p WHERE to_jsonb(p) ?| ARRAY['pin_texto','pin_hash']), 'cliente B SELECT * sem segredos');
SELECT throws_ok('SELECT public.obter_pin_cliente((SELECT pedido_id FROM teste_pedido))','P0001','ACESSO_NEGADO','cliente B não lê PIN');
SELECT throws_ok('SELECT * FROM private.pedido_segredos','42501',NULL,'cliente B não lê schema privado');
SELECT throws_ok('SELECT * FROM public.confirmar_pin_pedido((SELECT pedido_id FROM teste_pedido),current_setting(''test.pin''))','P0001','ACESSO_NEGADO','cliente não confirma PIN');
SELECT set_config('request.jwt.claim.sub','22222222-0000-4000-8000-000000000003',true);
SELECT is((SELECT count(*)::int FROM public.pedidos),1,'lojista A vê seu pedido');
SELECT ok(NOT EXISTS(SELECT FROM (SELECT * FROM public.pedidos) p WHERE to_jsonb(p) ?| ARRAY['pin_texto','pin_hash']), 'lojista A SELECT * sem segredos');
SELECT throws_ok('SELECT public.obter_pin_cliente((SELECT pedido_id FROM teste_pedido))','P0001','ACESSO_NEGADO','lojista A não lê PIN');
SELECT throws_ok('SELECT * FROM private.pedido_segredos','42501',NULL,'lojista A não lê schema privado');
SELECT is((SELECT public.pedido_cliente_nome(p) FROM public.pedidos p WHERE id=(SELECT pedido_id FROM teste_pedido)), 'Cliente teste','lojista lê apenas nome vinculado ao pedido');
SELECT set_config('request.jwt.claim.sub','22222222-0000-4000-8000-000000000004',true);
SELECT ok(NOT EXISTS(SELECT FROM (SELECT * FROM public.pedidos) p WHERE to_jsonb(p) ?| ARRAY['pin_texto','pin_hash']), 'lojista B SELECT * sem segredos');
SELECT throws_ok('SELECT public.obter_pin_cliente((SELECT pedido_id FROM teste_pedido))','P0001','ACESSO_NEGADO','lojista B não lê PIN');
SELECT throws_ok('SELECT * FROM private.pedido_segredos','42501',NULL,'lojista B não lê schema privado');
SELECT throws_ok('SELECT * FROM public.confirmar_pin_pedido((SELECT pedido_id FROM teste_pedido),current_setting(''test.pin''))','P0001','ACESSO_NEGADO','lojista B não confirma PIN');
SELECT set_config('request.jwt.claim.sub','22222222-0000-4000-8000-000000000005',true);
SELECT ok(public.is_admin(),'ator Admin provisionado pelo banco');
SELECT ok(NOT EXISTS(SELECT FROM (SELECT * FROM public.pedidos) p WHERE to_jsonb(p) ?| ARRAY['pin_texto','pin_hash']), 'Admin SELECT * sem segredos');
SELECT throws_ok('SELECT public.obter_pin_cliente((SELECT pedido_id FROM teste_pedido))','P0001','ACESSO_NEGADO','Admin não lê PIN');
SELECT throws_ok('SELECT * FROM private.pedido_segredos','42501',NULL,'Admin não lê schema privado');
SELECT throws_ok('SELECT * FROM public.confirmar_pin_pedido((SELECT pedido_id FROM teste_pedido),current_setting(''test.pin''))','P0001','ACESSO_NEGADO','Admin não confirma PIN');
SELECT set_config('request.jwt.claim.sub','22222222-0000-4000-8000-000000000003',true);
SELECT is((SELECT tentativas_restantes FROM public.confirmar_pin_pedido((SELECT pedido_id FROM teste_pedido),'invalid')),4,'primeiro erro persiste tentativa');
SELECT is((SELECT tentativas_restantes FROM public.confirmar_pin_pedido((SELECT pedido_id FROM teste_pedido),'invalid')),3,'segundo erro');
SELECT is((SELECT tentativas_restantes FROM public.confirmar_pin_pedido((SELECT pedido_id FROM teste_pedido),'invalid')),2,'terceiro erro');
SELECT is((SELECT tentativas_restantes FROM public.confirmar_pin_pedido((SELECT pedido_id FROM teste_pedido),'invalid')),1,'quarto erro');
SELECT is((SELECT resultado FROM public.confirmar_pin_pedido((SELECT pedido_id FROM teste_pedido),'invalid')),'pin_bloqueado','quinto erro bloqueia');
SELECT is((SELECT resultado FROM public.confirmar_pin_pedido((SELECT pedido_id FROM teste_pedido),current_setting('test.pin'))),'pin_bloqueado','PIN correto durante bloqueio não entrega');
RESET ROLE;
UPDATE public.pedidos SET pin_bloqueado_ate=now()-interval '1 second' WHERE id=(SELECT pedido_id FROM teste_pedido);
SET LOCAL ROLE authenticated;
SELECT is((SELECT resultado FROM public.confirmar_pin_pedido((SELECT pedido_id FROM teste_pedido),current_setting('test.pin'))),'entregue','PIN correto após expirar bloqueio entrega');
SELECT is((SELECT count(*)::int FROM public.lancamentos_financeiros WHERE tipo='merchant_credit'),1,'um crédito na entrega');
SELECT set_config('request.jwt.claim.sub','22222222-0000-4000-8000-000000000001',true);
SELECT ok(public.obter_pin_cliente((SELECT pedido_id FROM teste_pedido)) = current_setting('test.pin'),'nova sessão do dono recupera o mesmo PIN');
SET LOCAL ROLE anon;
SELECT throws_ok('SELECT public.obter_pin_cliente(''22222222-0000-4000-8000-000000000099'')','42501',NULL,'anon não executa RPC');
RESET ROLE;
SELECT ok(NOT has_table_privilege('authenticated','private.pedido_segredos','SELECT'),'authenticated sem grant SELECT privado');
SELECT ok(NOT has_function_privilege('anon','public.obter_pin_cliente(uuid)','EXECUTE'),'anon sem grant EXECUTE');
SELECT * FROM finish();
ROLLBACK;
