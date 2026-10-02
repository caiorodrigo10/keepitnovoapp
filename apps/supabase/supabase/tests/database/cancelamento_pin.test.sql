BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT has_function('public', 'abrir_solicitacao_pedido', ARRAY['uuid','text','text','uuid']::text[], 'RPC de abertura existe');
SELECT has_function('public', 'decidir_solicitacao_pedido', ARRAY['uuid','boolean','text','integer','text','uuid']::text[], 'RPC de decisão existe');

INSERT INTO auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES
 ('89999999-0000-4000-8000-000000000001','authenticated','authenticated','cliente-suporte@example.invalid','{}','{}'),
 ('89999999-0000-4000-8000-000000000002','authenticated','authenticated','lojista-suporte@example.invalid','{}','{}'),
 ('89999999-0000-4000-8000-000000000003','authenticated','authenticated','admin-suporte@example.invalid','{}','{}'),
 ('89999999-0000-4000-8000-000000000004','authenticated','authenticated','outro-suporte@example.invalid','{}','{}');
INSERT INTO public.admin_users (id,nome) VALUES ('89999999-0000-4000-8000-000000000003','Admin');
INSERT INTO public.hubs (id,nome,endereco,lat,lng) VALUES ('89999999-0000-4000-8000-000000000010','Hub','Rua',0,0);
INSERT INTO public.estabelecimentos (id,dono_user_id,nome_fantasia,cnpj,responsavel_nome,telefone,categoria,endereco,tempo_medio_entrega_min,taxa_deslocamento_reais,chave_pix,chave_pix_tipo,status)
VALUES ('89999999-0000-4000-8000-000000000020','89999999-0000-4000-8000-000000000002','Loja','89999999000100','Lojista','11999999999','farmacia','Rua',10,5,'suporte@example.invalid','email','ativo');
INSERT INTO public.pedidos (id,cliente_id,estabelecimento_id,hub_id,status,subtotal_produtos_reais,taxa_deslocamento_reais,taxa_keepit_reais,taxa_servico_comprador_reais,total_pago_reais,forma_pagamento,pago_em)
VALUES
 ('89999999-0000-4000-8000-000000000101','89999999-0000-4000-8000-000000000001','89999999-0000-4000-8000-000000000020','89999999-0000-4000-8000-000000000010','aguardando_aceite',10,5,1,2.9,17.9,'pix',now()),
 ('89999999-0000-4000-8000-000000000102','89999999-0000-4000-8000-000000000001','89999999-0000-4000-8000-000000000020','89999999-0000-4000-8000-000000000010','em_preparo',10,5,1,2.9,17.9,'pix',now()),
 ('89999999-0000-4000-8000-000000000103','89999999-0000-4000-8000-000000000001','89999999-0000-4000-8000-000000000020','89999999-0000-4000-8000-000000000010','no_hub',10,5,1,2.9,17.9,'pix',now()),
 ('89999999-0000-4000-8000-000000000105','89999999-0000-4000-8000-000000000001','89999999-0000-4000-8000-000000000020','89999999-0000-4000-8000-000000000010','aguardando_pagamento',10,5,1,2.9,17.9,'pix',NULL),
 ('89999999-0000-4000-8000-000000000106','89999999-0000-4000-8000-000000000001','89999999-0000-4000-8000-000000000020','89999999-0000-4000-8000-000000000010','no_hub',10,5,1,2.9,17.9,'pix',now()),
 ('89999999-0000-4000-8000-000000000107','89999999-0000-4000-8000-000000000001','89999999-0000-4000-8000-000000000020','89999999-0000-4000-8000-000000000010','no_hub',10,5,1,2.9,17.9,'pix',now()),
 ('89999999-0000-4000-8000-000000000108','89999999-0000-4000-8000-000000000001','89999999-0000-4000-8000-000000000020','89999999-0000-4000-8000-000000000010','em_preparo',10,5,1,2.9,17.9,'pix',now()),
 ('89999999-0000-4000-8000-000000000109','89999999-0000-4000-8000-000000000001','89999999-0000-4000-8000-000000000020','89999999-0000-4000-8000-000000000010','aguardando_aceite',10,5,1,2.9,17.9,'pix',now());
