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
SET LOCAL ROLE authenticated;
SELECT set_config('test.tentativa',public.reservar_tentativa_pagamento(current_setting('test.pedido')::uuid,'pix',gen_random_uuid())->>'id',true);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('test.create_claim',public.claim_tentativa_pagamento(current_setting('test.tentativa')::uuid)::text,true);
SELECT public.salvar_tentativa_pagamento(current_setting('test.tentativa')::uuid,(current_setting('test.create_claim')::jsonb->'attempt'->>'claim_token')::uuid,'{"estado":"pendente","asaas_payment_id":"pay_close"}');
RESET ROLE;
SELECT has_function('public','preparar_encerramento_tentativa',ARRAY['uuid','uuid'],'encerramento autenticado disponível');
SET LOCAL ROLE authenticated;
SELECT set_config('test.close_op',gen_random_uuid()::text,true);
SELECT lives_ok($$SELECT public.preparar_encerramento_tentativa(current_setting('test.tentativa')::uuid,current_setting('test.close_op')::uuid)$$,'dono solicita encerramento');
SELECT throws_ok($$SELECT public.reservar_tentativa_pagamento(current_setting('test.pedido')::uuid,'cartao',gen_random_uuid())$$,'P0001','TENTATIVA_EM_ANDAMENTO','solicitação ainda não libera troca');
SELECT throws_ok($$SELECT public.concluir_encerramento_tentativa(current_setting('test.tentativa')::uuid,gen_random_uuid(),'{}')$$,'42501',NULL,'cliente não confirma gateway');
SELECT set_config('request.jwt.claim.sub','44444444-0000-4000-8000-000000000002',true);
SELECT throws_ok($$SELECT public.preparar_encerramento_tentativa(current_setting('test.tentativa')::uuid,gen_random_uuid())$$,'P0001','ACESSO_NEGADO','outro cliente não encerra');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('test.close_claim',public.claim_encerramento_tentativa(current_setting('test.tentativa')::uuid,current_setting('test.close_op')::uuid)::text,true);
SELECT is(current_setting('test.close_claim')::jsonb->>'acquired','true','claim de encerramento exclusivo');
SELECT is(public.claim_encerramento_tentativa(current_setting('test.tentativa')::uuid,current_setting('test.close_op')::uuid)->>'acquired','false','segundo worker não exclui em paralelo');
SELECT throws_ok($$SELECT public.salvar_tentativa_pagamento(current_setting('test.tentativa')::uuid,(current_setting('test.create_claim')::jsonb->'attempt'->>'claim_token')::uuid,'{"estado":"pendente"}')$$,'P0001','CLAIM_INVALIDO','worker de criação anterior perde permissão de salvar');
SELECT set_config('test.proof',jsonb_build_object('id','pay_close','externalReference',current_setting('test.tentativa'),'deleted',true,'value',107.9,'status','PENDING','billingType','PIX')::text,true);
SELECT throws_ok($$SELECT public.concluir_encerramento_tentativa(current_setting('test.tentativa')::uuid,(current_setting('test.close_claim')::jsonb->>'claim_token')::uuid,current_setting('test.proof')::jsonb||'{"deleted":false}')$$,'P0001','ENCERRAMENTO_NAO_CONFIRMADO','resposta sem exclusão não libera');
SELECT throws_ok($$SELECT public.concluir_encerramento_tentativa(current_setting('test.tentativa')::uuid,(current_setting('test.close_claim')::jsonb->>'claim_token')::uuid,current_setting('test.proof')::jsonb||'{"value":1}')$$,'P0001','ENCERRAMENTO_NAO_CONFIRMADO','valor divergente não libera');
SELECT throws_ok($$SELECT public.concluir_encerramento_tentativa(current_setting('test.tentativa')::uuid,(current_setting('test.close_claim')::jsonb->>'claim_token')::uuid,current_setting('test.proof')::jsonb||'{"status":"RECEIVED"}')$$,'P0001','ENCERRAMENTO_NAO_CONFIRMADO','pagamento recebido não libera');
SELECT public.registrar_incerteza_encerramento(current_setting('test.tentativa')::uuid,(current_setting('test.close_claim')::jsonb->>'claim_token')::uuid);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-0000-4000-8000-000000000001',true);
SELECT throws_ok($$SELECT public.reservar_tentativa_pagamento(current_setting('test.pedido')::uuid,'cartao',gen_random_uuid())$$,'P0001','TENTATIVA_EM_ANDAMENTO','falha ou timeout mantém bloqueio');
SELECT throws_ok($$SELECT public.preparar_encerramento_tentativa(current_setting('test.tentativa')::uuid,gen_random_uuid())$$,'P0001','OPERACAO_CONFLITANTE','retry exige mesma operação');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('test.close_claim2',public.claim_encerramento_tentativa(current_setting('test.tentativa')::uuid,current_setting('test.close_op')::uuid)::text,true);
SELECT isnt(current_setting('test.close_claim2')::jsonb->>'claim_token',current_setting('test.close_claim')::jsonb->>'claim_token','nova consulta invalida conclusão atrasada');
SELECT throws_ok($$SELECT public.concluir_encerramento_tentativa(current_setting('test.tentativa')::uuid,(current_setting('test.close_claim')::jsonb->>'claim_token')::uuid,current_setting('test.proof')::jsonb)$$,'P0001','CLAIM_INVALIDO','worker antigo não conclui');
SELECT is(public.concluir_encerramento_tentativa(current_setting('test.tentativa')::uuid,(current_setting('test.close_claim2')::jsonb->>'claim_token')::uuid,current_setting('test.proof')::jsonb)->>'estado','expirado','confirmação real persistida encerra');
SELECT is(public.concluir_encerramento_tentativa(current_setting('test.tentativa')::uuid,(current_setting('test.close_claim2')::jsonb->>'claim_token')::uuid,current_setting('test.proof')::jsonb)->>'estado','expirado','confirmação idempotente');
RESET ROLE;
SELECT ok((SELECT encerramento_confirmacao->>'id'='pay_close' AND encerrada_em IS NOT NULL FROM public.tentativas_pagamento WHERE id=current_setting('test.tentativa')::uuid),'evidência mínima durável');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.reservar_tentativa_pagamento(current_setting('test.pedido')::uuid,'cartao',gen_random_uuid())$$,'troca só é liberada depois de persistir confirmação');
SELECT is(public.preparar_encerramento_tentativa(current_setting('test.tentativa')::uuid,current_setting('test.close_op')::uuid)->>'estado','expirado','replay de encerramento não afeta nova tentativa');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.lancamentos_financeiros WHERE pedido_id=current_setting('test.pedido')::uuid),0,'encerramento não confirma pagamento nem gera ledger');
SELECT * FROM finish();
ROLLBACK;
