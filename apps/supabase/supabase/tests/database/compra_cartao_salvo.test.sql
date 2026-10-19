BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES
  ('86666666-0000-4000-8000-000000000001','authenticated','authenticated','card-save@example.invalid','{"nome":"Cliente cartão"}'),
  ('86666666-0000-4000-8000-000000000002','authenticated','authenticated','card-store@example.invalid','{"role":"lojista"}');
UPDATE public.clientes SET cpf='12345678901' WHERE id='86666666-0000-4000-8000-000000000001';
INSERT INTO public.hubs(id,nome,endereco,lat,lng) VALUES ('86666666-0000-4000-8000-000000000010','Hub cartão','Endereço',0,0);
INSERT INTO public.hubs_horarios(hub_id,dia_semana,aberto,hora_abre,hora_fecha)
SELECT '86666666-0000-4000-8000-000000000010',n,true,'00:00','24:00' FROM generate_series(0,6) n;
INSERT INTO public.estabelecimentos(id,dono_user_id,nome_fantasia,cnpj,responsavel_nome,telefone,categoria,endereco,tempo_medio_entrega_min,taxa_deslocamento_reais,ticket_minimo_reais,chave_pix,chave_pix_tipo,status)
VALUES ('86666666-0000-4000-8000-000000000020','86666666-0000-4000-8000-000000000002','Loja cartão','12345678000199','Teste','11999999999','farmacia','Endereço',10,0,1,'card@example.invalid','email','ativo');
INSERT INTO public.estabelecimentos_horarios(estabelecimento_id,dia_semana,aberto,hora_abre,hora_fecha)
SELECT '86666666-0000-4000-8000-000000000020',n,true,'00:00','24:00' FROM generate_series(0,6) n;
INSERT INTO public.estabelecimentos_hubs(estabelecimento_id,hub_id) VALUES ('86666666-0000-4000-8000-000000000020','86666666-0000-4000-8000-000000000010');
INSERT INTO public.produtos(id,estabelecimento_id,nome,preco_reais,categoria_produto)
VALUES ('86666666-0000-4000-8000-000000000030','86666666-0000-4000-8000-000000000020','Produto cartão',10,'cuidados');

