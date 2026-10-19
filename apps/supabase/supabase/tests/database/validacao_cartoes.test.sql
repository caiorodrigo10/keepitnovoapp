BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT has_table('private','validacoes_cartoes','validation ledger is private');
SELECT has_function('public','consultar_cadastro_cartao',ARRAY['uuid'],'safe public operation projection exists');
SELECT has_function('public','claim_validacao_cartao_service',ARRAY['uuid','text'],'each financial stage has a service-only durable claim');
SELECT has_function('public','processar_evento_validacao_cartao_service',ARRAY['text','text','text','text','integer','text'],'validation webhook receipt RPC exists');
SELECT has_function('public','reconciliar_cobranca_validacao_cartao_service',ARRAY['uuid','text'],'reconciliation only binds a proven charge');

INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES
 ('aaaaaaaa-1111-4000-8000-000000000001','authenticated','authenticated','validation-a@example.invalid','{}'),
 ('aaaaaaaa-1111-4000-8000-000000000002','authenticated','authenticated','validation-b@example.invalid','{}'),
 ('aaaaaaaa-1111-4000-8000-000000000003','authenticated','authenticated','validation-admin@example.invalid','{}');
INSERT INTO public.admin_users(id,nome) VALUES
 ('aaaaaaaa-1111-4000-8000-000000000003','Validation Admin');
UPDATE public.clientes SET cpf='12345678901' WHERE id='aaaaaaaa-1111-4000-8000-000000000001';
INSERT INTO private.clientes_asaas(cliente_id,ambiente,asaas_customer_id,estado) VALUES
 ('aaaaaaaa-1111-4000-8000-000000000001','sandbox','cus_validation_a','pronto');

