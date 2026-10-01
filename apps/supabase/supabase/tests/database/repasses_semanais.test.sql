BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT is((SELECT semana_inicio FROM public.semana_repasse('2026-09-28 03:00:00+00')),DATE '2026-09-28','segunda 00h Brasília inicia semana');
SELECT is((SELECT previsto_para FROM public.semana_repasse('2026-09-28 03:00:00+00')),DATE '2026-10-09','segunda Brasília vence sexta seguinte');
SELECT is((SELECT semana_inicio FROM public.semana_repasse('2026-10-05 02:59:59+00')),DATE '2026-09-28','domingo à noite permanece na semana');
SELECT is((SELECT previsto_para FROM public.semana_repasse('2026-10-05 03:00:00+00')),DATE '2026-10-16','segunda exata muda vencimento');
SELECT is((SELECT previsto_para FROM public.semana_repasse('2026-12-28 15:00:00+00')),DATE '2027-01-08','virada de ano usa calendário local');

INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES
 ('79999999-0000-4000-8000-000000000001','authenticated','authenticated','repasse-cliente@example.invalid','{}','{}'),
 ('79999999-0000-4000-8000-000000000002','authenticated','authenticated','repasse-lojista@example.invalid','{}','{}'),
 ('79999999-0000-4000-8000-000000000003','authenticated','authenticated','repasse-admin@example.invalid','{}','{}'),
 ('79999999-0000-4000-8000-000000000004','authenticated','authenticated','repasse-outra-loja@example.invalid','{}','{}');
INSERT INTO public.admin_users(id,nome) VALUES('79999999-0000-4000-8000-000000000003','Admin Repasse');
INSERT INTO public.hubs(id,nome,endereco,lat,lng) VALUES('79999999-0000-4000-8000-000000000010','Hub Repasse','Rua',0,0);
INSERT INTO public.estabelecimentos(id,dono_user_id,nome_fantasia,cnpj,responsavel_nome,telefone,categoria,endereco,tempo_medio_entrega_min,taxa_deslocamento_reais,chave_pix,chave_pix_tipo,status) VALUES
 ('79999999-0000-4000-8000-000000000020','79999999-0000-4000-8000-000000000002','Loja A','79999999000100','Titular A','11999999991','farmacia','Rua A',10,5,'pix-antigo@example.invalid','email','ativo'),
 ('79999999-0000-4000-8000-000000000021','79999999-0000-4000-8000-000000000004','Loja B','79999999000200','Titular B','11999999992','farmacia','Rua B',10,5,'pix-b@example.invalid','email','ativo');
INSERT INTO public.pedidos(id,cliente_id,estabelecimento_id,hub_id,status,subtotal_produtos_reais,taxa_deslocamento_reais,taxa_keepit_reais,taxa_servico_comprador_reais,total_pago_reais,forma_pagamento,pago_em) VALUES
 ('79999999-0000-4000-8000-000000000101','79999999-0000-4000-8000-000000000001','79999999-0000-4000-8000-000000000020','79999999-0000-4000-8000-000000000010','no_hub',100,5,10,2.9,107.9,'pix',now()),
 ('79999999-0000-4000-8000-000000000102','79999999-0000-4000-8000-000000000001','79999999-0000-4000-8000-000000000020','79999999-0000-4000-8000-000000000010','no_hub',100,5,10,2.9,107.9,'pix',now());