CREATE FUNCTION pg_temp.novo_pedido(p_operacao uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_cotacao uuid; v_pedido uuid;
BEGIN
  v_cotacao := (public.cotar_pedido('86666666-0000-4000-8000-000000000020','86666666-0000-4000-8000-000000000010','[{"produtoId":"86666666-0000-4000-8000-000000000030","quantidade":1}]') ->> 'id')::uuid;
  v_pedido := (public.criar_pedido_cotado(v_cotacao,'cartao',false,p_operacao)->>'pedidoId')::uuid;
  RETURN v_pedido;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','86666666-0000-4000-8000-000000000001',true);
SELECT set_config('test.pedido',pg_temp.novo_pedido('86666666-0000-4000-8000-000000000040')::text,true);
SELECT set_config('test.tentativa',(public.reservar_tentativa_pagamento(current_setting('test.pedido')::uuid,'cartao','86666666-0000-4000-8000-000000000041')->>'id'),true);
RESET ROLE;
SET LOCAL ROLE service_role;
INSERT INTO private.clientes_asaas(cliente_id,ambiente,asaas_customer_id,estado)
VALUES ('86666666-0000-4000-8000-000000000001','sandbox','cus_save_test','pronto');
SELECT public.registrar_operacao_cartao_service('86666666-0000-4000-8000-000000000001',current_setting('test.tentativa')::uuid,'86666666-0000-4000-8000-000000000042','compra','sandbox',true,NULL);
UPDATE public.tentativas_pagamento SET asaas_payment_id='pay_save_test',estado='pendente' WHERE id=current_setting('test.tentativa')::uuid;

SELECT has_function('public','marcar_cartao_nao_salvo_service',ARRAY['uuid'],'warning RPC is service-only');
SELECT has_function('public','marcar_resposta_cobranca_perdida_service',ARRAY['uuid'],'lost create responses get a durable server-only marker');
SELECT has_function('public','marcar_cartao_nao_salvo_reconciliacao_service',ARRAY['uuid'],'reconciliation can resolve a lost create response');
SELECT lives_ok($$SELECT public.salvar_token_operacao_service('86666666-0000-4000-8000-000000000042','cus_save_test','tok_save_test','VISA','4242')$$,'pending charge retains only temporary metadata');
SELECT is((SELECT count(*) FROM public.clientes_cartoes WHERE cliente_id='86666666-0000-4000-8000-000000000001'),0::bigint,'pending status does not expose a saved card');
UPDATE public.tentativas_pagamento SET estado='confirmado' WHERE id=current_setting('test.tentativa')::uuid;
SELECT is((SELECT count(*) FROM public.clientes_cartoes WHERE cliente_id='86666666-0000-4000-8000-000000000001'),1::bigint,'authoritative confirmation promotes exactly one saved card');
SELECT ok((SELECT token_temporario IS NULL AND estado='concluida' FROM private.cartoes_operacoes WHERE operacao_id='86666666-0000-4000-8000-000000000042'),'promotion clears temporary token and closes operation');
SELECT is(public.marcar_cartao_nao_salvo_service('86666666-0000-4000-8000-000000000042')->>'avisoCodigo',NULL,'lost response after saved metadata never creates a false warning');
SELECT is((SELECT aviso_cartao FROM public.tentativas_pagamento WHERE id=current_setting('test.tentativa')::uuid),NULL,'saved card leaves no warning on attempt');
SELECT set_config('test.cartao_salvo',(SELECT id::text FROM public.clientes_cartoes WHERE cliente_id='86666666-0000-4000-8000-000000000001'),true);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','86666666-0000-4000-8000-000000000001',true);
SELECT set_config('test.pedido_salvo',pg_temp.novo_pedido('86666666-0000-4000-8000-000000000070')::text,true);
SELECT set_config('test.tentativa_salva',(public.reservar_tentativa_pagamento(current_setting('test.pedido_salvo')::uuid,'cartao','86666666-0000-4000-8000-000000000071')->>'id'),true);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT public.registrar_operacao_cartao_service('86666666-0000-4000-8000-000000000001',current_setting('test.tentativa_salva')::uuid,'86666666-0000-4000-8000-000000000072','compra','sandbox',false,current_setting('test.cartao_salvo')::uuid)$$,'owner binds the saved-card choice to the purchase operation');
SELECT ok((public.obter_cartao_operacao_service('86666666-0000-4000-8000-000000000001',current_setting('test.cartao_salvo')::uuid,'sandbox')->>'customerId')='cus_save_test','server resolves the customer only after owner and environment validation');
SELECT throws_ok($$SELECT public.registrar_operacao_cartao_service('86666666-0000-4000-8000-000000000001',current_setting('test.tentativa_salva')::uuid,'86666666-0000-4000-8000-000000000072','compra','sandbox',false,NULL)$$,'P0001','OPERACAO_DIVERGENTE','replay cannot replace the saved card chosen by the original operation');
SELECT is(public.invalidar_cartao_operacao_service('86666666-0000-4000-8000-000000000001',current_setting('test.cartao_salvo')::uuid,'86666666-0000-4000-8000-000000000072')->>'estado','invalidada','confirmed invalid token removes only the frozen saved-card operation');
SELECT ok((SELECT estado='recusado' AND encerrada_em IS NOT NULL FROM public.tentativas_pagamento WHERE id=current_setting('test.tentativa_salva')::uuid),'token invalidation atomically leaves a terminal attempt for same-order recovery');
SELECT is(public.invalidar_cartao_operacao_service('86666666-0000-4000-8000-000000000001',current_setting('test.cartao_salvo')::uuid,'86666666-0000-4000-8000-000000000072')->>'estado','invalidada','invalidated purchase replays after its linked attempt is closed');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','86666666-0000-4000-8000-000000000001',true);
SELECT lives_ok($$SELECT public.reservar_tentativa_pagamento(current_setting('test.pedido_salvo')::uuid,'pix','86666666-0000-4000-8000-000000000073')$$,'terminal card refusal lets the reservation switch the same order to Pix');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT is((SELECT count(*) FROM public.clientes_cartoes WHERE id=current_setting('test.cartao_salvo')::uuid),0::bigint,'invalidated saved card is unavailable for a later payment');
DELETE FROM public.clientes_cartoes WHERE cliente_id='86666666-0000-4000-8000-000000000001';
SELECT public.salvar_token_operacao_service('86666666-0000-4000-8000-000000000042','cus_save_test','tok_save_test','VISA','4242');
SELECT is((SELECT count(*) FROM public.clientes_cartoes WHERE cliente_id='86666666-0000-4000-8000-000000000001'),0::bigint,'replay after removal never resurrects a card');

