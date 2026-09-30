CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

INSERT INTO auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES
  ('77777777-0000-4000-8000-000000000001','authenticated','authenticated','cliente-corrida@example.invalid','{}','{"nome":"Cliente"}'),
  ('77777777-0000-4000-8000-000000000002','authenticated','authenticated','lojista-corrida@example.invalid','{}','{"role":"lojista"}');
INSERT INTO public.hubs (id,nome,endereco,lat,lng)
VALUES ('77777777-0000-4000-8000-000000000010','Hub Corrida','Endereço',0,0);
INSERT INTO public.estabelecimentos (
  id,dono_user_id,nome_fantasia,cnpj,responsavel_nome,telefone,categoria,endereco,
  tempo_medio_entrega_min,taxa_deslocamento_reais,ticket_minimo_reais,chave_pix,chave_pix_tipo,status
) VALUES (
  '77777777-0000-4000-8000-000000000020','77777777-0000-4000-8000-000000000002',
  'Loja Corrida','77777777000100','Responsável','11999999999','farmacia','Endereço',
  10,5,20,'corrida@example.invalid','email','ativo'
);
INSERT INTO public.pedidos (
  id,cliente_id,estabelecimento_id,hub_id,status,subtotal_produtos_reais,
  taxa_deslocamento_reais,taxa_keepit_reais,taxa_servico_comprador_reais,total_pago_reais,forma_pagamento
) VALUES (
  '77777777-0000-4000-8000-000000000101','77777777-0000-4000-8000-000000000001',
  '77777777-0000-4000-8000-000000000020','77777777-0000-4000-8000-000000000010',
  'aguardando_pagamento',100,5,10,2.90,107.90,'cartao'
), (
  '77777777-0000-4000-8000-000000000102','77777777-0000-4000-8000-000000000001',
  '77777777-0000-4000-8000-000000000020','77777777-0000-4000-8000-000000000010',
  'aguardando_pagamento',100,5,10,2.90,107.90,'cartao'
);
INSERT INTO public.tentativas_pagamento (
  id,pedido_id,cliente_id,operacao_id,forma,estado,asaas_payment_id
) VALUES (
  '77777777-0000-4000-8000-000000000201','77777777-0000-4000-8000-000000000101',
  '77777777-0000-4000-8000-000000000001','77777777-0000-4000-8000-000000000301',
  'cartao','pendente','pay-concorrente'
);

INSERT INTO public.tentativas_pagamento (
  id,pedido_id,cliente_id,operacao_id,forma,estado,asaas_payment_id,encerrada_em
) VALUES (
  '77777777-0000-4000-8000-000000000202','77777777-0000-4000-8000-000000000102',
  '77777777-0000-4000-8000-000000000001','77777777-0000-4000-8000-000000000302',
  'cartao','expirado','pay-a-tardio',now()
), (
  '77777777-0000-4000-8000-000000000203','77777777-0000-4000-8000-000000000102',
  '77777777-0000-4000-8000-000000000001','77777777-0000-4000-8000-000000000303',
  'cartao','criando',NULL,NULL
);

CREATE OR REPLACE FUNCTION public.test_processar_evento_com_pausa(
  p_evento_id text,p_cobranca_id text,p_referencia text,p_pausa double precision
)
RETURNS TABLE(resultado text,pedido_id uuid)
LANGUAGE plpgsql
SET search_path=''
AS $$
BEGIN
  RETURN QUERY SELECT processado.resultado,processado.pedido_id
  FROM public.processar_evento_pagamento(
    p_evento_id,'PAYMENT_CONFIRMED',p_cobranca_id,p_referencia,10790,'cartao'
  ) processado;
  PERFORM pg_catalog.pg_sleep(p_pausa);
END;
$$;

SELECT set_config(
  'test.claim_b_concorrente',
  public.claim_tentativa_pagamento('77777777-0000-4000-8000-000000000203')->'attempt'->>'claim_token',
  false
);

SELECT plan(20);
SELECT is(extensions.dblink_connect('evento_worker_1',format(
  'hostaddr=%s port=%s dbname=%I user=postgres password=postgres',inet_server_addr(),inet_server_port(),current_database()
)),'OK','abre primeira transação independente');
SELECT is(extensions.dblink_connect('evento_worker_2',format(
  'hostaddr=%s port=%s dbname=%I user=postgres password=postgres',inet_server_addr(),inet_server_port(),current_database()
)),'OK','abre segunda transação independente');
SELECT is(extensions.dblink_send_query('evento_worker_1',$sql$
  SELECT resultado,pedido_id FROM public.test_processar_evento_com_pausa(
    'evt-concorrente','pay-concorrente','77777777-0000-4000-8000-000000000201',0.6
  )
$sql$),1,'primeira entrega inicia sem aguardar resultado');
SELECT pg_catalog.pg_sleep(0.1);
SELECT is(extensions.dblink_send_query('evento_worker_2',$sql$
  SELECT resultado,pedido_id FROM public.processar_evento_pagamento(
    'evt-concorrente','PAYMENT_CONFIRMED','pay-concorrente',
    '77777777-0000-4000-8000-000000000201',10790,'cartao'
  )
$sql$),1,'segunda entrega concorrente inicia');
SELECT is(extensions.dblink_is_busy('evento_worker_2'),1,'replay realmente sobrepõe a transação que detém o lock');
SELECT is((SELECT resultado FROM extensions.dblink_get_result('evento_worker_1') AS t(resultado text,pedido_id uuid)),'confirmado','primeira entrega confirma');
SELECT is((SELECT resultado FROM extensions.dblink_get_result('evento_worker_2') AS t(resultado text,pedido_id uuid)),'confirmado','replay concorrente devolve o resultado persistido');
SELECT count(*) FROM extensions.dblink_get_result('evento_worker_1') AS t(resultado text,pedido_id uuid);
SELECT count(*) FROM extensions.dblink_get_result('evento_worker_2') AS t(resultado text,pedido_id uuid);
SELECT is((SELECT count(*)::int FROM public.eventos_pagamento WHERE evento_externo_id='evt-concorrente'),1,'duas transações criam um recibo');
SELECT is((SELECT count(*)::int FROM public.lancamentos_financeiros WHERE pedido_id='77777777-0000-4000-8000-000000000101' AND tipo='charge'),1,'duas transações criam um único charge');

