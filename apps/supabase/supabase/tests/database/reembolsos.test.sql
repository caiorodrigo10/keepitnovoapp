BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT has_function('public','confirmar_reembolso',ARRAY['uuid','text','uuid']::text[],'confirmação manual disponível');
SELECT has_function('public','registrar_execucao_reembolso',ARRAY['uuid','text','text','uuid','text']::text[],'execução por lançamento disponível');
SELECT has_function('public','processar_evento_reembolso',ARRAY['text','text','text','text','bigint','text','text']::text[],'webhook de estorno disponível');

INSERT INTO auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES
 ('79999999-0000-4000-8000-000000000001','authenticated','authenticated','cliente-refund@example.invalid','{}','{}'),
 ('79999999-0000-4000-8000-000000000002','authenticated','authenticated','lojista-refund@example.invalid','{}','{}'),
 ('79999999-0000-4000-8000-000000000003','authenticated','authenticated','admin-refund@example.invalid','{}','{}');
INSERT INTO public.admin_users(id,nome) VALUES ('79999999-0000-4000-8000-000000000003','Admin Refund');
INSERT INTO public.hubs(id,nome,endereco,lat,lng) VALUES ('79999999-0000-4000-8000-000000000010','Hub','Rua',0,0);
INSERT INTO public.estabelecimentos(id,dono_user_id,nome_fantasia,cnpj,responsavel_nome,telefone,categoria,endereco,tempo_medio_entrega_min,taxa_deslocamento_reais,chave_pix,chave_pix_tipo,status)
VALUES ('79999999-0000-4000-8000-000000000020','79999999-0000-4000-8000-000000000002','Loja','79999999000100','Lojista','11999999999','farmacia','Rua',10,5,'refund@example.invalid','email','ativo');
INSERT INTO public.pedidos(id,cliente_id,estabelecimento_id,hub_id,status,subtotal_produtos_reais,taxa_deslocamento_reais,taxa_keepit_reais,taxa_servico_comprador_reais,total_pago_reais,forma_pagamento,pago_em)
VALUES
 ('79999999-0000-4000-8000-000000000101','79999999-0000-4000-8000-000000000001','79999999-0000-4000-8000-000000000020','79999999-0000-4000-8000-000000000010','aguardando_aceite',10,5,1,2.90,17.90,'pix',now()),
 ('79999999-0000-4000-8000-000000000102','79999999-0000-4000-8000-000000000001','79999999-0000-4000-8000-000000000020','79999999-0000-4000-8000-000000000010','aguardando_pagamento',10,5,1,2.90,17.90,'pix',NULL),
 ('79999999-0000-4000-8000-000000000103','79999999-0000-4000-8000-000000000001','79999999-0000-4000-8000-000000000020','79999999-0000-4000-8000-000000000010','entregue',10,5,1,2.90,17.90,'pix',now()),
 ('79999999-0000-4000-8000-000000000104','79999999-0000-4000-8000-000000000001','79999999-0000-4000-8000-000000000020','79999999-0000-4000-8000-000000000010','entregue',10,5,1,2.90,17.90,'pix',now()),
 ('79999999-0000-4000-8000-000000000105','79999999-0000-4000-8000-000000000001','79999999-0000-4000-8000-000000000020','79999999-0000-4000-8000-000000000010','entregue',10,5,1,2.90,17.90,'pix',now()),
 ('79999999-0000-4000-8000-000000000106','79999999-0000-4000-8000-000000000001','79999999-0000-4000-8000-000000000020','79999999-0000-4000-8000-000000000010','entregue',10,5,1,2.90,17.90,'pix',now()),
 ('79999999-0000-4000-8000-000000000107','79999999-0000-4000-8000-000000000001','79999999-0000-4000-8000-000000000020','79999999-0000-4000-8000-000000000010','entregue',10,5,1,2.90,17.90,'pix',now());