UPDATE public.pedidos SET cliente_chegou_em=now()-interval '40 minutes',tempo_estimado_min=10 WHERE id='89999999-0000-4000-8000-000000000107';
UPDATE public.pedidos SET aceito_em=now()-interval '2 hours',tempo_estimado_min=20 WHERE id='89999999-0000-4000-8000-000000000108';
INSERT INTO private.pedido_segredos (pedido_id,pin_hash,pin_texto)
VALUES
 ('89999999-0000-4000-8000-000000000101',extensions.crypt('1234',extensions.gen_salt('bf',4)),'1234'),
 ('89999999-0000-4000-8000-000000000103',extensions.crypt('1234',extensions.gen_salt('bf',4)),'1234'),
 ('89999999-0000-4000-8000-000000000109',extensions.crypt('1234',extensions.gen_salt('bf',4)),'1234');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','89999999-0000-4000-8000-000000000001',true);
SELECT is((public.abrir_solicitacao_pedido('89999999-0000-4000-8000-000000000101','cancelamento','Desisti','89999999-0000-4000-8000-000000000201')).estado,'aprovada','pré-aceite cancela imediatamente');
SELECT is((public.abrir_solicitacao_pedido('89999999-0000-4000-8000-000000000102','cancelamento','Não poderei ir','89999999-0000-4000-8000-000000000202')).estado,'aberta','pós-aceite abre solicitação');
SELECT is((SELECT status FROM public.pedidos WHERE id='89999999-0000-4000-8000-000000000102'),'em_preparo','solicitação não para preparo');
SELECT is((public.abrir_solicitacao_pedido('89999999-0000-4000-8000-000000000102','cancelamento','Não poderei ir','89999999-0000-4000-8000-000000000202')).id::text,(SELECT id::text FROM public.solicitacoes_pedido WHERE operacao_id='89999999-0000-4000-8000-000000000202'),'retry retorna caso existente');
SELECT is((public.abrir_solicitacao_pedido('89999999-0000-4000-8000-000000000102','cancelamento','Outro envio','89999999-0000-4000-8000-000000000213')).id::text,(SELECT id::text FROM public.solicitacoes_pedido WHERE operacao_id='89999999-0000-4000-8000-000000000202'),'segunda operação recebe mesmo caso');
SELECT is((public.abrir_solicitacao_pedido('89999999-0000-4000-8000-000000000103','cancelamento','Não poderei ir','89999999-0000-4000-8000-000000000205')).estado,'aberta','pedido no hub continua retirável durante análise');
SELECT lives_ok($$SELECT public.reportar_lojista_nao_veio('89999999-0000-4000-8000-000000000107')$$,'ausência do lojista abre atendimento');
SELECT lives_ok($$SELECT public.cancelar_pedido_atraso('89999999-0000-4000-8000-000000000108')$$,'atraso abre atendimento');
SELECT set_config('request.jwt.claim.sub','89999999-0000-4000-8000-000000000004',true);
SELECT throws_ok($$SELECT public.abrir_solicitacao_pedido('89999999-0000-4000-8000-000000000102','cancelamento','Outro','89999999-0000-4000-8000-000000000203')$$,'P0001','ACESSO_NEGADO','cliente B não abre caso A');
SELECT set_config('request.jwt.claim.sub','89999999-0000-4000-8000-000000000002',true);
SELECT throws_ok($$SELECT public.decidir_solicitacao_pedido((SELECT id FROM public.solicitacoes_pedido WHERE operacao_id='89999999-0000-4000-8000-000000000202'),true,'Aceito',NULL,NULL,'89999999-0000-4000-8000-000000000204')$$,'P0001','ACESSO_NEGADO','lojista não decide');
SELECT is((public.abrir_solicitacao_pedido('89999999-0000-4000-8000-000000000106','cliente_ausente','Cliente não compareceu','89999999-0000-4000-8000-000000000220')).estado,'aberta','ausência do cliente abre atendimento');
SELECT lives_ok($$SELECT public.aceitar_pedido('89999999-0000-4000-8000-000000000109',20)$$,'lojista aceita pedido de fluxo completo');
SELECT is(public.avancar_estado_pedido('89999999-0000-4000-8000-000000000109','em_preparo'),'em_preparo','lojista inicia preparo');
SELECT set_config('request.jwt.claim.sub','89999999-0000-4000-8000-000000000001',true);
SELECT is((public.abrir_solicitacao_pedido('89999999-0000-4000-8000-000000000109','cancelamento','Não posso retirar','89999999-0000-4000-8000-000000000210')).estado,'aberta','cliente solicita cancelamento durante preparo');
SELECT set_config('request.jwt.claim.sub','89999999-0000-4000-8000-000000000002',true);
SELECT is(public.avancar_estado_pedido('89999999-0000-4000-8000-000000000109','saindo_hub'),'saindo_hub','solicitação não bloqueia saída ao hub');
SELECT is(public.avancar_estado_pedido('89999999-0000-4000-8000-000000000109','no_hub'),'no_hub','solicitação não bloqueia chegada ao hub');
SELECT is((SELECT resultado FROM public.confirmar_pin_pedido('89999999-0000-4000-8000-000000000109','1234')),'entregue','quatro transições concluem somente com PIN');
SELECT is((SELECT resultado FROM public.confirmar_pin_pedido('89999999-0000-4000-8000-000000000103','1234')),'entregue','PIN correto entrega durante solicitação aberta');
SELECT throws_ok($$SELECT public.confirmar_pin_pedido('89999999-0000-4000-8000-000000000101','1234')$$,'P0001','ESTADO_INVALIDO','cancelado rejeita PIN');
SELECT set_config('request.jwt.claim.sub','89999999-0000-4000-8000-000000000003',true);
SELECT throws_ok($$SELECT public.decidir_solicitacao_pedido((SELECT id FROM public.solicitacoes_pedido WHERE operacao_id='89999999-0000-4000-8000-000000000202'),true,' ',NULL,NULL,'89999999-0000-4000-8000-000000000206')$$,'P0001','MOTIVO_OBRIGATORIO','Admin justifica decisão');
SELECT set_config('request.jwt.claim.sub','89999999-0000-4000-8000-000000000001',true);
SELECT is((public.abrir_solicitacao_pedido('89999999-0000-4000-8000-000000000109','pos_entrega','Produto faltando','89999999-0000-4000-8000-000000000211')).estado,'aberta','pós-entrega abre caso sem desfazer PIN');
SELECT set_config('request.jwt.claim.sub','89999999-0000-4000-8000-000000000003',true);
SELECT throws_ok($$SELECT public.decidir_solicitacao_pedido((SELECT id FROM public.solicitacoes_pedido WHERE operacao_id='89999999-0000-4000-8000-000000000211'),true,'Procede',100,NULL,'89999999-0000-4000-8000-000000000212')$$,'P0001','VALOR_RESPONSABILIDADE_OBRIGATORIOS','pós-entrega exige responsável além do valor');
SELECT is((public.decidir_solicitacao_pedido((SELECT id FROM public.solicitacoes_pedido WHERE operacao_id='89999999-0000-4000-8000-000000000202'),false,'Cliente pode retirar',NULL,NULL,'89999999-0000-4000-8000-000000000207')).estado,'negada','Admin pode negar com justificativa');
SELECT set_config('request.jwt.claim.sub','89999999-0000-4000-8000-000000000001',true);
SELECT is((public.abrir_solicitacao_pedido('89999999-0000-4000-8000-000000000102','cancelamento','Retry tardio','89999999-0000-4000-8000-000000000213')).estado,'negada','retry da segunda operação retorna caso original já decidido');
SELECT throws_ok($$SELECT public.abrir_solicitacao_pedido('89999999-0000-4000-8000-000000000108','atraso','Reuso de operação','89999999-0000-4000-8000-000000000213')$$,'P0001','OPERACAO_ID_EM_USO','operação associada não pode abrir outro pedido');
SELECT is((public.abrir_solicitacao_pedido('89999999-0000-4000-8000-000000000102','cancelamento','Outra necessidade','89999999-0000-4000-8000-000000000208')).estado,'aberta','novo caso após negativa pode ser analisado');
SELECT is((public.abrir_solicitacao_pedido('89999999-0000-4000-8000-000000000102','cancelamento','Envio duplicado','89999999-0000-4000-8000-000000000215')).id::text,(SELECT id::text FROM public.solicitacoes_pedido WHERE operacao_id='89999999-0000-4000-8000-000000000208'),'segunda operação do caso novo fica associada');
RESET ROLE;
UPDATE public.pedidos SET aceito_em=now()-interval '2 hours',tempo_estimado_min=10 WHERE id='89999999-0000-4000-8000-000000000102';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','89999999-0000-4000-8000-000000000001',true);
SELECT is((public.abrir_solicitacao_pedido('89999999-0000-4000-8000-000000000102','atraso','Também atrasou','89999999-0000-4000-8000-000000000214')).estado,'aberta','caso relacionado aberto para testar fechamento');
SELECT set_config('request.jwt.claim.sub','89999999-0000-4000-8000-000000000003',true);
SELECT is((public.decidir_solicitacao_pedido((SELECT id FROM public.solicitacoes_pedido WHERE operacao_id='89999999-0000-4000-8000-000000000208'),true,'Cancelar e devolver',NULL,NULL,'89999999-0000-4000-8000-000000000209')).estado,'aprovada','Admin aprova cancelamento justificado');
SELECT is((SELECT d.origem_decisao_id::text FROM public.decisoes_solicitacao d JOIN public.solicitacoes_pedido s ON s.id=d.solicitacao_id WHERE s.operacao_id='89999999-0000-4000-8000-000000000214'),(SELECT id::text FROM public.decisoes_solicitacao WHERE operacao_id='89999999-0000-4000-8000-000000000209'),'fechamento relacionado possui histórico imutável vinculado');
SELECT set_config('request.jwt.claim.sub','89999999-0000-4000-8000-000000000001',true);
SELECT is((public.abrir_solicitacao_pedido('89999999-0000-4000-8000-000000000102','cancelamento','Retry terminal','89999999-0000-4000-8000-000000000215')).estado,'aprovada','retry após terminal retorna caso original');
SELECT set_config('request.jwt.claim.sub','89999999-0000-4000-8000-000000000003',true);
SELECT lives_ok($$SELECT public.forcar_cancelamento_pedido('89999999-0000-4000-8000-000000000105','Pedido não pago')$$,'Admin pode encerrar pedido sem pagamento');
SELECT set_config('request.jwt.claim.sub','89999999-0000-4000-8000-000000000002',true);
SELECT throws_ok($$SELECT public.avancar_estado_pedido('89999999-0000-4000-8000-000000000102','entregue')$$,'P0001','TRANSICAO_INVALIDA','avanço genérico não entrega sem PIN');
SELECT lives_ok($$UPDATE public.pedidos SET status='entregue' WHERE id='89999999-0000-4000-8000-000000000107'$$,'update direto não pode entregar pedido');
RESET ROLE;
SELECT is((SELECT status FROM public.pedidos WHERE id='89999999-0000-4000-8000-000000000101'),'cancelado','pré-aceite termina cancelado');
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE pedido_id='89999999-0000-4000-8000-000000000101' AND tipo='refund' AND valor_centavos=-1790),1,'cancelamento pago reserva reembolso integral');
SELECT is((SELECT estado FROM public.solicitacoes_pedido WHERE operacao_id='89999999-0000-4000-8000-000000000205'),'encerrada_por_pin','PIN encerra solicitação na mesma transação');
SELECT is((SELECT evento FROM public.decisoes_solicitacao WHERE solicitacao_id=(SELECT id FROM public.solicitacoes_pedido WHERE operacao_id='89999999-0000-4000-8000-000000000205')),'pin','fechamento por PIN possui histórico imutável');
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE pedido_id='89999999-0000-4000-8000-000000000103' AND tipo='merchant_credit'),1,'PIN vencedor gera um crédito');
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE pedido_id='89999999-0000-4000-8000-000000000101' AND tipo='merchant_credit'),0,'cancelamento vencedor não gera crédito');
SELECT is((SELECT status FROM public.pedidos WHERE id='89999999-0000-4000-8000-000000000102'),'cancelado_admin','decisão vencedora torna pedido terminal');
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE pedido_id='89999999-0000-4000-8000-000000000102' AND tipo='refund' AND valor_centavos=-1790),1,'decisão reserva reembolso integral uma vez');
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE pedido_id='89999999-0000-4000-8000-000000000105' AND tipo='refund'),0,'forçar cancelamento sem pagamento não reserva dinheiro');
SELECT is((SELECT status FROM public.pedidos WHERE id='89999999-0000-4000-8000-000000000106'),'no_hub','ausência do cliente não conclui o pedido durante análise');
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE pedido_id='89999999-0000-4000-8000-000000000106' AND tipo='refund'),0,'ausência do cliente aberta não reserva reembolso');
SELECT is((SELECT status FROM public.pedidos WHERE id='89999999-0000-4000-8000-000000000107'),'no_hub','ausência reportada não muda estado operacional');
SELECT is((SELECT status FROM public.pedidos WHERE id='89999999-0000-4000-8000-000000000108'),'em_preparo','atraso reportado não muda estado operacional');
SELECT is((SELECT count(*)::integer FROM public.lancamentos_financeiros WHERE pedido_id IN ('89999999-0000-4000-8000-000000000107','89999999-0000-4000-8000-000000000108') AND tipo='refund'),0,'ocorrências abertas não reservam reembolso');
SELECT is((SELECT estado FROM public.solicitacoes_pedido WHERE operacao_id='89999999-0000-4000-8000-000000000210'),'encerrada_por_pin','fluxo completo encerra caso pelo PIN');
SELECT * FROM finish();
ROLLBACK;
