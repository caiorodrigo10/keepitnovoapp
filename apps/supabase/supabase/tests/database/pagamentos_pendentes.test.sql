BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT has_function('public','criar_pedido_cotado',ARRAY['uuid','text','boolean','uuid'],'criação autoritativa');
INSERT INTO auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
SELECT ('44444444-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated',
 'taxas-'||n||'@example.invalid','{}',CASE WHEN n IN (3,4) THEN '{"role":"lojista"}'::jsonb ELSE '{"nome":"Cliente teste"}'::jsonb END
FROM generate_series(1,5) n;
INSERT INTO public.admin_users (id,nome) VALUES ('44444444-0000-4000-8000-000000000005','Admin teste');
INSERT INTO public.hubs (id,nome,endereco,lat,lng) VALUES ('44444444-0000-4000-8000-000000000010','Hub teste','Endereço',0,0);
INSERT INTO public.hubs_horarios (hub_id,dia_semana,aberto,hora_abre,hora_fecha)
SELECT '44444444-0000-4000-8000-000000000010',n,true,'00:00','24:00' FROM generate_series(0,6) n;
INSERT INTO public.estabelecimentos (id,dono_user_id,nome_fantasia,cnpj,responsavel_nome,telefone,categoria,endereco,tempo_medio_entrega_min,taxa_deslocamento_reais,ticket_minimo_reais,chave_pix,chave_pix_tipo,status)
SELECT ('44444444-0000-4000-8000-00000000002'||n)::uuid,('44444444-0000-4000-8000-00000000000'||(n+2))::uuid,
 'Loja teste','4444444433333'||n,'Teste','00000000000','farmacia','Endereço',10,5,20,'teste@example.invalid','email','ativo' FROM generate_series(1,2) n;
INSERT INTO public.estabelecimentos_horarios (estabelecimento_id,dia_semana,aberto,hora_abre,hora_fecha)
SELECT '44444444-0000-4000-8000-000000000021',n,true,'00:00','24:00' FROM generate_series(0,6) n;
INSERT INTO public.estabelecimentos_hubs (estabelecimento_id,hub_id) VALUES ('44444444-0000-4000-8000-000000000021','44444444-0000-4000-8000-000000000010');
INSERT INTO public.produtos (id,estabelecimento_id,nome,preco_reais,categoria_produto) VALUES
 ('44444444-0000-4000-8000-000000000031','44444444-0000-4000-8000-000000000021','Produto real',100,'cuidados'),
 ('44444444-0000-4000-8000-000000000032','44444444-0000-4000-8000-000000000022','Outra loja',100,'cuidados');
CREATE FUNCTION pg_temp.cotar(itens jsonb DEFAULT '[{"produtoId":"44444444-0000-4000-8000-000000000031","quantidade":1}]') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.cotar_pedido('44444444-0000-4000-8000-000000000021','44444444-0000-4000-8000-000000000010',itens)
$$;
CREATE FUNCTION pg_temp.criar(operacao uuid DEFAULT '44444444-0000-4000-8000-000000000060', forma text DEFAULT 'pix') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.criar_pedido_cotado(current_setting('test.cotacao')::uuid,forma,false,operacao)
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-0000-4000-8000-000000000001',true);
SELECT set_config('test.cotacao',pg_temp.cotar()->>'id',true);
SELECT set_config('test.pedido',pg_temp.criar()->>'pedidoId',true);
SELECT is(pg_temp.criar()->>'pedidoId',current_setting('test.pedido'),'mesma operação retorna mesmo pedido');
SELECT throws_ok($$SELECT pg_temp.criar('44444444-0000-4000-8000-000000000060','cartao')$$,'P0001','OPERACAO_CONFLITANTE','operação não muda método');
SELECT throws_ok($$SELECT public.obter_pin_cliente(current_setting('test.pedido')::uuid)$$,'P0001','ACESSO_NEGADO','cliente não recebe PIN pendente');
SELECT set_config('request.jwt.claim.sub','44444444-0000-4000-8000-000000000003',true);
SELECT throws_ok($$SELECT public.aceitar_pedido(current_setting('test.pedido')::uuid,10)$$,'P0001',NULL,'lojista não aceita pendente');
SELECT throws_ok($$SELECT public.confirmar_pin_pedido(current_setting('test.pedido')::uuid,'1234')$$,'P0001',NULL,'lojista não confirma PIN pendente');
RESET ROLE;
SELECT is((SELECT status FROM public.pedidos WHERE id=current_setting('test.pedido')::uuid),'aguardando_pagamento','pedido nasce pendente');
SELECT ok((SELECT pago_em IS NULL FROM public.pedidos WHERE id=current_setting('test.pedido')::uuid),'pedido não tem pagamento simulado');
SELECT is((SELECT count(*)::int FROM public.lancamentos_financeiros WHERE pedido_id=current_setting('test.pedido')::uuid),0,'sem ledger financeiro antes do pagamento');
SELECT is((SELECT total_pago_reais FROM public.pedidos WHERE id=current_setting('test.pedido')::uuid),107.90::numeric,'total é snapshot do servidor');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-0000-4000-8000-000000000001',true);
SELECT set_config('test.cotacao',pg_temp.cotar()->>'id',true);
RESET ROLE;
UPDATE public.produtos SET preco_reais=101 WHERE id='44444444-0000-4000-8000-000000000031';
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.criar('44444444-0000-4000-8000-000000000061')$$,'P0001','COTACAO_DESATUALIZADA','mudança de catálogo exige revisão');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.pedidos WHERE cliente_id='44444444-0000-4000-8000-000000000001'),1,'cotação desatualizada sem pedido parcial');
SET LOCAL ROLE authenticated;
SELECT set_config('test.tentativa',public.reservar_tentativa_pagamento(current_setting('test.pedido')::uuid,'pix','44444444-0000-4000-8000-000000000070')->>'id',true);
SELECT is(public.reservar_tentativa_pagamento(current_setting('test.pedido')::uuid,'pix','44444444-0000-4000-8000-000000000070')->>'id',current_setting('test.tentativa'),'reserva idempotente');
SELECT throws_ok($$SELECT public.reservar_tentativa_pagamento(current_setting('test.pedido')::uuid,'cartao','44444444-0000-4000-8000-000000000071')$$,'P0001','TENTATIVA_EM_ANDAMENTO','troca de método bloqueada antes de encerramento');
SELECT throws_ok($$SELECT public.criar_pedido('44444444-0000-4000-8000-000000000021','44444444-0000-4000-8000-000000000010','[]',1,1,1,1,1,false)$$,'P0001','CHECKOUT_COTACAO_OBRIGATORIA','RPC legada não confia em valores do app');
SELECT set_config('request.jwt.claim.sub','44444444-0000-4000-8000-000000000002',true);
SELECT throws_ok($$SELECT public.reservar_tentativa_pagamento(current_setting('test.pedido')::uuid,'pix',gen_random_uuid())$$,'P0001','ACESSO_NEGADO','outro cliente não reserva');
SELECT throws_ok($$SELECT public.consultar_tentativa_pagamento(current_setting('test.pedido')::uuid)$$,'P0001','ACESSO_NEGADO','outro cliente não consulta');
SELECT throws_ok($$SELECT public.claim_tentativa_pagamento(current_setting('test.tentativa')::uuid)$$,'42501',NULL,'cliente não obtém claim privilegiado');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('test.claim',public.claim_tentativa_pagamento(current_setting('test.tentativa')::uuid)::text,true);
SELECT is(current_setting('test.claim')::jsonb->>'acquired','true','claim inicial exclusivo');
SELECT is(public.claim_tentativa_pagamento(current_setting('test.tentativa')::uuid)->>'acquired','false','segundo claim não cria novamente');
RESET ROLE;
UPDATE public.tentativas_pagamento SET claim_expira_em=now()-interval '1 second' WHERE id=current_setting('test.tentativa')::uuid;
SET LOCAL ROLE service_role;
SELECT is(public.claim_tentativa_pagamento(current_setting('test.tentativa')::uuid)->'attempt'->>'estado','reconciliacao','lease expirado exige conciliação');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-0000-4000-8000-000000000001',true);
SELECT throws_ok($$SELECT public.reservar_tentativa_pagamento(current_setting('test.pedido')::uuid,'cartao',gen_random_uuid())$$,'P0001','TENTATIVA_EM_ANDAMENTO','conciliação mantém bloqueio da troca');
RESET ROLE;
-- Resposta Asaas sintética no limite do servidor; encerramento passa pelas RPCs reais.
SET LOCAL ROLE authenticated;
SELECT set_config('test.close_op',gen_random_uuid()::text,true);
SELECT public.preparar_encerramento_tentativa(current_setting('test.tentativa')::uuid,current_setting('test.close_op')::uuid);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('test.close_claim',public.claim_encerramento_tentativa(current_setting('test.tentativa')::uuid,current_setting('test.close_op')::uuid)::text,true);
SELECT public.concluir_encerramento_tentativa(current_setting('test.tentativa')::uuid,(current_setting('test.close_claim')::jsonb->>'claim_token')::uuid,
 jsonb_build_object('id','pay_closed_first','deleted',true,'status','PENDING','value',107.9,'billingType','PIX','externalReference',current_setting('test.tentativa')));
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.reservar_tentativa_pagamento(current_setting('test.pedido')::uuid,'cartao','44444444-0000-4000-8000-000000000071')$$,'método só muda após encerramento confirmado pelo servidor');
RESET ROLE;
SELECT is((SELECT forma_pagamento FROM public.pedidos WHERE id=current_setting('test.pedido')::uuid),'cartao','troca atômica com nova tentativa');
SET LOCAL ROLE authenticated;
SELECT set_config('test.cotacao',(SELECT cotacao_id::text FROM public.pedidos WHERE id=current_setting('test.pedido')::uuid),true);
SELECT is(pg_temp.criar()->>'pedidoId',current_setting('test.pedido'),'replay da criação mantém identidade após troca de método');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('test.cartao',public.consultar_tentativa_pagamento(current_setting('test.pedido')::uuid)->>'id',true);
SELECT ok(NOT (public.consultar_tentativa_pagamento(current_setting('test.pedido')::uuid) ?| ARRAY['claim_token','asaas_payment_id','cliente_id']),'projeção pública sem claim ou dados internos');
SELECT throws_ok('SELECT * FROM public.tentativas_pagamento','42501',NULL,'cliente não lê tabela interna de tentativas');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('test.cartao_claim',public.claim_tentativa_pagamento(current_setting('test.cartao')::uuid)::text,true);
SELECT throws_ok($$SELECT public.salvar_tentativa_pagamento(current_setting('test.cartao')::uuid,gen_random_uuid(),'{"estado":"pendente","asaas_payment_id":"pay_wrong"}')$$,'P0001','CLAIM_INVALIDO','token incorreto não grava efeito');
SELECT is(public.salvar_tentativa_pagamento(current_setting('test.cartao')::uuid,(current_setting('test.cartao_claim')::jsonb->'attempt'->>'claim_token')::uuid,
 '{"estado":"pendente","asaas_payment_id":"pay_durable"}')->>'asaas_payment_id','pay_durable','salva ID externo sem precisar de QR');
