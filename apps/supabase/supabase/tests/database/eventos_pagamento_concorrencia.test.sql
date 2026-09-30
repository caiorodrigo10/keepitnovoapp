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
INSERT INTO private.cotacoes (
  id,cliente_id,estabelecimento_id,hub_id,itens,taxas,subtotal_centavos,
  frete_centavos,comissao_centavos,total_centavos,liquido_lojista_centavos
) VALUES (
  '77777777-0000-4000-8000-000000000401','77777777-0000-4000-8000-000000000001',
  '77777777-0000-4000-8000-000000000020','77777777-0000-4000-8000-000000000010',
  '[]','{}',10000,500,1000,10790,9500
);
INSERT INTO public.pedidos (
  id,cliente_id,estabelecimento_id,hub_id,status,subtotal_produtos_reais,
  taxa_deslocamento_reais,taxa_keepit_reais,taxa_servico_comprador_reais,total_pago_reais,forma_pagamento,cotacao_id
) VALUES (
  '77777777-0000-4000-8000-000000000101','77777777-0000-4000-8000-000000000001',
  '77777777-0000-4000-8000-000000000020','77777777-0000-4000-8000-000000000010',
  'aguardando_pagamento',100,5,10,2.90,107.90,'cartao',NULL
), (
  '77777777-0000-4000-8000-000000000102','77777777-0000-4000-8000-000000000001',
  '77777777-0000-4000-8000-000000000020','77777777-0000-4000-8000-000000000010',
  'aguardando_pagamento',100,5,10,2.90,107.90,'cartao',NULL
), (
  '77777777-0000-4000-8000-000000000103','77777777-0000-4000-8000-000000000001',
  '77777777-0000-4000-8000-000000000020','77777777-0000-4000-8000-000000000010',
  'aguardando_pagamento',100,5,10,2.90,107.90,'cartao','77777777-0000-4000-8000-000000000401'
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
), (
  '77777777-0000-4000-8000-000000000204','77777777-0000-4000-8000-000000000103',
  '77777777-0000-4000-8000-000000000001','77777777-0000-4000-8000-000000000304',
  'cartao','expirado','pay-a-reserva',now()
);