SELECT is(extensions.dblink_send_query('evento_worker_1',$sql$
  SELECT resultado,pedido_id FROM public.test_processar_evento_com_pausa(
    'evt-a-tardio','pay-a-tardio','77777777-0000-4000-8000-000000000202',0.6
  )
$sql$),1,'confirmação A tardia inicia e segura o pedido');
SELECT pg_catalog.pg_sleep(0.1);
SELECT is(extensions.dblink_send_query('evento_worker_2',format($sql$
  SELECT public.salvar_tentativa_pagamento(
    '77777777-0000-4000-8000-000000000203',%L::uuid,
    '{"estado":"pendente","asaas_payment_id":"pay-b-concorrente"}'::jsonb
  )
$sql$,current_setting('test.claim_b_concorrente'))),1,'worker B tenta salvar enquanto A mantém o lock');
SELECT is(extensions.dblink_is_busy('evento_worker_2'),1,'save B realmente espera a confirmação A');
SELECT is((SELECT resultado FROM extensions.dblink_get_result('evento_worker_1') AS t(resultado text,pedido_id uuid)),'confirmado','A confirma antes de liberar o lock');
SELECT is((SELECT payload->>'estado' FROM extensions.dblink_get_result('evento_worker_2') AS t(payload jsonb)),'reconciliacao','save B obsoleto retorna reconciliação');
SELECT is((SELECT asaas_payment_id FROM public.pedidos WHERE id='77777777-0000-4000-8000-000000000102'),'pay-a-tardio','corrida mantém cobrança A no pedido');
SELECT is((SELECT asaas_payment_id FROM public.tentativas_pagamento WHERE id='77777777-0000-4000-8000-000000000203'),'pay-b-concorrente','corrida preserva ID B na tentativa');
SELECT is((SELECT estado FROM public.tentativas_pagamento WHERE id='77777777-0000-4000-8000-000000000203'),'reconciliacao','corrida mantém B na fila Admin');
SELECT is(
  (SELECT resultado FROM public.processar_evento_pagamento(
    'evt-b-confirmado','PAYMENT_CONFIRMED','pay-b-concorrente','77777777-0000-4000-8000-000000000203',10790,'cartao'
  )),
  'pagamento_adicional','confirmação B concorrente vira ocorrência adicional'
);
SELECT is((SELECT count(*)::int FROM public.ocorrencias_pagamento WHERE tentativa_id='77777777-0000-4000-8000-000000000203' AND tipo='pagamento_adicional'),1,'corrida registra uma ocorrência B');
SELECT is((SELECT count(*)::int FROM public.lancamentos_financeiros WHERE pedido_id='77777777-0000-4000-8000-000000000102' AND tipo='charge'),1,'corrida A/B mantém um charge');
SELECT extensions.dblink_disconnect('evento_worker_1');
SELECT extensions.dblink_disconnect('evento_worker_2');

SELECT * FROM finish();

DROP FUNCTION public.test_processar_evento_com_pausa(text,text,text,double precision);
DELETE FROM public.ocorrencias_pagamento WHERE pedido_id IN ('77777777-0000-4000-8000-000000000101','77777777-0000-4000-8000-000000000102');
DELETE FROM public.lancamentos_financeiros WHERE pedido_id IN ('77777777-0000-4000-8000-000000000101','77777777-0000-4000-8000-000000000102');
DELETE FROM public.eventos_pagamento WHERE pedido_id IN ('77777777-0000-4000-8000-000000000101','77777777-0000-4000-8000-000000000102');
DELETE FROM public.tentativas_pagamento WHERE pedido_id IN ('77777777-0000-4000-8000-000000000101','77777777-0000-4000-8000-000000000102');
DELETE FROM public.pedidos WHERE id IN ('77777777-0000-4000-8000-000000000101','77777777-0000-4000-8000-000000000102');
DELETE FROM public.estabelecimentos WHERE id='77777777-0000-4000-8000-000000000020';
DELETE FROM public.hubs WHERE id='77777777-0000-4000-8000-000000000010';
DELETE FROM auth.users WHERE id IN (
  '77777777-0000-4000-8000-000000000001','77777777-0000-4000-8000-000000000002'
);
