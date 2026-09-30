BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT has_function('public','obter_taxas',ARRAY[]::text[],'taxas disponíveis por RPC');
SELECT has_function('public','cotar_pedido',ARRAY['uuid','uuid','jsonb'],'cotação autoritativa disponível');
INSERT INTO auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
SELECT ('33333333-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated',
 'taxas-'||n||'@example.invalid','{}',CASE WHEN n IN (3,4) THEN '{"role":"lojista"}'::jsonb ELSE '{"nome":"Cliente teste"}'::jsonb END
FROM generate_series(1,5) n;
INSERT INTO public.admin_users (id,nome) VALUES ('33333333-0000-4000-8000-000000000005','Admin teste');
INSERT INTO public.hubs (id,nome,endereco,lat,lng) VALUES ('33333333-0000-4000-8000-000000000010','Hub teste','Endereço',0,0);
INSERT INTO public.hubs_horarios (hub_id,dia_semana,aberto,hora_abre,hora_fecha)
SELECT '33333333-0000-4000-8000-000000000010',n,true,'00:00','24:00' FROM generate_series(0,6) n;
INSERT INTO public.estabelecimentos (id,dono_user_id,nome_fantasia,cnpj,responsavel_nome,telefone,categoria,endereco,tempo_medio_entrega_min,taxa_deslocamento_reais,ticket_minimo_reais,chave_pix,chave_pix_tipo,status)
SELECT ('33333333-0000-4000-8000-00000000002'||n)::uuid,('33333333-0000-4000-8000-00000000000'||(n+2))::uuid,
 'Loja teste','3333333333333'||n,'Teste','00000000000','farmacia','Endereço',10,5,20,'teste@example.invalid','email','ativo' FROM generate_series(1,2) n;
INSERT INTO public.estabelecimentos_horarios (estabelecimento_id,dia_semana,aberto,hora_abre,hora_fecha)
SELECT '33333333-0000-4000-8000-000000000021',n,true,'00:00','24:00' FROM generate_series(0,6) n;
INSERT INTO public.estabelecimentos_hubs (estabelecimento_id,hub_id) VALUES ('33333333-0000-4000-8000-000000000021','33333333-0000-4000-8000-000000000010');
INSERT INTO public.produtos (id,estabelecimento_id,nome,preco_reais,categoria_produto) VALUES
 ('33333333-0000-4000-8000-000000000031','33333333-0000-4000-8000-000000000021','Produto real',100,'cuidados'),
 ('33333333-0000-4000-8000-000000000032','33333333-0000-4000-8000-000000000022','Outra loja',100,'cuidados');
CREATE FUNCTION pg_temp.cotar(itens jsonb DEFAULT '[{"produtoId":"33333333-0000-4000-8000-000000000031","quantidade":1}]') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.cotar_pedido('33333333-0000-4000-8000-000000000021','33333333-0000-4000-8000-000000000010',itens)
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-0000-4000-8000-000000000001',true);
SELECT is((public.obter_taxas()->>'comissaoBps')::int,1000,'seed comissão em bps');
SELECT is((public.obter_taxas()->>'servicoCentavos')::int,290,'seed serviço em centavos');
SELECT set_config('test.versao',public.obter_taxas()->>'versao',true);
SELECT set_config('test.cotacao',pg_temp.cotar()::text,true);
SELECT is((current_setting('test.cotacao')::jsonb->>'subtotalCentavos')::int,10000,'subtotal do catálogo');
SELECT is((current_setting('test.cotacao')::jsonb->>'freteCentavos')::int,500,'frete da loja');
SELECT is((current_setting('test.cotacao')::jsonb->>'totalCentavos')::int,10790,'total cliente inclui serviço');
SELECT is((current_setting('test.cotacao')::jsonb->>'comissaoCentavos')::int,1000,'comissão exclui frete');
SELECT is((current_setting('test.cotacao')::jsonb->>'liquidoLojistaCentavos')::int,9500,'repasse inclui frete');
SELECT throws_ok($$SELECT public.alterar_taxas(1200,300,current_setting('test.versao')::uuid,'Teste','33333333-0000-4000-8000-000000000050')$$,'P0001','ACESSO_NEGADO','cliente não altera taxas');
SELECT throws_ok($$SELECT * FROM public.historico_taxas$$,'42501',NULL,'histórico só por RPC Admin');
SELECT throws_ok($$SELECT public.listar_historico_taxas()$$,'P0001','ACESSO_NEGADO','cliente não lê auditoria');
SELECT throws_ok($$SELECT * FROM private.cotacoes$$,'42501',NULL,'cotação não é tabela pública');
SELECT throws_ok($$SELECT pg_temp.cotar('[{"produtoId":"33333333-0000-4000-8000-000000000032","quantidade":1}]')$$,'P0001','PRODUTO_INDISPONIVEL','produto de outra loja rejeitado');
SELECT throws_ok($$SELECT pg_temp.cotar('[{"produtoId":"33333333-0000-4000-8000-000000000031","quantidade":0}]')$$,'P0001','ITENS_INVALIDOS','quantidade zero');
SELECT throws_ok($$SELECT pg_temp.cotar('[{"produtoId":"33333333-0000-4000-8000-000000000031","quantidade":-1}]')$$,'P0001','ITENS_INVALIDOS','quantidade negativa');
SELECT throws_ok($$SELECT pg_temp.cotar('[{"produtoId":"33333333-0000-4000-8000-000000000031","quantidade":1.2}]')$$,'P0001','ITENS_INVALIDOS','quantidade fracionária');
SELECT throws_ok($$SELECT pg_temp.cotar('[]')$$,'P0001','ITENS_INVALIDOS','carrinho vazio');
SELECT throws_ok($$SELECT pg_temp.cotar('[{"produtoId":"33333333-0000-4000-8000-000000000031","quantidade":1},{"produtoId":"33333333-0000-4000-8000-000000000031","quantidade":1}]')$$,'P0001','ITENS_INVALIDOS','duplicatas rejeitadas');
SELECT is((pg_temp.cotar('[{"produtoId":"33333333-0000-4000-8000-000000000031","quantidade":1,"precoCentavos":1,"totalCentavos":1}]')->>'totalCentavos')::int,10790,'preços injetados ignorados');
RESET ROLE;
SELECT is((SELECT cliente_id::text FROM private.cotacoes WHERE id=(current_setting('test.cotacao')::jsonb->>'id')::uuid),'33333333-0000-4000-8000-000000000001','cotação pertence ao usuário autenticado');
SELECT is((SELECT itens->0->>'precoUnitarioCentavos' FROM private.cotacoes LIMIT 1),'10000','preço do catálogo persistido');
UPDATE public.estabelecimentos SET pausado_manualmente=true WHERE id='33333333-0000-4000-8000-000000000021';
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT pg_temp.cotar()','P0001','LOJA_INDISPONIVEL','loja pausada');
RESET ROLE;
UPDATE public.estabelecimentos SET pausado_manualmente=false,ticket_minimo_reais=101 WHERE id='33333333-0000-4000-8000-000000000021';
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT pg_temp.cotar()','P0001','MINIMO_NAO_ATINGIDO','mínimo imposto no servidor');
RESET ROLE;
UPDATE public.estabelecimentos SET ticket_minimo_reais=100 WHERE id='33333333-0000-4000-8000-000000000021';
SET LOCAL ROLE authenticated;
SELECT lives_ok('SELECT pg_temp.cotar()','subtotal igual ao mínimo aceito');
RESET ROLE;
UPDATE public.hubs_horarios SET hora_fecha=(now() AT TIME ZONE 'America/Sao_Paulo')::time + interval '1 minute';
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT pg_temp.cotar()','P0001','HORARIO_INVIAVEL','entrega e margem após fechamento do hub');
RESET ROLE;
UPDATE public.hubs_horarios SET hora_fecha='24:00';
UPDATE public.estabelecimentos_horarios SET aberto=false;
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT pg_temp.cotar()','P0001','HORARIO_INVIAVEL','loja fechada');
RESET ROLE;
UPDATE public.estabelecimentos_horarios SET aberto=true;
UPDATE public.produtos SET ativo=false WHERE id='33333333-0000-4000-8000-000000000031';
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT pg_temp.cotar()','P0001','PRODUTO_INDISPONIVEL','produto inativo');
RESET ROLE;
UPDATE public.produtos SET ativo=true;
UPDATE public.hubs SET ativo=false;
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT pg_temp.cotar()','P0001','HUB_INDISPONIVEL','hub inativo');
RESET ROLE;
UPDATE public.hubs SET ativo=true;
DELETE FROM public.estabelecimentos_hubs WHERE estabelecimento_id='33333333-0000-4000-8000-000000000021';
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT pg_temp.cotar()','P0001','HUB_INDISPONIVEL','hub não vinculado');
SELECT set_config('request.jwt.claim.sub','33333333-0000-4000-8000-000000000005',true);
SELECT throws_ok($$SELECT public.alterar_taxas(10001,300,current_setting('test.versao')::uuid,'Teste',gen_random_uuid())$$,'P0001','TAXAS_INVALIDAS','limite bps');
SELECT throws_ok($$SELECT public.alterar_taxas(1000,-1,current_setting('test.versao')::uuid,'Teste',gen_random_uuid())$$,'P0001','TAXAS_INVALIDAS','serviço não negativo');
SELECT throws_ok($$SELECT public.alterar_taxas(1000,300,current_setting('test.versao')::uuid,' ',gen_random_uuid())$$,'P0001','TAXAS_INVALIDAS','motivo obrigatório');
SELECT set_config('test.taxas_novas',public.alterar_taxas(1200,350,current_setting('test.versao')::uuid,'Ajuste piloto','33333333-0000-4000-8000-000000000050')::text,true);
SELECT isnt(public.obter_taxas()->>'versao',current_setting('test.versao'),'nova versão UUID');
SELECT is((public.obter_taxas()->>'servicoCentavos')::int,350,'Admin altera serviço');
SELECT throws_ok($$SELECT public.alterar_taxas(1300,400,current_setting('test.versao')::uuid,'Concorrente',gen_random_uuid())$$,'P0001','VERSAO_CONFLITANTE','edição concorrente não sobrescreve');
SELECT is(public.alterar_taxas(1200,350,current_setting('test.versao')::uuid,'Ajuste piloto','33333333-0000-4000-8000-000000000050')::text,current_setting('test.taxas_novas'),'retry idempotente');
SELECT throws_ok($$SELECT public.alterar_taxas(1300,350,current_setting('test.versao')::uuid,'Ajuste piloto','33333333-0000-4000-8000-000000000050')$$,'P0001','OPERACAO_CONFLITANTE','chave reutilizada com payload diferente rejeitada');
SELECT is(jsonb_array_length(public.listar_historico_taxas()),1,'histórico uma alteração por operação');
SELECT is(public.listar_historico_taxas()->0->>'atorId','33333333-0000-4000-8000-000000000005','auditoria ator real');
SELECT is(public.listar_historico_taxas()->0->>'motivo','Ajuste piloto','auditoria motivo');
SELECT is(public.listar_historico_taxas()->0->'antes'->>'versao',current_setting('test.versao'),'auditoria preserva versão anterior');
RESET ROLE;
SELECT is((SELECT taxas->>'versao' FROM private.cotacoes WHERE id=(current_setting('test.cotacao')::jsonb->>'id')::uuid),current_setting('test.versao'),'cotação existente não é reescrita');
SET LOCAL ROLE anon;
SELECT throws_ok('SELECT public.obter_taxas()','42501',NULL,'anon sem acesso taxas');
SELECT throws_ok('SELECT pg_temp.cotar()','42501',NULL,'anon sem cotação');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
