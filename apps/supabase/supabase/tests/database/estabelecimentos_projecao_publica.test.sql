BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES
 ('88888888-0000-4000-8000-000000000001','authenticated','authenticated','loja-priv-cliente@example.invalid','{}','{}'),
 ('88888888-0000-4000-8000-000000000002','authenticated','authenticated','loja-priv-dono@example.invalid','{}','{}'),
 ('88888888-0000-4000-8000-000000000003','authenticated','authenticated','loja-priv-outro@example.invalid','{}','{}'),
 ('88888888-0000-4000-8000-000000000004','authenticated','authenticated','loja-priv-admin@example.invalid','{}','{}');
INSERT INTO public.admin_users(id,nome) VALUES ('88888888-0000-4000-8000-000000000004','Admin privacidade');
INSERT INTO public.estabelecimentos(id,dono_user_id,nome_fantasia,cnpj,responsavel_nome,telefone,categoria,endereco,tempo_medio_entrega_min,taxa_deslocamento_reais,chave_pix,chave_pix_tipo,asaas_wallet_id,dados_receita,status) VALUES
 ('88888888-0000-4000-8000-000000000011','88888888-0000-4000-8000-000000000002','Loja A','88888888000101','Responsável A','11999990001','farmacia','Rua A',20,5,'pix-a@example.invalid','email','wallet-privada-a','{"campo":"privado"}','ativo'),
 ('88888888-0000-4000-8000-000000000012','88888888-0000-4000-8000-000000000003','Loja B','88888888000102','Responsável B','11999990002','farmacia','Rua B',20,5,'pix-b@example.invalid','email','wallet-privada-b','{"campo":"privado"}','ativo');
INSERT INTO public.estabelecimentos_horarios(estabelecimento_id,dia_semana,aberto,hora_abre,hora_fecha) VALUES
 ('88888888-0000-4000-8000-000000000011',1,true,'09:00','18:00'),
 ('88888888-0000-4000-8000-000000000012',1,true,'09:00','18:00');
INSERT INTO public.produtos(id,estabelecimento_id,nome,preco_reais,categoria_produto) VALUES
 ('88888888-0000-4000-8000-000000000021','88888888-0000-4000-8000-000000000011','Produto A',10,'cuidados'),
 ('88888888-0000-4000-8000-000000000022','88888888-0000-4000-8000-000000000012','Produto B',10,'cuidados');