INSERT INTO public.tentativas_pagamento(id,pedido_id,cliente_id,operacao_id,forma,estado,asaas_payment_id)
VALUES
 ('79999999-0000-4000-8000-000000000301','79999999-0000-4000-8000-000000000103','79999999-0000-4000-8000-000000000001','79999999-0000-4000-8000-000000000401','pix','recebido','pay-refund-103'),
 ('79999999-0000-4000-8000-000000000302','79999999-0000-4000-8000-000000000104','79999999-0000-4000-8000-000000000001','79999999-0000-4000-8000-000000000402','pix','recebido','pay-refund-104');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','79999999-0000-4000-8000-000000000001',true);
SELECT is((public.abrir_solicitacao_pedido('79999999-0000-4000-8000-000000000101','cancelamento','Desisti','79999999-0000-4000-8000-000000000201')).estado,'aprovada','cancelamento pago aprovado');
SELECT is((public.abrir_solicitacao_pedido('79999999-0000-4000-8000-000000000102','cancelamento','Desisti','79999999-0000-4000-8000-000000000202')).estado,'aprovada','cancelamento sem pagamento aprovado');
SELECT is((public.abrir_solicitacao_pedido('79999999-0000-4000-8000-000000000103','pos_entrega','Item faltou','79999999-0000-4000-8000-000000000203')).estado,'aberta','pós-entrega abre caso');
SELECT is((public.abrir_solicitacao_pedido('79999999-0000-4000-8000-000000000104','pos_entrega','Outro item faltou','79999999-0000-4000-8000-000000000209')).estado,'aberta','segundo caso para webhook primeiro');
SELECT is((public.abrir_solicitacao_pedido('79999999-0000-4000-8000-000000000105','pos_entrega','Terceiro item faltou','79999999-0000-4000-8000-000000000213')).estado,'aberta','caso para compatibilidade da RPC antiga');
SELECT is((public.abrir_solicitacao_pedido('79999999-0000-4000-8000-000000000106','pos_entrega','Quarto item faltou','79999999-0000-4000-8000-000000000215')).estado,'aberta','caso para liberar reserva comprovada');
SELECT is((public.abrir_solicitacao_pedido('79999999-0000-4000-8000-000000000107','pos_entrega','Quinto item faltou','79999999-0000-4000-8000-000000000217')).estado,'aberta','caso para negativa');
SELECT set_config('request.jwt.claim.sub','79999999-0000-4000-8000-000000000003',true);
SELECT is((SELECT sum(-valor_centavos)::integer FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000101' AND tipo='refund'),1790,'cancelamento reserva 100% do total pago');
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000101' AND tipo='merchant_credit'),0,'cancelamento sem PIN não remunera lojista');
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000102' AND tipo='refund'),0,'sem pagamento não devolve');
SELECT lives_ok($$SELECT public.confirmar_reembolso((SELECT id FROM public.solicitacoes_pedido WHERE operacao_id='79999999-0000-4000-8000-000000000201'),'ext-cancel-101','79999999-0000-4000-8000-000000000221')$$,'cancelamento integral é confirmado manualmente');
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000101' AND tipo='merchant_credit'),0,'confirmação de cancelamento sem PIN não remunera loja');
SELECT throws_ok($$SELECT public.decidir_solicitacao_pedido((SELECT id FROM public.solicitacoes_pedido WHERE operacao_id='79999999-0000-4000-8000-000000000203'),true,'Procede',NULL,'lojista','79999999-0000-4000-8000-000000000204')$$,'P0001','VALOR_RESPONSABILIDADE_OBRIGATORIOS','valor obrigatório');
SELECT is((public.decidir_solicitacao_pedido((SELECT id FROM public.solicitacoes_pedido WHERE operacao_id='79999999-0000-4000-8000-000000000203'),true,'Item ausente',500,'lojista','79999999-0000-4000-8000-000000000205')).estado,'aprovada','aprova devolução parcial');
SELECT is(public.saldo_reembolsavel('79999999-0000-4000-8000-000000000103')::integer,1290,'reserva reduz saldo');
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000103' AND tipo='merchant_credit' AND valor_centavos<0),0,'aprovação ainda não debita loja');
SELECT is((SELECT responsavel_reembolso FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000103' AND tipo='refund'),'lojista','responsabilidade auditada');
SELECT lives_ok($$SELECT public.registrar_execucao_reembolso((SELECT id FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000103' AND tipo='refund'),'erro','failed-ext-1','79999999-0000-4000-8000-000000000206','Gateway indisponível')$$,'falha mantém devolução');
SELECT is(public.saldo_reembolsavel('79999999-0000-4000-8000-000000000103')::integer,1290,'falha não libera reserva');
SELECT lives_ok($$SELECT public.reabrir_execucao_reembolso((SELECT id FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000103' AND tipo='refund'),'Gateway confirmou ausência de efeito','79999999-0000-4000-8000-000000000212')$$,'reabre a mesma devolução após comprovar falha');
SELECT is((SELECT asaas_id_externo FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000103' AND tipo='refund'),NULL::text,'referência da tentativa sem efeito é liberada');
SELECT lives_ok($$SELECT public.confirmar_reembolso((SELECT id FROM public.solicitacoes_pedido WHERE operacao_id='79999999-0000-4000-8000-000000000203'),'ext-ref-1','79999999-0000-4000-8000-000000000207')$$,'Admin confirma a mesma reserva');
SELECT lives_ok($$SELECT public.confirmar_reembolso((SELECT id FROM public.solicitacoes_pedido WHERE operacao_id='79999999-0000-4000-8000-000000000203'),'ext-ref-1','79999999-0000-4000-8000-000000000207')$$,'retry é idempotente');
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000103' AND tipo='merchant_credit' AND valor_centavos=-500),1,'confirmação debita lojista uma vez');
SELECT throws_ok($$SELECT public.confirmar_reembolso((SELECT id FROM public.solicitacoes_pedido WHERE operacao_id='79999999-0000-4000-8000-000000000203'),'outra-ref','79999999-0000-4000-8000-000000000208')$$,'P0001','REFERENCIA_DIVERGENTE','identidade divergente exige conciliação');

SELECT is((public.decidir_solicitacao_pedido((SELECT id FROM public.solicitacoes_pedido WHERE operacao_id='79999999-0000-4000-8000-000000000209'),true,'Procede',500,'keepit','79999999-0000-4000-8000-000000000210')).estado,'aprovada','segunda reserva aprovada');
SELECT is((public.decidir_solicitacao_pedido((SELECT id FROM public.solicitacoes_pedido WHERE operacao_id='79999999-0000-4000-8000-000000000213'),true,'Procede',100,'lojista','79999999-0000-4000-8000-000000000214')).estado,'aprovada','terceira reserva aprovada');
SELECT lives_ok($$SELECT public.confirmar_lancamento_admin((SELECT id FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000105' AND tipo='refund'),'concluido',NULL,'legacy-ref')$$,'RPC legada confirma pela mesma autoridade');
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000105' AND tipo='merchant_credit' AND valor_centavos=-100),1,'RPC legada também gera débito único');
SELECT is((public.decidir_solicitacao_pedido((SELECT id FROM public.solicitacoes_pedido WHERE operacao_id='79999999-0000-4000-8000-000000000215'),true,'Procede',700,'keepit','79999999-0000-4000-8000-000000000216')).estado,'aprovada','reserva passível de liberação');
SELECT lives_ok($$SELECT public.registrar_execucao_reembolso((SELECT id FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000106' AND tipo='refund'),'erro','failed-ext-106','79999999-0000-4000-8000-000000000220','Gateway negou')$$,'falha identificada mantém referência');
SELECT lives_ok($$SELECT public.liberar_reserva_reembolso((SELECT id FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000106' AND tipo='refund'),'Gateway confirma cancelamento sem efeito','79999999-0000-4000-8000-000000000218')$$,'Admin libera com comprovação');
SELECT is(public.saldo_reembolsavel('79999999-0000-4000-8000-000000000106')::integer,1790,'liberação devolve saldo');
SELECT is((SELECT count(*)::integer FROM public.eventos_reembolso WHERE tipo='liberacao' AND lancamento_id=(SELECT id FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000106' AND tipo='refund')),1,'liberação mantém histórico');
SELECT is((public.decidir_solicitacao_pedido((SELECT id FROM public.solicitacoes_pedido WHERE operacao_id='79999999-0000-4000-8000-000000000217'),false,'Sem evidência',NULL,NULL,'79999999-0000-4000-8000-000000000219')).estado,'negada','caso negado');
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000107' AND tipo='refund'),0,'negação não reserva devolução');
SET LOCAL ROLE service_role;
SELECT is((SELECT resultado FROM public.processar_evento_reembolso('evt-r1:ext-ref-1','PAYMENT_PARTIALLY_REFUNDED','pay-refund-103','ext-ref-1',500,'pix','79999999-0000-4000-8000-000000000301')),'reembolso_conciliado','manual antes do webhook correlaciona');
SELECT is((SELECT resultado FROM public.processar_evento_reembolso('evt-r1:ext-ref-1','PAYMENT_PARTIALLY_REFUNDED','pay-refund-103','ext-ref-1',500,'pix','79999999-0000-4000-8000-000000000301')),'reembolso_conciliado','evento repetido é idempotente');
SELECT is((SELECT resultado FROM public.processar_evento_reembolso('evt-r1-denied:ext-ref-1','PAYMENT_REFUND_DENIED','pay-refund-103','ext-ref-1',500,'pix','79999999-0000-4000-8000-000000000301')),'conciliacao_necessaria','negação tardia não desfaz confirmação');
SELECT is((SELECT resultado FROM public.processar_evento_reembolso('evt-r2:ext-ref-2','PAYMENT_PARTIALLY_REFUNDED','pay-refund-104','ext-ref-2',500,'pix','79999999-0000-4000-8000-000000000302')),'reembolso_conciliado','webhook antes da confirmação correlaciona');
SELECT is((SELECT resultado FROM public.processar_evento_reembolso('evt-r3:wrong','PAYMENT_PARTIALLY_REFUNDED','pay-refund-104','wrong',501,'pix','79999999-0000-4000-8000-000000000302')),'conciliacao_necessaria','valor ou identidade divergente não cria outro refund');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','79999999-0000-4000-8000-000000000003',true);
SELECT lives_ok($$SELECT public.confirmar_reembolso((SELECT id FROM public.solicitacoes_pedido WHERE operacao_id='79999999-0000-4000-8000-000000000209'),'ext-ref-2','79999999-0000-4000-8000-000000000211')$$,'Admin depois do webhook aceita mesmo estorno');
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000103' AND tipo='merchant_credit' AND valor_centavos=-500),1,'manual/webhook não duplicam débito');
SELECT is((SELECT count(*)::integer FROM public.despesas_reembolso WHERE lancamento_id=(SELECT id FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000104' AND tipo='refund')),1,'Keepit assume despesa fora da carteira');
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE pedido_id='79999999-0000-4000-8000-000000000104' AND tipo='refund'),1,'webhook não cria segunda devolução');

RESET ROLE;
SELECT throws_ok($$UPDATE public.lancamentos_financeiros SET responsavel_reembolso='keepit' WHERE pedido_id='79999999-0000-4000-8000-000000000103' AND tipo='refund'$$,'P0001','REEMBOLSO_METADATA_IMUTAVEL','responsabilidade confirmada é imutável');
SELECT * FROM finish();
ROLLBACK;