CREATE OR REPLACE FUNCTION public.test_aguardar_bloqueio(
  p_bloqueado integer,p_bloqueador integer
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path=''
AS $$
DECLARE
  v_limite timestamptz := pg_catalog.clock_timestamp()+interval '5 seconds';
BEGIN
  LOOP
    IF p_bloqueador=ANY(pg_catalog.pg_blocking_pids(p_bloqueado)) THEN
      RETURN true;
    END IF;
    IF pg_catalog.clock_timestamp()>=v_limite THEN
      RETURN false;
    END IF;
    PERFORM pg_catalog.pg_sleep(0.01);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.test_processar_evento_ate_barreira(
  p_evento_id text,p_cobranca_id text,p_referencia text,p_barreira bigint
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
  PERFORM pg_catalog.pg_advisory_lock(p_barreira);
  PERFORM pg_catalog.pg_advisory_unlock(p_barreira);
END;
$$;

CREATE OR REPLACE FUNCTION public.test_reservar_ate_barreira(
  p_pedido_id uuid,p_cliente_id uuid,p_operacao_id uuid,p_barreira bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path=''
AS $$
DECLARE
  v_reserva jsonb;
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',p_cliente_id::text,true);
  v_reserva:=public.reservar_tentativa_pagamento(p_pedido_id,'cartao',p_operacao_id);
  PERFORM pg_catalog.pg_advisory_lock(p_barreira);
  PERFORM pg_catalog.pg_advisory_unlock(p_barreira);
  RETURN v_reserva;
END;
$$;

CREATE OR REPLACE FUNCTION public.test_resultado_claim(p_tentativa_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path=''
AS $$
BEGIN
  PERFORM public.claim_tentativa_pagamento(p_tentativa_id);
  RETURN 'claim_adquirido';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END;
$$;

SELECT set_config(
  'test.claim_b_concorrente',
  public.claim_tentativa_pagamento('77777777-0000-4000-8000-000000000203')->'attempt'->>'claim_token',
  false
);

SELECT plan(34);
SELECT is(extensions.dblink_connect('evento_worker_1',format(
  'hostaddr=%s port=%s dbname=%I user=postgres password=postgres',inet_server_addr(),inet_server_port(),current_database()
)),'OK','abre primeira transação independente');
SELECT is(extensions.dblink_connect('evento_worker_2',format(
  'hostaddr=%s port=%s dbname=%I user=postgres password=postgres',inet_server_addr(),inet_server_port(),current_database()
)),'OK','abre segunda transação independente');
SELECT is(extensions.dblink_connect('evento_worker_3',format(
  'hostaddr=%s port=%s dbname=%I user=postgres password=postgres',inet_server_addr(),inet_server_port(),current_database()
)),'OK','abre terceira transação independente');
SELECT set_config('test.worker_1_pid',(SELECT pid::text FROM extensions.dblink(
  'evento_worker_1','SELECT pg_backend_pid()'
) AS t(pid integer)),false);
SELECT set_config('test.worker_2_pid',(SELECT pid::text FROM extensions.dblink(
  'evento_worker_2','SELECT pg_backend_pid()'
) AS t(pid integer)),false);
SELECT set_config('test.worker_3_pid',(SELECT pid::text FROM extensions.dblink(
  'evento_worker_3','SELECT pg_backend_pid()'
) AS t(pid integer)),false);

-- Replay: a primeira entrega alcança uma barreira somente depois de processar e
-- manter o lock do recibo; a segunda precisa então apontar a primeira como blocker.
SELECT pg_catalog.pg_advisory_lock(777001);
SELECT is(extensions.dblink_send_query('evento_worker_1',$sql$
  SELECT resultado,pedido_id FROM public.test_processar_evento_ate_barreira(
    'evt-concorrente','pay-concorrente','77777777-0000-4000-8000-000000000201',777001
  )
$sql$),1,'primeira entrega inicia sem aguardar resultado');
SELECT ok(public.test_aguardar_bloqueio(
  current_setting('test.worker_1_pid')::integer,pg_backend_pid()
),'primeira entrega alcança a barreira mantendo seus locks');
SELECT is(extensions.dblink_send_query('evento_worker_2',$sql$
  SELECT resultado,pedido_id FROM public.processar_evento_pagamento(
    'evt-concorrente','PAYMENT_CONFIRMED','pay-concorrente',
    '77777777-0000-4000-8000-000000000201',10790,'cartao'
  )
$sql$),1,'segunda entrega concorrente inicia');
SELECT ok(public.test_aguardar_bloqueio(
  current_setting('test.worker_2_pid')::integer,current_setting('test.worker_1_pid')::integer
),'pg_blocking_pids prova que o replay aguarda a primeira entrega');
SELECT pg_catalog.pg_advisory_unlock(777001);
SELECT is((SELECT resultado FROM extensions.dblink_get_result('evento_worker_1') AS t(resultado text,pedido_id uuid)),'confirmado','primeira entrega confirma');
SELECT is((SELECT resultado FROM extensions.dblink_get_result('evento_worker_2') AS t(resultado text,pedido_id uuid)),'confirmado','replay concorrente devolve o resultado persistido');
SELECT count(*) FROM extensions.dblink_get_result('evento_worker_1') AS t(resultado text,pedido_id uuid);
SELECT count(*) FROM extensions.dblink_get_result('evento_worker_2') AS t(resultado text,pedido_id uuid);
SELECT is((SELECT count(*)::int FROM public.eventos_pagamento WHERE evento_externo_id='evt-concorrente'),1,'duas transações criam um recibo');
SELECT is((SELECT count(*)::int FROM public.lancamentos_financeiros WHERE pedido_id='77777777-0000-4000-8000-000000000101' AND tipo='charge'),1,'duas transações criam um único charge');

-- Reserva B conclui enquanto segura o pedido; a confirmação A aguarda a
-- reserva. Depois A mantém o pedido até que o claim B também seja observado
-- em pg_blocking_pids e, ao acordar, recusa criar cobrança para pedido pago.
SELECT pg_catalog.pg_advisory_lock(777002);
SELECT pg_catalog.pg_advisory_lock(777003);
SELECT is(extensions.dblink_send_query('evento_worker_1',$sql$
  SELECT public.test_reservar_ate_barreira(
    '77777777-0000-4000-8000-000000000103',
    '77777777-0000-4000-8000-000000000001',
    '77777777-0000-4000-8000-000000000305',777002
  )
$sql$),1,'reserva B inicia em transação independente');
SELECT ok(public.test_aguardar_bloqueio(
  current_setting('test.worker_1_pid')::integer,pg_backend_pid()
),'reserva B alcança a barreira mantendo o lock do pedido');
SELECT is(extensions.dblink_send_query('evento_worker_2',$sql$
  SELECT resultado,pedido_id FROM public.test_processar_evento_ate_barreira(
    'evt-a-reserva','pay-a-reserva','77777777-0000-4000-8000-000000000204',777003
  )
$sql$),1,'confirmação A inicia durante a reserva B');
SELECT ok(public.test_aguardar_bloqueio(
  current_setting('test.worker_2_pid')::integer,current_setting('test.worker_1_pid')::integer
),'pg_blocking_pids prova que confirmação A aguarda a reserva B');
SELECT pg_catalog.pg_advisory_unlock(777002);
SELECT set_config('test.tentativa_b_reservada',(
  SELECT payload->>'id' FROM extensions.dblink_get_result('evento_worker_1') AS t(payload jsonb)
),false);
SELECT count(*) FROM extensions.dblink_get_result('evento_worker_1') AS t(payload jsonb);
SELECT ok(public.test_aguardar_bloqueio(
  current_setting('test.worker_2_pid')::integer,pg_backend_pid()
),'confirmação A processa e alcança sua barreira mantendo o pedido');
SELECT is(extensions.dblink_send_query('evento_worker_3',format($sql$
  SELECT public.test_resultado_claim(%L::uuid)
$sql$,current_setting('test.tentativa_b_reservada'))),1,'claim B inicia durante confirmação A');
SELECT ok(public.test_aguardar_bloqueio(
  current_setting('test.worker_3_pid')::integer,current_setting('test.worker_2_pid')::integer
),'pg_blocking_pids prova que claim B aguarda confirmação A');
SELECT pg_catalog.pg_advisory_unlock(777003);
SELECT is((SELECT resultado FROM extensions.dblink_get_result('evento_worker_2') AS t(resultado text,pedido_id uuid)),'confirmado','A confirma depois da reserva concorrente');
SELECT is((SELECT resultado FROM extensions.dblink_get_result('evento_worker_3') AS t(resultado text)),'PEDIDO_NAO_PAGAVEL','claim B acorda sem criar cobrança após confirmação A');
SELECT count(*) FROM extensions.dblink_get_result('evento_worker_2') AS t(resultado text,pedido_id uuid);
SELECT count(*) FROM extensions.dblink_get_result('evento_worker_3') AS t(resultado text);
SELECT is((SELECT estado FROM public.tentativas_pagamento WHERE id=current_setting('test.tentativa_b_reservada')::uuid),'reconciliacao','B reservada permanece visível para reconciliação');
SELECT is((SELECT asaas_payment_id FROM public.pedidos WHERE id='77777777-0000-4000-8000-000000000103'),'pay-a-reserva','pedido mantém A após reserva e claim concorrentes');

-- Save B contra confirmação A: A atinge a barreira já segurando o pedido e o
-- save com claim anterior precisa apontar A como blocker antes de continuar.
SELECT pg_catalog.pg_advisory_lock(777004);
SELECT is(extensions.dblink_send_query('evento_worker_1',$sql$
  SELECT resultado,pedido_id FROM public.test_processar_evento_ate_barreira(
    'evt-a-tardio','pay-a-tardio','77777777-0000-4000-8000-000000000202',777004
  )
$sql$),1,'confirmação A tardia inicia e segura o pedido');
SELECT ok(public.test_aguardar_bloqueio(
  current_setting('test.worker_1_pid')::integer,pg_backend_pid()
),'confirmação A alcança a barreira mantendo o lock do pedido');
SELECT is(extensions.dblink_send_query('evento_worker_2',format($sql$
  SELECT public.salvar_tentativa_pagamento(
    '77777777-0000-4000-8000-000000000203',%L::uuid,
    '{"estado":"pendente","asaas_payment_id":"pay-b-concorrente"}'::jsonb
  )
$sql$,current_setting('test.claim_b_concorrente'))),1,'worker B tenta salvar enquanto A mantém o lock');
SELECT ok(public.test_aguardar_bloqueio(
  current_setting('test.worker_2_pid')::integer,current_setting('test.worker_1_pid')::integer
),'pg_blocking_pids prova que save B aguarda confirmação A');
SELECT pg_catalog.pg_advisory_unlock(777004);
SELECT is((SELECT resultado FROM extensions.dblink_get_result('evento_worker_1') AS t(resultado text,pedido_id uuid)),'confirmado','A confirma antes de liberar o lock');
SELECT is((SELECT payload->>'estado' FROM extensions.dblink_get_result('evento_worker_2') AS t(payload jsonb)),'reconciliacao','save B obsoleto retorna reconciliação');
SELECT count(*) FROM extensions.dblink_get_result('evento_worker_1') AS t(resultado text,pedido_id uuid);
SELECT count(*) FROM extensions.dblink_get_result('evento_worker_2') AS t(payload jsonb);
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
SELECT extensions.dblink_disconnect('evento_worker_3');

SELECT * FROM finish();

DROP FUNCTION public.test_resultado_claim(uuid);
DROP FUNCTION public.test_reservar_ate_barreira(uuid,uuid,uuid,bigint);
DROP FUNCTION public.test_processar_evento_ate_barreira(text,text,text,bigint);
DROP FUNCTION public.test_aguardar_bloqueio(integer,integer);
DELETE FROM public.ocorrencias_pagamento WHERE pedido_id IN ('77777777-0000-4000-8000-000000000101','77777777-0000-4000-8000-000000000102','77777777-0000-4000-8000-000000000103');
DELETE FROM public.lancamentos_financeiros WHERE pedido_id IN ('77777777-0000-4000-8000-000000000101','77777777-0000-4000-8000-000000000102','77777777-0000-4000-8000-000000000103');
DELETE FROM public.eventos_pagamento WHERE pedido_id IN ('77777777-0000-4000-8000-000000000101','77777777-0000-4000-8000-000000000102','77777777-0000-4000-8000-000000000103');
DELETE FROM public.tentativas_pagamento WHERE pedido_id IN ('77777777-0000-4000-8000-000000000101','77777777-0000-4000-8000-000000000102','77777777-0000-4000-8000-000000000103');
DELETE FROM public.pedidos WHERE id IN ('77777777-0000-4000-8000-000000000101','77777777-0000-4000-8000-000000000102','77777777-0000-4000-8000-000000000103');
DELETE FROM private.cotacoes WHERE id='77777777-0000-4000-8000-000000000401';
DELETE FROM public.estabelecimentos WHERE id='77777777-0000-4000-8000-000000000020';
DELETE FROM public.hubs WHERE id='77777777-0000-4000-8000-000000000010';
DELETE FROM auth.users WHERE id IN (
  '77777777-0000-4000-8000-000000000001','77777777-0000-4000-8000-000000000002'
);