INSERT INTO private.pedido_segredos(pedido_id,pin_hash,pin_texto)
VALUES('79999999-0000-4000-8000-000000000101',extensions.crypt('1234',extensions.gen_salt('bf',4)),'1234');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','79999999-0000-4000-8000-000000000002',true);
SELECT is((SELECT resultado FROM public.confirmar_pin_pedido('79999999-0000-4000-8000-000000000101','1234')),'entregue','PIN cria elegibilidade');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000101' AND tipo='merchant_credit' AND valor_centavos>0),1,'PIN cria crédito positivo único');
SELECT is((SELECT valor_centavos FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000101' AND tipo='merchant_credit'),9500::bigint,'crédito líquido não desconta gateway');
SELECT is((SELECT semana_inicio FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000101' AND tipo='merchant_credit'),(SELECT semana_inicio FROM public.semana_repasse(now())),'crédito recebe semana de Brasília');
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000102' AND tipo='merchant_credit'),0,'pedido sem PIN não gera crédito');
INSERT INTO public.lancamentos_financeiros(estabelecimento_id,pedido_id,tipo,valor_centavos,status,detalhe)
VALUES('79999999-0000-4000-8000-000000000020','79999999-0000-4000-8000-000000000101','merchant_credit',-3000,'concluido','Ajuste confirmado antes do lote');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','79999999-0000-4000-8000-000000000002',true);
SELECT is((SELECT valor_centavos FROM public.previsoes_repasse WHERE estabelecimento_id='79999999-0000-4000-8000-000000000020'),6500::bigint,'lojista vê previsão líquida antes da preparação');
SELECT throws_ok($$SELECT public.preparar_repasses_semanais((SELECT semana_inicio FROM public.semana_repasse(now())),'79999999-0000-4000-8000-000000000201')$$,'P0001','ACESSO_NEGADO','lojista não prepara lote');
SELECT set_config('request.jwt.claim.sub','79999999-0000-4000-8000-000000000003',true);
SELECT is((SELECT count(*)::integer FROM public.preparar_repasses_semanais((SELECT semana_inicio FROM public.semana_repasse(now())),'79999999-0000-4000-8000-000000000201')),1,'Admin prepara um lote');
SELECT is((SELECT count(*)::integer FROM public.preparar_repasses_semanais((SELECT semana_inicio FROM public.semana_repasse(now())),'79999999-0000-4000-8000-000000000201')),1,'retry devolve mesmo lote');
SELECT throws_ok($$SELECT public.confirmar_repasse((SELECT id FROM public.repasses WHERE estabelecimento_id='79999999-0000-4000-8000-000000000020' AND estado='pendente'),' ','79999999-0000-4000-8000-000000000202')$$,'P0001','REFERENCIA_OBRIGATORIA','referência vazia rejeitada');
RESET ROLE;
SELECT is((SELECT valor_centavos FROM public.repasses WHERE estabelecimento_id='79999999-0000-4000-8000-000000000020' AND estado='pendente'),6500::bigint,'ajuste anterior reduz lote em centavos');
SELECT is((SELECT count(*)::integer FROM public.repasse_itens WHERE repasse_id=(SELECT id FROM public.repasses WHERE estado='pendente')),2,'crédito e ajuste alocados uma vez');
SELECT is((SELECT chave_pix FROM public.repasses WHERE estado='pendente'),'pix-antigo@example.invalid','PIX congelado no lote');
SELECT throws_ok($$UPDATE public.repasses SET chave_pix='pix-adulterado' WHERE estado='pendente'$$,'P0001','SNAPSHOT_REPASSE_IMUTAVEL','snapshot não pode ser reescrito');
SELECT throws_ok($$UPDATE public.repasse_itens SET valor_centavos=1 WHERE repasse_id=(SELECT id FROM public.repasses WHERE estado='pendente')$$,'P0001','ALOCACAO_IMUTAVEL','alocação não pode ser reescrita');
UPDATE public.estabelecimentos SET chave_pix='pix-novo@example.invalid',status='suspenso' WHERE id='79999999-0000-4000-8000-000000000020';
SELECT is((SELECT chave_pix FROM public.repasses WHERE estado='pendente'),'pix-antigo@example.invalid','mudança cadastral não altera snapshot preparado');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','79999999-0000-4000-8000-000000000004',true);
SELECT is((SELECT count(*)::integer FROM public.repasses),0,'outra loja não lê repasse');
SELECT is((SELECT count(*)::integer FROM public.repasse_itens),0,'outra loja não lê alocações');
SELECT ok(NOT has_table_privilege('authenticated','public.repasses','UPDATE'),'lojista não modifica lote diretamente');
SELECT set_config('request.jwt.claim.sub','79999999-0000-4000-8000-000000000002',true);
SELECT is((SELECT count(*)::integer FROM public.repasses),1,'lojista suspenso conserva histórico');
SELECT is((SELECT count(*)::integer FROM public.carteira_lojista WHERE estabelecimento_id='79999999-0000-4000-8000-000000000020'),1,'loja suspensa mantém carteira');
SELECT set_config('request.jwt.claim.sub','79999999-0000-4000-8000-000000000003',true);
SELECT is((public.invalidar_repasse((SELECT id FROM public.repasses WHERE estado='pendente'),'Chave anterior inválida','79999999-0000-4000-8000-000000000203')).estado,'invalidado','Admin invalida lote antes do PIX');
SELECT is((SELECT count(*)::integer FROM public.preparar_repasses_semanais((SELECT semana_inicio FROM public.semana_repasse(now())),'79999999-0000-4000-8000-000000000204')),1,'nova preparação relê fontes liberadas');
SELECT is((SELECT chave_pix FROM public.repasses WHERE estado='pendente'),'pix-novo@example.invalid','novo lote usa PIX corrigido');
RESET ROLE;
INSERT INTO public.lancamentos_financeiros(estabelecimento_id,pedido_id,tipo,valor_centavos,status,detalhe)
VALUES('79999999-0000-4000-8000-000000000020','79999999-0000-4000-8000-000000000101','merchant_credit',-10000,'concluido','Ajuste posterior à preparação');
SELECT is((SELECT valor_centavos FROM public.repasses WHERE estado='pendente'),6500::bigint,'ajuste posterior não muda lote congelado');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','79999999-0000-4000-8000-000000000003',true);
SELECT is((public.confirmar_repasse((SELECT id FROM public.repasses WHERE estado='pendente'),'pix-transfer-001','79999999-0000-4000-8000-000000000205')).estado,'pago','Admin confirma PIX manual');
SELECT is((public.confirmar_repasse((SELECT id FROM public.repasses WHERE estado='pago'),'pix-transfer-001','79999999-0000-4000-8000-000000000205')).estado,'pago','confirmação repetida é idempotente');
SELECT throws_ok($$SELECT public.invalidar_repasse((SELECT id FROM public.repasses WHERE estado='pago'),'Tarde','79999999-0000-4000-8000-000000000206')$$,'P0001','ESTADO_INVALIDO','lote pago não libera alocações');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE tipo='payout' AND repasse_id=(SELECT id FROM public.repasses WHERE estado='pago')),1,'baixa payout única');
SELECT is((SELECT valor_centavos FROM public.lancamentos_financeiros WHERE tipo='payout' AND repasse_id=(SELECT id FROM public.repasses WHERE estado='pago')),-6500::bigint,'baixa tem sinal negativo');
SELECT is((SELECT count(*)::integer FROM public.repasse_itens WHERE liberado_em IS NULL AND valor_centavos>0),1,'crédito possui uma alocação ativa');

-- Ajuste posterior à preparação consome integralmente a próxima semana e carrega o resto.
INSERT INTO public.pedidos(id,cliente_id,estabelecimento_id,hub_id,status,subtotal_produtos_reais,taxa_deslocamento_reais,taxa_keepit_reais,taxa_servico_comprador_reais,total_pago_reais,forma_pagamento,pago_em) VALUES
 ('79999999-0000-4000-8000-000000000103','79999999-0000-4000-8000-000000000001','79999999-0000-4000-8000-000000000020','79999999-0000-4000-8000-000000000010','no_hub',100,5,10,2.9,107.9,'pix',now()),
 ('79999999-0000-4000-8000-000000000104','79999999-0000-4000-8000-000000000001','79999999-0000-4000-8000-000000000020','79999999-0000-4000-8000-000000000010','no_hub',100,5,10,2.9,107.9,'pix',now());
INSERT INTO private.pedido_segredos(pedido_id,pin_hash,pin_texto) VALUES
 ('79999999-0000-4000-8000-000000000103',extensions.crypt('1234',extensions.gen_salt('bf',4)),'1234'),
 ('79999999-0000-4000-8000-000000000104',extensions.crypt('1234',extensions.gen_salt('bf',4)),'1234');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','79999999-0000-4000-8000-000000000002',true);
SELECT is((SELECT resultado FROM public.confirmar_pin_pedido('79999999-0000-4000-8000-000000000103','1234')),'entregue','segundo PIN cria crédito após lote');
SELECT set_config('request.jwt.claim.sub','79999999-0000-4000-8000-000000000003',true);
SELECT is((SELECT estado FROM public.preparar_repasses_semanais((SELECT semana_inicio+7 FROM public.semana_repasse(now())),'79999999-0000-4000-8000-000000000207')),'compensado','ajuste maior que crédito cria lote sem PIX');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE tipo='payout'),1,'lote compensado não cria payout negativo');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','79999999-0000-4000-8000-000000000002',true);
SELECT is((SELECT resultado FROM public.confirmar_pin_pedido('79999999-0000-4000-8000-000000000104','1234')),'entregue','terceiro PIN cria crédito');
SELECT set_config('request.jwt.claim.sub','79999999-0000-4000-8000-000000000003',true);
SELECT is((SELECT valor_centavos FROM public.preparar_repasses_semanais((SELECT semana_inicio+14 FROM public.semana_repasse(now())),'79999999-0000-4000-8000-000000000208')),9000::bigint,'dívida residual é aplicada uma só vez à semana seguinte');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
