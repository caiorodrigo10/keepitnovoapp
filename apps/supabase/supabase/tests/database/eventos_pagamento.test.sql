BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT has_table('public', 'eventos_pagamento', 'recibos duráveis de webhook existem');
SELECT has_table('public', 'ocorrencias_pagamento', 'chargeback/estorno usam ocorrências auditáveis');
SELECT has_table('public', 'antecipacoes_recebiveis', 'antecipações têm registro administrativo próprio');
SELECT index_is_unique('public','eventos_pagamento','eventos_pagamento_evento_externo_id_key','unicidade serializa entregas concorrentes do mesmo evento');
SELECT has_function(
  'public', 'processar_evento_pagamento',
  ARRAY['text','text','text','text','bigint','text'],
  'processador transacional de pagamentos existe'
);

INSERT INTO auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES
  ('66666666-0000-4000-8000-000000000001','authenticated','authenticated','cliente-eventos@example.invalid','{}','{"nome":"Cliente"}'),
  ('66666666-0000-4000-8000-000000000002','authenticated','authenticated','lojista-eventos@example.invalid','{}','{"role":"lojista"}'),
  ('66666666-0000-4000-8000-000000000003','authenticated','authenticated','admin-eventos@example.invalid','{}','{}');
INSERT INTO public.admin_users (id,nome) VALUES ('66666666-0000-4000-8000-000000000003','Admin Eventos');
INSERT INTO public.hubs (id,nome,endereco,lat,lng)
VALUES ('66666666-0000-4000-8000-000000000010','Hub Eventos','Endereço',0,0);
INSERT INTO public.estabelecimentos (
  id,dono_user_id,nome_fantasia,cnpj,responsavel_nome,telefone,categoria,endereco,
  tempo_medio_entrega_min,taxa_deslocamento_reais,ticket_minimo_reais,chave_pix,chave_pix_tipo,status
) VALUES (
  '66666666-0000-4000-8000-000000000020','66666666-0000-4000-8000-000000000002',
  'Loja Eventos','66666666000100','Responsável','11999999999','farmacia','Endereço',
  10,5,20,'eventos@example.invalid','email','ativo'
);

INSERT INTO public.pedidos (
  id,cliente_id,estabelecimento_id,hub_id,status,subtotal_produtos_reais,
  taxa_deslocamento_reais,taxa_keepit_reais,taxa_servico_comprador_reais,total_pago_reais,forma_pagamento,pago_em
) VALUES
  ('66666666-0000-4000-8000-000000000101','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000020','66666666-0000-4000-8000-000000000010','aguardando_pagamento',100,5,10,2.90,107.90,'cartao',NULL),
  ('66666666-0000-4000-8000-000000000102','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000020','66666666-0000-4000-8000-000000000010','cancelado',100,5,10,2.90,107.90,'pix',NULL),
  ('66666666-0000-4000-8000-000000000103','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000020','66666666-0000-4000-8000-000000000010','entregue',100,5,10,2.90,107.90,'cartao',now());

INSERT INTO public.tentativas_pagamento (id,pedido_id,cliente_id,operacao_id,forma,estado,asaas_payment_id) VALUES
  ('66666666-0000-4000-8000-000000000201','66666666-0000-4000-8000-000000000101','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000301','cartao','pendente','pay-main'),
  ('66666666-0000-4000-8000-000000000202','66666666-0000-4000-8000-000000000102','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000302','pix','pendente','pay-cancelado'),
  ('66666666-0000-4000-8000-000000000203','66666666-0000-4000-8000-000000000103','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000303','cartao','recebido','pay-entregue');