INSERT INTO public.clientes_cartoes(cliente_id,ambiente,asaas_customer_id,asaas_credit_card_token,bandeira,ultimo4)
VALUES('86666666-0000-4000-8000-000000000001','sandbox','cus_save_test','tok_saved_release','VISA','9999');
SELECT set_config('test.cartao_release',(SELECT id::text FROM public.clientes_cartoes WHERE asaas_credit_card_token='tok_saved_release'),true);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','86666666-0000-4000-8000-000000000001',true);
SELECT set_config('test.pedido_release',pg_temp.novo_pedido('86666666-0000-4000-8000-000000000074')::text,true);
SELECT set_config('test.tentativa_release',(public.reservar_tentativa_pagamento(current_setting('test.pedido_release')::uuid,'cartao','86666666-0000-4000-8000-000000000075')->>'id'),true);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.registrar_operacao_cartao_service('86666666-0000-4000-8000-000000000001',current_setting('test.tentativa_release')::uuid,'86666666-0000-4000-8000-000000000076','compra','sandbox',false,current_setting('test.cartao_release')::uuid);
SELECT public.obter_cartao_operacao_service('86666666-0000-4000-8000-000000000001',current_setting('test.cartao_release')::uuid,'sandbox');
UPDATE public.tentativas_pagamento SET asaas_payment_id='pay_saved_release',estado='confirmado' WHERE id=current_setting('test.tentativa_release')::uuid;
SELECT is((SELECT estado FROM private.cartoes_operacoes WHERE operacao_id='86666666-0000-4000-8000-000000000076'),'concluida','confirmed saved-card use releases its durable dispatch authorization');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','86666666-0000-4000-8000-000000000001',true);
SELECT is((SELECT count(*) FROM public.remover_cartao_cliente(current_setting('test.cartao_release')::uuid,'86666666-0000-4000-8000-000000000077')),0::bigint,'customer can remove a saved card after its confirmed use');
RESET ROLE;
SET LOCAL ROLE service_role;

SELECT set_config('test.pedido2',pg_temp.novo_pedido('86666666-0000-4000-8000-000000000050')::text,true);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','86666666-0000-4000-8000-000000000001',true);
SELECT set_config('test.tentativa2',(public.reservar_tentativa_pagamento(current_setting('test.pedido2')::uuid,'cartao','86666666-0000-4000-8000-000000000051')->>'id'),true);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.registrar_operacao_cartao_service('86666666-0000-4000-8000-000000000001',current_setting('test.tentativa2')::uuid,'86666666-0000-4000-8000-000000000052','compra','sandbox',true,NULL);
SELECT lives_ok($$SELECT public.marcar_resposta_cobranca_perdida_service('86666666-0000-4000-8000-000000000052')$$,'only an ambiguous create response marks card metadata as unrecoverable');
UPDATE public.tentativas_pagamento SET asaas_payment_id='pay_warning_test',estado='confirmado' WHERE id=current_setting('test.tentativa2')::uuid;
SELECT is(public.marcar_cartao_nao_salvo_reconciliacao_service(current_setting('test.tentativa2')::uuid)->>'avisoCodigo','nao_salvo','reconciliation of a lost response without token becomes a separated warning');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','86666666-0000-4000-8000-000000000001',true);
SELECT is(public.consultar_tentativa_pagamento(current_setting('test.pedido2')::uuid)->>'avisoCartao','nao_salvo','attempt exposes only the public warning');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','86666666-0000-4000-8000-000000000001',true);
SELECT set_config('test.pedido3',pg_temp.novo_pedido('86666666-0000-4000-8000-000000000060')::text,true);
SELECT set_config('test.tentativa3',(public.reservar_tentativa_pagamento(current_setting('test.pedido3')::uuid,'cartao','86666666-0000-4000-8000-000000000061')->>'id'),true);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.registrar_operacao_cartao_service('86666666-0000-4000-8000-000000000001',current_setting('test.tentativa3')::uuid,'86666666-0000-4000-8000-000000000062','compra','sandbox',true,NULL);
UPDATE public.tentativas_pagamento SET asaas_payment_id='pay_webhook_first',estado='confirmado' WHERE id=current_setting('test.tentativa3')::uuid;
SELECT is(public.marcar_cartao_nao_salvo_reconciliacao_service(current_setting('test.tentativa3')::uuid),NULL,'ordinary webhook-before-token cannot close card saving as a lost response');
SELECT lives_ok($$SELECT public.salvar_token_operacao_service('86666666-0000-4000-8000-000000000062','cus_save_test','tok_webhook_first','VISA','1111')$$,'token arriving after webhook uses the same finalizer');
SELECT is((SELECT count(*) FROM public.clientes_cartoes WHERE asaas_credit_card_token='tok_webhook_first'),1::bigint,'webhook-before-token promotes exactly one card without another charge');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