SET LOCAL ROLE service_role;
SELECT is((public.registrar_validacao_cartao_service('aaaaaaaa-1111-4000-8000-000000000001','aaaaaaaa-2222-4000-8000-000000000001','sandbox',137)->>'estado'),'preparada','server registers validation before tokenization');
SELECT is((public.registrar_validacao_cartao_service('aaaaaaaa-1111-4000-8000-000000000001','aaaaaaaa-2222-4000-8000-000000000002','sandbox',137)->>'id'),'aaaaaaaa-2222-4000-8000-000000000001','a second tap returns the only active operation');
SELECT is((public.claim_validacao_cartao_service('aaaaaaaa-2222-4000-8000-000000000001','tokenizar')->>'acquired')::boolean,true,'tokenization claim is persisted before gateway work');
SELECT lives_ok($$SELECT public.salvar_token_validacao_cartao_service('aaaaaaaa-2222-4000-8000-000000000001','cus_validation_a','tok_validation_a','VISA','4242')$$,'temporary token persists before charge');
SELECT is((public.claim_validacao_cartao_service('aaaaaaaa-2222-4000-8000-000000000001','cobrar')->>'acquired')::boolean,true,'charge claim follows token persistence');
SELECT lives_ok($$SELECT public.registrar_cobranca_validacao_cartao_service('aaaaaaaa-2222-4000-8000-000000000001','pay_validation_a')$$,'payment ID persists before requesting refund');
SELECT is((public.claim_validacao_cartao_service('aaaaaaaa-2222-4000-8000-000000000001','estornar')->>'acquired')::boolean,true,'refund claim is durable and blocks duplicate refund posts');
SELECT lives_ok($$SELECT public.registrar_estorno_validacao_cartao_service('aaaaaaaa-2222-4000-8000-000000000001','refund_validation_a',137,true)$$,'full confirmed refund ID persists before completion');
SELECT is((public.claim_validacao_cartao_service('aaaaaaaa-2222-4000-8000-000000000001','finalizar')->>'acquired')::boolean,true,'completion waits for a separate persisted finalization claim');
SELECT lives_ok($$SELECT public.confirmar_estorno_validacao_cartao_service('aaaaaaaa-2222-4000-8000-000000000001')$$,'only a full refund can be confirmed for finalization');
SELECT lives_ok($$SELECT public.finalizar_validacao_cartao_service('aaaaaaaa-2222-4000-8000-000000000001')$$,'only the finalizer promotes the temporary token');
SELECT is((SELECT count(*) FROM public.clientes_cartoes WHERE cliente_id='aaaaaaaa-1111-4000-8000-000000000001'),1::bigint,'one card becomes available after full validation and refund');
SELECT ok((SELECT token_temporario IS NULL AND estado='concluida' FROM private.validacoes_cartoes WHERE operacao_id='aaaaaaaa-2222-4000-8000-000000000001'),'completion clears temporary token');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT is((public.processar_evento_validacao_cartao_service('evt-validation-1','PAYMENT_CONFIRMED','pay_validation_a','card-validation:aaaaaaaa-2222-4000-8000-000000000001',137,'cartao')->>'resultado'),'validacao_cartao_processada','matching webhook receipt is durable and isolated from orders');
SELECT is((public.processar_evento_validacao_cartao_service('evt-validation-1','PAYMENT_CONFIRMED','pay_validation_a','card-validation:aaaaaaaa-2222-4000-8000-000000000001',137,'cartao')->>'resultado'),'validacao_cartao_processada','duplicate validation webhook is idempotent');
SELECT is((public.processar_evento_validacao_cartao_service('evt-validation-refunded-terminal','PAYMENT_REFUNDED','pay_validation_a','card-validation:aaaaaaaa-2222-4000-8000-000000000001',137,'cartao')->>'resultado'),'validacao_cartao_processada','full-refund webhook for a completed validation is received');
SELECT is((SELECT estado FROM private.validacoes_cartoes WHERE operacao_id='aaaaaaaa-2222-4000-8000-000000000001'),'concluida','full-refund webhook never reopens a completed validation');
SELECT is((SELECT count(*) FROM public.clientes_cartoes WHERE cliente_id='aaaaaaaa-1111-4000-8000-000000000001'),1::bigint,'completed validation keeps its promoted card available after late refund webhook');
SELECT is((SELECT count(*) FROM private.eventos_validacao_cartoes WHERE evento_id='evt-validation-refunded-terminal'),1::bigint,'late terminal refund remains durably received');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-1111-4000-8000-000000000003',true);
SELECT ok((SELECT NOT EXISTS (
  SELECT 1 FROM public.listar_pendencias_validacao_cartao_admin()
  WHERE operacao_id='aaaaaaaa-2222-4000-8000-000000000001'
)),'completed validation never appears in admin validation pending list after late refund webhook');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT is((public.registrar_validacao_cartao_service('aaaaaaaa-1111-4000-8000-000000000001','aaaaaaaa-2222-4000-8000-000000000002','sandbox',137)->>'id'),'aaaaaaaa-2222-4000-8000-000000000002','a second validation opens after the first completed');
SELECT lives_ok($$SELECT public.processar_evento_validacao_cartao_service('evt-validation-refunded-terminal-with-open','PAYMENT_REFUNDED','pay_validation_a','card-validation:aaaaaaaa-2222-4000-8000-000000000001',137,'cartao')$$,'late terminal refund does not violate the active-validation unique index when another validation is open');
SELECT is((SELECT estado FROM private.validacoes_cartoes WHERE operacao_id='aaaaaaaa-2222-4000-8000-000000000001'),'concluida','completed validation remains terminal when another validation is open');
SELECT is((SELECT estado FROM private.validacoes_cartoes WHERE operacao_id='aaaaaaaa-2222-4000-8000-000000000002'),'preparada','the second validation remains the only open operation');
SELECT is((public.claim_validacao_cartao_service('aaaaaaaa-2222-4000-8000-000000000002','tokenizar')->>'acquired')::boolean,true,'second validation can tokenize');
SELECT lives_ok($$SELECT public.salvar_token_validacao_cartao_service('aaaaaaaa-2222-4000-8000-000000000002','cus_validation_a','tok_validation_b','VISA','1111')$$,'second validation receives temporary token');
SELECT is((public.claim_validacao_cartao_service('aaaaaaaa-2222-4000-8000-000000000002','cobrar')->>'acquired')::boolean,true,'second validation can charge');
SELECT lives_ok($$SELECT public.registrar_cobranca_validacao_cartao_service('aaaaaaaa-2222-4000-8000-000000000002','pay_validation_b')$$,'second validation persists its charge');
SELECT is((public.processar_evento_validacao_cartao_service('evt-validation-refunded-active','PAYMENT_REFUNDED','pay_validation_b','card-validation:aaaaaaaa-2222-4000-8000-000000000002',137,'cartao')->>'resultado'),'validacao_cartao_processada','active full-refund webhook is received');
SELECT is((SELECT estado FROM private.validacoes_cartoes WHERE operacao_id='aaaaaaaa-2222-4000-8000-000000000002'),'reconciliacao','active full-refund webhook requires reconciliation instead of promotion');
SELECT is((public.processar_evento_validacao_cartao_service('evt-validation-refund-denied-active','PAYMENT_REFUND_DENIED','pay_validation_b','card-validation:aaaaaaaa-2222-4000-8000-000000000002',137,'cartao')->>'resultado'),'validacao_cartao_processada','active denied-refund webhook is received');
SELECT is((public.processar_evento_validacao_cartao_service('evt-validation-refunded-partial-active','PAYMENT_PARTIALLY_REFUNDED','pay_validation_b','card-validation:aaaaaaaa-2222-4000-8000-000000000002',137,'cartao')->>'resultado'),'validacao_cartao_processada','active partial-refund webhook is received');
SELECT is((SELECT estado FROM private.validacoes_cartoes WHERE operacao_id='aaaaaaaa-2222-4000-8000-000000000002'),'reconciliacao','partial or denied refund keeps active validation in reconciliation');
SELECT is((SELECT count(*) FROM public.clientes_cartoes WHERE cliente_id='aaaaaaaa-1111-4000-8000-000000000001'),1::bigint,'partial or denied refund never promotes another card');
SELECT lives_ok($$SELECT public.falhar_validacao_cartao_service('aaaaaaaa-2222-4000-8000-000000000002','RECUSADA')$$,'active validation can become refused');
SELECT is((public.processar_evento_validacao_cartao_service('evt-validation-refunded-refused','PAYMENT_REFUNDED','pay_validation_b','card-validation:aaaaaaaa-2222-4000-8000-000000000002',137,'cartao')->>'resultado'),'validacao_cartao_processada','late refund for refused validation is received');
SELECT is((SELECT estado FROM private.validacoes_cartoes WHERE operacao_id='aaaaaaaa-2222-4000-8000-000000000002'),'recusada','refund webhook never reopens a refused validation');
SELECT is((public.processar_evento_validacao_cartao_service('evt-validation-divergent','PAYMENT_REFUNDED','pay_validation_a','reference-divergente',136,'cartao')->>'resultado'),'validacao_divergente','divergent value or reference is rejected');
SELECT is((SELECT estado FROM private.validacoes_cartoes WHERE operacao_id='aaaaaaaa-2222-4000-8000-000000000001'),'concluida','divergent event leaves completed validation untouched');
SELECT is((public.registrar_validacao_cartao_service('aaaaaaaa-1111-4000-8000-000000000001','aaaaaaaa-2222-4000-8000-000000000003','sandbox',137)->>'id'),'aaaaaaaa-2222-4000-8000-000000000003','third validation is available for out-of-order payment confirmation');
SELECT is((public.processar_evento_validacao_cartao_service('evt-validation-confirmed-before-http','PAYMENT_CONFIRMED','pay_validation_c','card-validation:aaaaaaaa-2222-4000-8000-000000000003',137,'cartao')->>'resultado'),'validacao_cartao_processada','payment confirmation before HTTP response is received by reference');
SELECT is((SELECT asaas_cobranca_id FROM private.validacoes_cartoes WHERE operacao_id='aaaaaaaa-2222-4000-8000-000000000003'),'pay_validation_c','out-of-order payment confirmation binds Asaas charge ID by reference');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-1111-4000-8000-000000000001',true);
SELECT is((public.consultar_cadastro_cartao('aaaaaaaa-2222-4000-8000-000000000001')->>'estado'),'concluida','owner sees a safe state projection');
SELECT ok(position('tok_validation_a' in public.consultar_cadastro_cartao('aaaaaaaa-2222-4000-8000-000000000001')::text)=0,'public projection never includes gateway token');
SELECT throws_ok($$SELECT public.claim_validacao_cartao_service('aaaaaaaa-2222-4000-8000-000000000001','tokenizar')$$,'42501',NULL,'client cannot claim a financial stage');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-1111-4000-8000-000000000002',true);
SELECT is(public.consultar_cadastro_cartao('aaaaaaaa-2222-4000-8000-000000000001'),NULL,'another client cannot inspect validation');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