SELECT throws_ok($$SELECT public.salvar_tentativa_pagamento(current_setting('test.cartao')::uuid,(current_setting('test.cartao_claim')::jsonb->'attempt'->>'claim_token')::uuid,'{"estado":"recusado"}')$$,'P0001','TRANSICAO_INVALIDA','cobrança existente não vira recusa sem encerramento no gateway');
SELECT throws_ok($$SELECT public.salvar_tentativa_pagamento(current_setting('test.cartao')::uuid,(current_setting('test.cartao_claim')::jsonb->'attempt'->>'claim_token')::uuid,'{"asaas_payment_id":"pay_other"}')$$,'P0001','TRANSICAO_INVALIDA','ID externo não é substituído');
RESET ROLE;
SELECT is((SELECT asaas_payment_id FROM public.pedidos WHERE id=current_setting('test.pedido')::uuid),'pay_durable','leitor legado recebe vínculo externo');
SELECT ok((SELECT pago_em IS NULL FROM public.pedidos WHERE id=current_setting('test.pedido')::uuid),'cobrança criada não confirma pagamento');
-- Resposta Asaas sintética no limite do servidor; encerramento passa pelas RPCs reais.
SET LOCAL ROLE authenticated;
SELECT set_config('test.close_op',gen_random_uuid()::text,true);
SELECT public.preparar_encerramento_tentativa(current_setting('test.cartao')::uuid,current_setting('test.close_op')::uuid);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('test.close_claim',public.claim_encerramento_tentativa(current_setting('test.cartao')::uuid,current_setting('test.close_op')::uuid)::text,true);
SELECT public.concluir_encerramento_tentativa(current_setting('test.cartao')::uuid,(current_setting('test.close_claim')::jsonb->>'claim_token')::uuid,
 jsonb_build_object('id','pay_durable','deleted',true,'status','PENDING','value',107.9,'billingType','CREDIT_CARD','externalReference',current_setting('test.cartao')));
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.reservar_tentativa_pagamento(current_setting('test.pedido')::uuid,'cartao',gen_random_uuid())$$,'nova operação no mesmo método após encerramento confirmado');
RESET ROLE;
SELECT ok((SELECT asaas_payment_id IS NULL AND qr_code_pix IS NULL AND pix_copia_e_cola IS NULL FROM public.pedidos WHERE id=current_setting('test.pedido')::uuid),'nova reserva remove artefatos antigos inclusive sem troca de método');
SELECT * FROM finish();
ROLLBACK;