SET LOCAL ROLE service_role;
SELECT is(
  (SELECT resultado FROM public.processar_evento_pagamento('evt-valor','PAYMENT_CONFIRMED','pay-main','66666666-0000-4000-8000-000000000201',1,'cartao')),
  'valor_divergente', 'valor divergente é auditado sem efeito financeiro'
);
SELECT is(
  (SELECT resultado FROM public.processar_evento_pagamento('evt-vinculo','PAYMENT_CONFIRMED','pay-main','66666666-0000-4000-8000-000000000202',10790,'cartao')),
  'referencia_divergente', 'ID externo conhecido nunca é combinado por OR com referência de outro pedido'
);
SELECT is(
  (SELECT resultado FROM public.processar_evento_pagamento('evt-metodo','PAYMENT_CONFIRMED','pay-main','66666666-0000-4000-8000-000000000201',10790,'pix')),
  'metodo_divergente', 'método divergente é auditado sem liberar pedido'
);
SELECT is(
  (SELECT resultado FROM public.processar_evento_pagamento('evt-confirmado','PAYMENT_CONFIRMED','pay-main','66666666-0000-4000-8000-000000000201',10790,'cartao')),
  'confirmado', 'confirmação válida libera o pedido'
);
SELECT is((SELECT status FROM public.pedidos WHERE id='66666666-0000-4000-8000-000000000101'),'aguardando_aceite','pedido confirmado aguarda aceite');
SELECT is((SELECT estado FROM public.tentativas_pagamento WHERE id='66666666-0000-4000-8000-000000000201'),'confirmado','tentativa distingue confirmação de recebimento');
SELECT is(
  (SELECT resultado FROM public.processar_evento_pagamento('evt-recebido','PAYMENT_RECEIVED','pay-main','66666666-0000-4000-8000-000000000201',10790,'cartao')),
  'recebido', 'recebimento posterior é registrado'
);
SELECT is((SELECT estado FROM public.tentativas_pagamento WHERE id='66666666-0000-4000-8000-000000000201'),'recebido','confirmado vira recebido');
SELECT is(
  (SELECT resultado FROM public.processar_evento_pagamento('evt-confirmado-tardio','PAYMENT_CONFIRMED','pay-main','66666666-0000-4000-8000-000000000201',10790,'cartao')),
  'confirmado', 'confirmação fora de ordem é aceita como fato'
);
SELECT is((SELECT estado FROM public.tentativas_pagamento WHERE id='66666666-0000-4000-8000-000000000201'),'recebido','confirmação tardia não rebaixa recebido');
SELECT is((SELECT count(*)::int FROM public.lancamentos_financeiros WHERE pedido_id='66666666-0000-4000-8000-000000000101' AND tipo='charge'),1,'eventos financeiros não duplicam charge');
SELECT is(
  (SELECT resultado FROM public.processar_evento_pagamento('evt-recebido','PAYMENT_RECEIVED','pay-main','66666666-0000-4000-8000-000000000201',10790,'cartao')),
  'recebido', 'replay do mesmo evento devolve resultado anterior'
);
SELECT is((SELECT count(*)::int FROM public.eventos_pagamento WHERE evento_externo_id='evt-recebido'),1,'id externo único deduplica a entrega');

SELECT is(
  (SELECT resultado FROM public.processar_evento_pagamento('evt-cancelado','PAYMENT_RECEIVED','pay-cancelado','66666666-0000-4000-8000-000000000202',10790,'pix')),
  'pagamento_tardio', 'pagamento após cancelamento vira pendência de devolução'
);
SELECT is((SELECT status FROM public.pedidos WHERE id='66666666-0000-4000-8000-000000000102'),'cancelado','pagamento tardio não reabre pedido cancelado');
SELECT is((SELECT count(*)::int FROM public.ocorrencias_pagamento WHERE pedido_id='66666666-0000-4000-8000-000000000102' AND tipo='pagamento_tardio'),1,'devolução pendente fica auditável');

