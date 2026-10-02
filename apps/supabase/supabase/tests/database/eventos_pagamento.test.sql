BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT has_table('public', 'eventos_pagamento', 'recibos duráveis de webhook existem');
SELECT has_table('public', 'ocorrencias_pagamento', 'chargeback/estorno usam ocorrências auditáveis');
SELECT has_table('public', 'decisoes_chargeback', 'resoluções administrativas de chargeback são auditáveis');
SELECT has_table('public', 'antecipacoes_recebiveis', 'antecipações têm registro administrativo próprio');
SELECT index_is_unique('public','eventos_pagamento','eventos_pagamento_evento_externo_id_key','unicidade serializa entregas concorrentes do mesmo evento');
SELECT index_is_unique(
  'public','ocorrencias_pagamento','ocorrencia_chargeback_unica_por_tentativa',
  'unicidade financeira serializa as fases do chargeback pela cobrança'
);
SELECT has_function(
  'public', 'processar_evento_pagamento',
  ARRAY['text','text','text','text','bigint','text'],
  'processador transacional de pagamentos existe'
);
SELECT has_function(
  'public', 'vincular_cobranca_reconciliacao', ARRAY['uuid','text'],
  'reconciliação possui vínculo explícito e transacional da cobrança'
);
SELECT has_function(
  'public', 'resolver_chargeback_admin', ARRAY['uuid','text','text','text','bigint','uuid'],
  'Admin resolve chargeback em uma única transação idempotente'
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
  taxa_deslocamento_reais,taxa_keepit_reais,taxa_servico_comprador_reais,total_pago_reais,forma_pagamento,pago_em,entregue_em
) VALUES
  ('66666666-0000-4000-8000-000000000101','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000020','66666666-0000-4000-8000-000000000010','aguardando_pagamento',100,5,10,2.90,107.90,'cartao',NULL,NULL),
  ('66666666-0000-4000-8000-000000000102','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000020','66666666-0000-4000-8000-000000000010','cancelado',100,5,10,2.90,107.90,'pix',NULL,NULL),
  ('66666666-0000-4000-8000-000000000103','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000020','66666666-0000-4000-8000-000000000010','entregue',100,5,10,2.90,107.90,'cartao',now(),'2026-09-22T12:00:00Z'),
  ('66666666-0000-4000-8000-000000000104','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000020','66666666-0000-4000-8000-000000000010','aguardando_pagamento',100,5,10,2.90,107.90,'pix',NULL,NULL),
  ('66666666-0000-4000-8000-000000000105','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000020','66666666-0000-4000-8000-000000000010','aguardando_pagamento',100,5,10,2.90,107.90,'cartao',NULL,NULL),
  ('66666666-0000-4000-8000-000000000106','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000020','66666666-0000-4000-8000-000000000010','aguardando_pagamento',100,5,10,2.90,107.90,'cartao',NULL,NULL),
  ('66666666-0000-4000-8000-000000000107','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000020','66666666-0000-4000-8000-000000000010','entregue',100,5,10,2.90,107.90,'cartao',now(),'2026-09-29T12:00:00Z'),
  ('66666666-0000-4000-8000-000000000108','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000020','66666666-0000-4000-8000-000000000010','entregue',100,5,10,2.90,107.90,'cartao',now(),'2026-09-29T13:00:00Z');

INSERT INTO public.tentativas_pagamento (id,pedido_id,cliente_id,operacao_id,forma,estado,asaas_payment_id,encerrada_em) VALUES
  ('66666666-0000-4000-8000-000000000201','66666666-0000-4000-8000-000000000101','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000301','cartao','pendente','pay-main',NULL),
  ('66666666-0000-4000-8000-000000000202','66666666-0000-4000-8000-000000000102','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000302','pix','pendente','pay-cancelado',NULL),
  ('66666666-0000-4000-8000-000000000203','66666666-0000-4000-8000-000000000103','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000303','cartao','recebido','pay-entregue',NULL),
  ('66666666-0000-4000-8000-000000000204','66666666-0000-4000-8000-000000000104','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000304','pix','reconciliacao','pay-overdue',NULL),
  ('66666666-0000-4000-8000-000000000205','66666666-0000-4000-8000-000000000105','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000305','cartao','expirado','pay-old-late',now()),
  ('66666666-0000-4000-8000-000000000206','66666666-0000-4000-8000-000000000105','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000306','cartao','criando',NULL,NULL),
  ('66666666-0000-4000-8000-000000000207','66666666-0000-4000-8000-000000000106','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000307','cartao','reconciliacao',NULL,NULL),
  ('66666666-0000-4000-8000-000000000208','66666666-0000-4000-8000-000000000107','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000308','cartao','recebido','pay-estornado',NULL),
  ('66666666-0000-4000-8000-000000000209','66666666-0000-4000-8000-000000000108','66666666-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000309','cartao','recebido','pay-keepit',NULL);