SET LOCAL ROLE anon;
SELECT throws_ok('SELECT * FROM public.estabelecimentos','42501',NULL,'anon não pode pedir linha completa da tabela');
SELECT ok(NOT has_column_privilege('anon','public.estabelecimentos','cnpj','SELECT'),'anon sem CNPJ');
SELECT ok(NOT has_column_privilege('anon','public.estabelecimentos','dono_user_id','SELECT'),'anon sem id do dono');
SELECT throws_ok($$SELECT * FROM public.obter_estabelecimentos_privados(NULL)$$,'42501',NULL,'anon não executa leitura privada');
SELECT ok(NOT has_column_privilege('anon','public.estabelecimentos','responsavel_nome','SELECT'),'anon sem responsável');
SELECT ok(NOT has_column_privilege('anon','public.estabelecimentos','telefone','SELECT'),'anon sem telefone cadastral');
SELECT ok(NOT has_column_privilege('anon','public.estabelecimentos','chave_pix','SELECT'),'anon sem PIX');
SELECT ok(NOT has_column_privilege('anon','public.estabelecimentos','dados_receita','SELECT'),'anon sem dados receita');
SELECT ok(NOT has_column_privilege('anon','public.estabelecimentos','asaas_wallet_id','SELECT'),'anon sem carteira externa');
SELECT is((SELECT count(*)::integer FROM public.estabelecimentos_publicos),2,'anon descobre lojas ativas');
SELECT is((SELECT count(*)::integer FROM public.estabelecimentos_horarios),2,'anon continua lendo horários públicos');
SELECT is((SELECT count(*)::integer FROM public.produtos),2,'anon continua lendo produtos públicos');
SELECT ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='estabelecimentos_publicos' AND column_name IN ('cnpj','dono_user_id','responsavel_nome','telefone','chave_pix','dados_receita','asaas_wallet_id','motivo_rejeicao')),'projeção omite dados cadastrais e administrativos');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','88888888-0000-4000-8000-000000000001',true);
SELECT throws_ok('SELECT * FROM public.estabelecimentos','42501',NULL,'cliente não pode pedir linha completa');
SELECT is((SELECT count(*)::integer FROM public.estabelecimentos_publicos),2,'cliente descobre lojas');
SELECT is((SELECT count(*)::integer FROM public.obter_estabelecimentos_privados(NULL)),0,'cliente não lê cadastro privado de nenhuma loja');
SELECT set_config('request.jwt.claim.sub','88888888-0000-4000-8000-000000000003',true);
SELECT throws_ok('SELECT * FROM public.estabelecimentos','42501',NULL,'outra loja não pode pedir linha completa');
SELECT is((SELECT count(*)::integer FROM public.obter_estabelecimentos_privados('88888888-0000-4000-8000-000000000011')),0,'outra loja não lê dados privados da loja A');
SELECT is((SELECT cnpj FROM public.obter_estabelecimentos_privados('88888888-0000-4000-8000-000000000012')),'88888888000102','lojista B lê só o próprio cadastro');
SELECT throws_ok($$SELECT dono_user_id FROM public.estabelecimentos$$,'42501',NULL,'lojista B não lê id do dono de outra loja');
UPDATE public.estabelecimentos SET categoria='tentativa-b' WHERE id='88888888-0000-4000-8000-000000000011';
SELECT is((SELECT categoria FROM public.estabelecimentos_publicos WHERE id='88888888-0000-4000-8000-000000000011'),'farmacia','lojista B não altera loja pública de A');
UPDATE public.produtos SET nome='Tentativa B' WHERE id='88888888-0000-4000-8000-000000000021';
SELECT is((SELECT nome FROM public.produtos WHERE id='88888888-0000-4000-8000-000000000021'),'Produto A','lojista B não altera produto da loja A');
UPDATE public.estabelecimentos_horarios SET aberto=false WHERE estabelecimento_id='88888888-0000-4000-8000-000000000011';
SELECT is((SELECT aberto FROM public.estabelecimentos_horarios WHERE estabelecimento_id='88888888-0000-4000-8000-000000000011'),true,'lojista B não altera horário da loja A');
SELECT set_config('request.jwt.claim.sub','88888888-0000-4000-8000-000000000002',true);
SELECT is((SELECT cnpj FROM public.obter_estabelecimentos_privados('88888888-0000-4000-8000-000000000011')),'88888888000101','dono lê próprio CNPJ');
SELECT is((SELECT count(*)::integer FROM public.obter_estabelecimentos_privados(NULL)),1,'dono lista só a própria loja');
UPDATE public.estabelecimentos SET categoria='alimentacao' WHERE id='88888888-0000-4000-8000-000000000011';
SELECT is((SELECT categoria FROM public.estabelecimentos_publicos WHERE id='88888888-0000-4000-8000-000000000011'),'alimentacao','dono atualiza própria loja por id sem SELECT privado');
UPDATE public.produtos SET nome='Produto A novo' WHERE id='88888888-0000-4000-8000-000000000021';
SELECT is((SELECT nome FROM public.produtos WHERE id='88888888-0000-4000-8000-000000000021'),'Produto A novo','dono conserva edição dos próprios produtos');
UPDATE public.estabelecimentos_horarios SET aberto=false,hora_abre=NULL,hora_fecha=NULL WHERE estabelecimento_id='88888888-0000-4000-8000-000000000011';
SELECT is((SELECT aberto FROM public.estabelecimentos_horarios WHERE estabelecimento_id='88888888-0000-4000-8000-000000000011'),false,'dono conserva edição dos próprios horários');
SELECT set_config('request.jwt.claim.sub','88888888-0000-4000-8000-000000000004',true);
SELECT is((SELECT count(*)::integer FROM public.obter_estabelecimentos_privados(NULL)),2,'Admin lista lojas privadas');
SELECT throws_ok('SELECT * FROM public.estabelecimentos','42501',NULL,'Admin usa RPC para cadastro privado');
SELECT is((SELECT chave_pix FROM public.obter_estabelecimentos_privados('88888888-0000-4000-8000-000000000012')),'pix-b@example.invalid','Admin lê PIX necessário à operação');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