SELECT is(
  (SELECT resultado FROM public.processar_evento_pagamento('evt-entregue','PAYMENT_CONFIRMED','pay-entregue','66666666-0000-4000-8000-000000000203',10790,'cartao')),
  'confirmado', 'evento fora de ordem em entrega concluída preserva o fato financeiro'
);
SELECT is((SELECT status FROM public.pedidos WHERE id='66666666-0000-4000-8000-000000000103'),'entregue','webhook nunca reabre pedido entregue');
SELECT public.processar_evento_pagamento('evt-chargeback','PAYMENT_CHARGEBACK_REQUESTED','pay-entregue','66666666-0000-4000-8000-000000000203',10790,'cartao');
SELECT is((SELECT count(*)::int FROM public.ocorrencias_pagamento WHERE pedido_id='66666666-0000-4000-8000-000000000103' AND tipo='chargeback'),1,'chargeback cria ocorrência');
SELECT is((SELECT count(*)::int FROM public.lancamentos_financeiros WHERE pedido_id='66666666-0000-4000-8000-000000000103' AND tipo='merchant_credit' AND valor_centavos<0),0,'chargeback não presume débito do lojista');
SELECT public.processar_evento_pagamento('evt-refund','PAYMENT_REFUNDED','pay-entregue','66666666-0000-4000-8000-000000000203',10790,'cartao');
SELECT is((SELECT count(*)::int FROM public.ocorrencias_pagamento WHERE pedido_id='66666666-0000-4000-8000-000000000103' AND tipo='estorno'),1,'estorno fica correlacionável sem segundo débito');
SELECT is((SELECT status FROM public.pedidos WHERE id='66666666-0000-4000-8000-000000000103'),'entregue','chargeback/estorno não alteram entrega');
SELECT is(
  (SELECT resultado FROM public.processar_evento_pagamento('evt-desconhecido','FUTURE_FINANCIAL_EVENT',NULL,NULL,NULL,NULL)),
  'evento_desconhecido', 'evento desconhecido fica persistido para diagnóstico'
);

SELECT is(
  (SELECT resultado FROM public.processar_evento_antecipacao('evt-ant-pendente','RECEIVABLE_ANTICIPATION_PENDING','ant-1','pay-main','PENDING',10790,300,10490,NULL,NULL)),
  'antecipacao_atualizada', 'antecipação pendente é visível mas não é caixa'
);
SELECT public.processar_evento_antecipacao('evt-ant-creditada','RECEIVABLE_ANTICIPATION_CREDITED','ant-1','pay-main','CREDITED',10790,300,10490,'2026-10-02',NULL);
SELECT public.processar_evento_antecipacao('evt-ant-pendente-tardio','RECEIVABLE_ANTICIPATION_PENDING','ant-1','pay-main','PENDING',10790,300,10490,NULL,NULL);
SELECT is((SELECT estado FROM public.antecipacoes_recebiveis WHERE antecipacao_externa_id='ant-1'),'CREDITED','evento pendente fora de ordem não rebaixa crédito');
SELECT is((SELECT count(*)::int FROM public.lancamentos_financeiros WHERE asaas_id_externo='ant-1'),0,'antecipação nunca cria crédito de lojista nem receita duplicada');
SELECT public.processar_evento_antecipacao('evt-ant-negada','RECEIVABLE_ANTICIPATION_DENIED','ant-2','pay-main','DENIED',10790,0,10790,NULL,'limite indisponível');
SELECT is((SELECT estado FROM public.antecipacoes_recebiveis WHERE antecipacao_externa_id='ant-2'),'DENIED','antecipação negada é registrada');
SELECT is(
  (SELECT resultado FROM public.processar_evento_antecipacao('evt-ant-negada','RECEIVABLE_ANTICIPATION_DENIED','ant-2','pay-main','DENIED',10790,0,10790,NULL,'limite indisponível')),
  'antecipacao_atualizada', 'replay de antecipação devolve resultado persistido'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','66666666-0000-4000-8000-000000000001',true);
SELECT is((SELECT count(*)::int FROM public.eventos_pagamento),0,'policy filtra todos os recibos para cliente');
SELECT throws_ok($$SELECT * FROM public.processar_evento_pagamento('x','PAYMENT_RECEIVED','pay-main',NULL,10790,'cartao')$$,'42501',NULL,'cliente não processa webhook');
SELECT set_config('request.jwt.claim.sub','66666666-0000-4000-8000-000000000003',true);
SELECT is((SELECT count(*)::int FROM public.tentativas_pagamento WHERE estado IN ('reconciliacao','recebido','confirmado')),3,'Admin lê tentativas para reconciliação');
SELECT is((SELECT count(*)::int FROM public.antecipacoes_recebiveis),2,'Admin lê custos e estados de antecipação');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