-- Crédito do pedido 103 já saiu em lote pago; qualquer ajuste posterior deve
-- permanecer no ledger para compensação futura, sem reescrever o snapshot.
INSERT INTO public.lancamentos_financeiros(
  estabelecimento_id,pedido_id,tipo,valor_centavos,status,detalhe
) VALUES (
  '66666666-0000-4000-8000-000000000020','66666666-0000-4000-8000-000000000103',
  'merchant_credit',9500,'concluido','Crédito líquido do pedido entregue'
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','66666666-0000-4000-8000-000000000003',true);
SELECT is(
  (SELECT count(*)::int FROM public.preparar_repasses_semanais('2026-09-21','66666666-0000-4000-8000-000000000401')),
  1,'crédito é materializado em lote antes do chargeback'
);
SELECT set_config('test.repasse_chargeback',(
  SELECT id::text FROM public.repasses
  WHERE estabelecimento_id='66666666-0000-4000-8000-000000000020' AND semana_inicio='2026-09-21'
),true);
SELECT is(
  (public.confirmar_repasse(
    current_setting('test.repasse_chargeback')::uuid,'pix-chargeback-001','banco:chargeback-001',
    '66666666-0000-4000-8000-000000000402'
  )).estado,
  'pago','repasse anterior é concluído antes da resolução'
);
RESET ROLE;

-- Pedido 107 já teve todo o crédito efetivo revertido por um estorno anterior.
INSERT INTO public.lancamentos_financeiros(
  estabelecimento_id,pedido_id,tipo,valor_centavos,status,detalhe
) VALUES (
  '66666666-0000-4000-8000-000000000020','66666666-0000-4000-8000-000000000107',
  'merchant_credit',9500,'concluido','Crédito líquido do pedido entregue'
);
WITH reembolso AS (
  INSERT INTO public.lancamentos_financeiros(
    estabelecimento_id,pedido_id,tipo,valor_centavos,status,detalhe,motivo_reembolso,responsavel_reembolso
  ) VALUES (
    '66666666-0000-4000-8000-000000000020','66666666-0000-4000-8000-000000000107',
    'refund',-9500,'concluido','Estorno anterior confirmado','pos_entrega','lojista'
  ) RETURNING id
)
INSERT INTO public.lancamentos_financeiros(
  estabelecimento_id,pedido_id,tipo,valor_centavos,status,detalhe,reembolso_origem_id
)
SELECT
  '66666666-0000-4000-8000-000000000020','66666666-0000-4000-8000-000000000107',
  'merchant_credit',-9500,'concluido','Responsabilidade por devolução confirmada',id
FROM reembolso;
INSERT INTO public.lancamentos_financeiros(
  estabelecimento_id,pedido_id,tipo,valor_centavos,status,detalhe
) VALUES (
  '66666666-0000-4000-8000-000000000020','66666666-0000-4000-8000-000000000108',
  'merchant_credit',9500,'concluido','Crédito líquido do pedido entregue'
);

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
SELECT public.processar_evento_pagamento('evt-chargeback','PAYMENT_CHARGEBACK_REQUESTED','pay-entregue','66666666-0000-4000-8000-000000000203',10790,'cartao');
SELECT is((SELECT count(*)::int FROM public.ocorrencias_pagamento WHERE pedido_id='66666666-0000-4000-8000-000000000103' AND tipo='chargeback'),1,'chargeback cria ocorrência');
SELECT is((SELECT count(*)::int FROM public.lancamentos_financeiros WHERE pedido_id='66666666-0000-4000-8000-000000000103' AND tipo='merchant_credit' AND valor_centavos<0),0,'chargeback não presume débito do lojista');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','66666666-0000-4000-8000-000000000003',true);
SELECT set_config('test.ocorrencia_chargeback',(
  SELECT id::text FROM public.ocorrencias_pagamento
  WHERE pedido_id='66666666-0000-4000-8000-000000000103' AND tipo='chargeback'
),true);
SELECT is(
  (public.resolver_chargeback_admin(
    current_setting('test.ocorrencia_chargeback')::uuid,'lojista','Mercadoria não entregue',
    'protocolo-cb-001',10790,'66666666-0000-4000-8000-000000000403'
  )->>'principalDebitadoCentavos')::bigint,
  9500::bigint,'principal debitado é limitado ao crédito efetivo do lojista'
);
SELECT is(
  (SELECT taxa_centavos FROM public.decisoes_chargeback
   WHERE ocorrencia_id=current_setting('test.ocorrencia_chargeback')::uuid),
  4000::bigint,'taxa histórica de R$ 40 fica separada do principal'
);
SELECT is(
  (SELECT valor_centavos FROM public.lancamentos_financeiros
   WHERE id=(SELECT lancamento_id FROM public.decisoes_chargeback
     WHERE ocorrencia_id=current_setting('test.ocorrencia_chargeback')::uuid)),
  (-13500)::bigint,'resolução cria um único ajuste negativo pelo valor devido'
);
SELECT is(
  (SELECT estado FROM public.ocorrencias_pagamento
   WHERE id=current_setting('test.ocorrencia_chargeback')::uuid),
  'encerrada','ocorrência recebe desfecho administrativo explícito'
);
SELECT is(
  (SELECT estado FROM public.repasses WHERE id=current_setting('test.repasse_chargeback')::uuid),
  'pago','repasse concluído permanece imutável'
);
SELECT is(
  (SELECT valor_centavos FROM public.repasses WHERE id=current_setting('test.repasse_chargeback')::uuid),
  9500::bigint,'snapshot do repasse pago não é recalculado'
);
SELECT is(
  (SELECT count(*)::int FROM public.repasse_itens
   WHERE lancamento_id=(SELECT lancamento_id FROM public.decisoes_chargeback
     WHERE ocorrencia_id=current_setting('test.ocorrencia_chargeback')::uuid)),
  0,'ajuste posterior ao pagamento segue como saldo devedor para lote futuro'
);
SELECT lives_ok(
  $$SELECT public.resolver_chargeback_admin(
    current_setting('test.ocorrencia_chargeback')::uuid,'lojista','Mercadoria não entregue',
    'protocolo-cb-001',10790,'66666666-0000-4000-8000-000000000403'
  )$$,
  'retry da mesma operação administrativa é idempotente'
);
SELECT is(
  (SELECT count(*)::int FROM public.decisoes_chargeback
   WHERE ocorrencia_id=current_setting('test.ocorrencia_chargeback')::uuid),
  1,'retry não duplica decisão'
);
SELECT is(
  (SELECT count(*)::int FROM public.lancamentos_financeiros
   WHERE pedido_id='66666666-0000-4000-8000-000000000103' AND tipo='merchant_credit' AND valor_centavos<0),
  1,'retry não duplica débito'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.processar_evento_pagamento(
  'evt-chargeback-dispute','PAYMENT_CHARGEBACK_DISPUTE','pay-entregue',
  '66666666-0000-4000-8000-000000000203',10790,'cartao'
);
SELECT public.processar_evento_pagamento(
  'evt-chargeback-awaiting-reversal','PAYMENT_AWAITING_CHARGEBACK_REVERSAL','pay-entregue',
  '66666666-0000-4000-8000-000000000203',10790,'cartao'
);
SELECT is(
  (SELECT count(*)::int FROM public.eventos_pagamento
   WHERE cobranca_id='pay-entregue' AND tipo IN (
     'PAYMENT_CHARGEBACK_REQUESTED','PAYMENT_CHARGEBACK_DISPUTE','PAYMENT_AWAITING_CHARGEBACK_REVERSAL'
   )),
  3,'fases distintas do chargeback permanecem como recibos auditáveis'
);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','66666666-0000-4000-8000-000000000003',true);
DO $do$
DECLARE v_duplicada uuid;
BEGIN
  SELECT id INTO v_duplicada
  FROM public.ocorrencias_pagamento
  WHERE tentativa_id='66666666-0000-4000-8000-000000000203'
    AND tipo='chargeback'
    AND id<>current_setting('test.ocorrencia_chargeback')::uuid
  ORDER BY criado_em,id
  LIMIT 1;
  IF v_duplicada IS NOT NULL THEN
    PERFORM public.resolver_chargeback_admin(
      v_duplicada,'lojista','Fase posterior do mesmo chargeback',
      'protocolo-cb-fase-duplicada',10790,'66666666-0000-4000-8000-000000000407'
    );
  END IF;
END
$do$;
SELECT is(
  (SELECT count(*)::int FROM public.ocorrencias_pagamento
   WHERE tentativa_id='66666666-0000-4000-8000-000000000203' AND tipo='chargeback'),
  1,'fases distintas da mesma cobrança compartilham uma ocorrência de chargeback'
);
SELECT is(
  (SELECT count(*)::int FROM public.decisoes_chargeback dc
   JOIN public.ocorrencias_pagamento op ON op.id=dc.ocorrencia_id
   WHERE op.tentativa_id='66666666-0000-4000-8000-000000000203'),
  1,'uma cobrança admite uma única decisão de chargeback'
);
SELECT is(
  (SELECT sum(dc.taxa_centavos)::bigint FROM public.decisoes_chargeback dc
   JOIN public.ocorrencias_pagamento op ON op.id=dc.ocorrencia_id
   WHERE op.tentativa_id='66666666-0000-4000-8000-000000000203'),
  4000::bigint,'ciclo de chargeback da cobrança aplica R$ 40 somente uma vez'
);
SELECT is(
  (SELECT count(*)::int FROM public.lancamentos_financeiros
   WHERE pedido_id='66666666-0000-4000-8000-000000000103'
     AND tipo='merchant_credit' AND valor_centavos<0),
  1,'fases do mesmo chargeback não criam segundo ajuste negativo'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.processar_evento_pagamento(
  'evt-chargeback-estornado','PAYMENT_CHARGEBACK_REQUESTED','pay-estornado',
  '66666666-0000-4000-8000-000000000208',10790,'cartao'
);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','66666666-0000-4000-8000-000000000003',true);
SELECT set_config('test.ocorrencia_chargeback_estornado',(
  SELECT id::text FROM public.ocorrencias_pagamento
  WHERE pedido_id='66666666-0000-4000-8000-000000000107' AND tipo='chargeback'
),true);
SELECT public.resolver_chargeback_admin(
  current_setting('test.ocorrencia_chargeback_estornado')::uuid,'lojista','Chargeback após estorno',
  'protocolo-cb-002',10790,'66666666-0000-4000-8000-000000000404'
);
SELECT is(
  (SELECT principal_debitado_centavos FROM public.decisoes_chargeback
   WHERE ocorrencia_id=current_setting('test.ocorrencia_chargeback_estornado')::uuid),
  0::bigint,'estorno anterior impede débito repetido do principal'
);
SELECT is(
  (SELECT valor_centavos FROM public.lancamentos_financeiros
   WHERE id=(SELECT lancamento_id FROM public.decisoes_chargeback
     WHERE ocorrencia_id=current_setting('test.ocorrencia_chargeback_estornado')::uuid)),
  (-4000)::bigint,'após principal já revertido somente a taxa histórica é aplicada'
);
SELECT is(
  (SELECT count(DISTINCT op.tentativa_id)::int FROM public.decisoes_chargeback dc
   JOIN public.ocorrencias_pagamento op ON op.id=dc.ocorrencia_id
   WHERE op.tentativa_id IN (
     '66666666-0000-4000-8000-000000000203','66666666-0000-4000-8000-000000000208'
   )),
  2,'pagamentos distintos preservam decisões de chargeback independentes'
);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.processar_evento_pagamento(
  'evt-chargeback-keepit','PAYMENT_CHARGEBACK_REQUESTED','pay-keepit',
  '66666666-0000-4000-8000-000000000209',10790,'cartao'
);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','66666666-0000-4000-8000-000000000003',true);
SELECT set_config('test.ocorrencia_chargeback_keepit',(
  SELECT id::text FROM public.ocorrencias_pagamento
  WHERE pedido_id='66666666-0000-4000-8000-000000000108' AND tipo='chargeback'
),true);
SELECT public.resolver_chargeback_admin(
  current_setting('test.ocorrencia_chargeback_keepit')::uuid,'keepit','Responsabilidade da plataforma',
  'protocolo-cb-003',10790,'66666666-0000-4000-8000-000000000406'
);
SELECT is(
  (SELECT principal_debitado_centavos FROM public.decisoes_chargeback
   WHERE ocorrencia_id=current_setting('test.ocorrencia_chargeback_keepit')::uuid),
  0::bigint,'principal não é debitado quando a responsabilidade é da Keepit'
);
SELECT is(
  (SELECT valor_centavos FROM public.lancamentos_financeiros
   WHERE id=(SELECT lancamento_id FROM public.decisoes_chargeback
     WHERE ocorrencia_id=current_setting('test.ocorrencia_chargeback_keepit')::uuid)),
  (-4000)::bigint,'taxa histórica também é aplicada quando a Keepit assume o principal'
);
SELECT set_config('request.jwt.claim.sub','66666666-0000-4000-8000-000000000001',true);
SELECT throws_ok(
  format($sql$SELECT public.resolver_chargeback_admin(
    %L::uuid,'lojista','Tentativa indevida','protocolo-invalido',100,
    '66666666-0000-4000-8000-000000000405'
  )$sql$,current_setting('test.ocorrencia_chargeback')),
  'P0001','ACESSO_NEGADO','cliente não pode decidir chargeback'
);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.processar_evento_pagamento('evt-refund','PAYMENT_REFUNDED','pay-entregue','66666666-0000-4000-8000-000000000203',10790,'cartao');
SELECT is((SELECT count(*)::int FROM public.ocorrencias_pagamento WHERE pedido_id='66666666-0000-4000-8000-000000000103' AND tipo='estorno'),1,'estorno fica correlacionável sem segundo débito');
SELECT is((SELECT status FROM public.pedidos WHERE id='66666666-0000-4000-8000-000000000103'),'entregue','chargeback/estorno não alteram entrega');
SELECT is(
  (SELECT resultado FROM public.processar_evento_pagamento('evt-desconhecido','FUTURE_FINANCIAL_EVENT',NULL,NULL,NULL,NULL)),
  'evento_desconhecido', 'evento desconhecido fica persistido para diagnóstico'
);

SELECT set_config(
  'test.claim_b',
  (public.claim_tentativa_pagamento('66666666-0000-4000-8000-000000000206')->'attempt'->>'claim_token'),
  true
);

SELECT is(
  (SELECT resultado FROM public.processar_evento_pagamento('evt-overdue','PAYMENT_OVERDUE','pay-overdue','66666666-0000-4000-8000-000000000204',10790,'pix')),
  'reconciliacao', 'OVERDUE isolado não confirma exclusão e mantém reconciliação'
);
SELECT is((SELECT estado FROM public.tentativas_pagamento WHERE id='66666666-0000-4000-8000-000000000204'),'reconciliacao','OVERDUE não libera nova cobrança');
SELECT is((SELECT encerrada_em IS NULL FROM public.tentativas_pagamento WHERE id='66666666-0000-4000-8000-000000000204'),true,'OVERDUE não encerra tentativa');

SELECT lives_ok(
  $$SELECT * FROM public.processar_evento_pagamento('evt-old-late','PAYMENT_CONFIRMED','pay-old-late','66666666-0000-4000-8000-000000000205',10790,'cartao')$$,
  'confirmação tardia não viola unicidade quando uma nova tentativa já está ativa'
);
SELECT is((SELECT estado FROM public.tentativas_pagamento WHERE id='66666666-0000-4000-8000-000000000205'),'confirmado','fato tardio fica registrado na tentativa original');
SELECT is((SELECT encerrada_em IS NOT NULL FROM public.tentativas_pagamento WHERE id='66666666-0000-4000-8000-000000000205'),true,'tentativa antiga permanece encerrada se há outra ativa');
SELECT is((SELECT estado FROM public.tentativas_pagamento WHERE id='66666666-0000-4000-8000-000000000206'),'reconciliacao','tentativa mais nova fica explícita para reconciliação após confirmação tardia');
SELECT lives_ok(
  $$SELECT public.salvar_tentativa_pagamento(
    '66666666-0000-4000-8000-000000000206',current_setting('test.claim_b')::uuid,
    '{"estado":"pendente","asaas_payment_id":"pay-new-active"}'::jsonb
  )$$,
  'worker B conclui salvamento obsoleto sem perder o ID externo para operação administrativa'
);
SELECT is((SELECT asaas_payment_id FROM public.pedidos WHERE id='66666666-0000-4000-8000-000000000105'),'pay-old-late','worker B não sobrescreve a cobrança confirmada A no pedido');
SELECT is((SELECT asaas_payment_id FROM public.tentativas_pagamento WHERE id='66666666-0000-4000-8000-000000000206'),'pay-new-active','ID externo B fica preservado na tentativa');
SELECT is((SELECT estado FROM public.tentativas_pagamento WHERE id='66666666-0000-4000-8000-000000000206'),'reconciliacao','salvamento B permanece na fila administrativa');
SELECT is((SELECT claim_token IS NULL FROM public.tentativas_pagamento WHERE id='66666666-0000-4000-8000-000000000206'),true,'claim B obsoleto é consumido e invalidado');
SELECT is(
  (SELECT resultado FROM public.processar_evento_pagamento('evt-new-pending','PAYMENT_UPDATED','pay-new-active','66666666-0000-4000-8000-000000000206',10790,'cartao')),
  'reconciliacao', 'PENDING de B não remove a divergência causada pela confirmação A'
);
SELECT is((SELECT estado FROM public.tentativas_pagamento WHERE id='66666666-0000-4000-8000-000000000206'),'reconciliacao','B continua visível para o Admin após PENDING');
SELECT is(
  (SELECT resultado FROM public.processar_evento_pagamento('evt-new-confirmed','PAYMENT_CONFIRMED','pay-new-active','66666666-0000-4000-8000-000000000206',10790,'cartao')),
  'pagamento_adicional', 'segunda cobrança confirmada vira ocorrência auditável'
);
SELECT is((SELECT count(*)::int FROM public.ocorrencias_pagamento WHERE tentativa_id='66666666-0000-4000-8000-000000000206' AND tipo='pagamento_adicional'),1,'pagamento B adicional cria uma ocorrência');
SELECT is((SELECT count(*)::int FROM public.lancamentos_financeiros WHERE pedido_id='66666666-0000-4000-8000-000000000105' AND tipo='charge'),1,'pagamentos A e B mantêm uma única receita/charge');
SELECT is((SELECT asaas_payment_id FROM public.pedidos WHERE id='66666666-0000-4000-8000-000000000105'),'pay-old-late','pagamento adicional B não oculta cobrança A do pedido');

SELECT is(
  (SELECT resultado FROM public.processar_evento_pagamento('evt-before-id','PAYMENT_CONFIRMED','pay-before-id','66666666-0000-4000-8000-000000000207',10790,'cartao')),
  'aguardando_vinculo', 'evento anterior à persistência do ID fica recuperável'
);
SELECT is((SELECT processado_em IS NULL FROM public.eventos_pagamento WHERE evento_externo_id='evt-before-id'),true,'recibo aguardando vínculo não é finalizado');
SELECT is(
  (SELECT resultado FROM public.processar_evento_antecipacao('evt-ant-retry','RECEIVABLE_ANTICIPATION_PENDING','ant-retry','pay-before-id','PENDING',10790,300,10490,NULL,NULL)),
  'aguardando_vinculo', 'antecipação antes do ID também aguarda vínculo'
);
SELECT is((SELECT erro_codigo FROM public.eventos_pagamento WHERE evento_externo_id='evt-ant-retry'),'COBRANCA_AGUARDANDO_VINCULO','primeira entrega registra erro operacional') ;
SELECT is(
  public.vincular_cobranca_reconciliacao('66666666-0000-4000-8000-000000000207','pay-before-id'),
  true, 'reconciliação vincula o ID localizado por referência'
);
SELECT is(
  (SELECT resultado FROM public.processar_evento_antecipacao('evt-ant-retry','RECEIVABLE_ANTICIPATION_PENDING','ant-retry','pay-before-id','PENDING',10790,300,10490,NULL,NULL)),
  'antecipacao_atualizada', 'reentrega da antecipação conclui após vínculo'
);
SELECT is((SELECT erro_codigo FROM public.eventos_pagamento WHERE evento_externo_id='evt-ant-retry'),NULL,'reentrega bem-sucedida limpa erro anterior');
SELECT is(
  (SELECT resultado FROM public.processar_evento_pagamento('evt-before-id','PAYMENT_CONFIRMED','pay-before-id','66666666-0000-4000-8000-000000000207',10790,'cartao')),
  'confirmado', 'replay do mesmo evento processa após o vínculo ser persistido'
);

SELECT is(
  (SELECT resultado FROM public.processar_evento_antecipacao('evt-ant-pendente','RECEIVABLE_ANTICIPATION_PENDING','ant-1','pay-main','PENDING',10790,300,10490,NULL,NULL)),
  'antecipacao_atualizada', 'antecipação pendente é visível mas não é caixa'
);
SELECT public.processar_evento_antecipacao('evt-ant-creditada','RECEIVABLE_ANTICIPATION_CREDITED','ant-1','pay-main','CREDITED',10790,300,10490,'2026-10-02',NULL);
SELECT public.processar_evento_antecipacao('evt-ant-pendente-tardio','RECEIVABLE_ANTICIPATION_PENDING','ant-1','pay-main','PENDING',9999,999,9000,NULL,NULL);
SELECT is((SELECT estado FROM public.antecipacoes_recebiveis WHERE antecipacao_externa_id='ant-1'),'CREDITED','evento pendente fora de ordem não rebaixa crédito');
SELECT is((SELECT valor_centavos FROM public.antecipacoes_recebiveis WHERE antecipacao_externa_id='ant-1'),10790::bigint,'evento fora de ordem preserva valor creditado');
SELECT is((SELECT tarifa_centavos FROM public.antecipacoes_recebiveis WHERE antecipacao_externa_id='ant-1'),300::bigint,'evento fora de ordem preserva tarifa creditada');
SELECT is((SELECT liquido_centavos FROM public.antecipacoes_recebiveis WHERE antecipacao_externa_id='ant-1'),10490::bigint,'evento fora de ordem preserva líquido creditado');
SELECT is((SELECT data_credito FROM public.antecipacoes_recebiveis WHERE antecipacao_externa_id='ant-1'),'2026-10-02'::date,'evento fora de ordem preserva data efetiva');
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
SELECT is((SELECT count(*)::int FROM public.decisoes_chargeback),0,'policy não expõe decisões de chargeback ao cliente');
SELECT throws_ok($$SELECT * FROM public.processar_evento_pagamento('x','PAYMENT_RECEIVED','pay-main',NULL,10790,'cartao')$$,'42501',NULL,'cliente não processa webhook');
SELECT set_config('request.jwt.claim.sub','66666666-0000-4000-8000-000000000003',true);
SELECT is((SELECT count(*)::int FROM public.tentativas_pagamento WHERE estado IN ('reconciliacao','recebido','confirmado')),9,'Admin lê tentativas para reconciliação');
SELECT is((SELECT count(*)::int FROM public.antecipacoes_recebiveis),3,'Admin lê custos e estados de antecipação');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
