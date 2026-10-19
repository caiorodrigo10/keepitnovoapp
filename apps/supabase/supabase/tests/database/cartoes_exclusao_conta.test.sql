BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- The approved-policy fixture is deliberately local to this transaction.
DELETE FROM private.politicas_retencao_cartoes WHERE escopo='cartoes_salvos';

SELECT has_function('public', 'purgar_cartoes_conta', ARRAY['uuid', 'uuid'],
  'a service-only account-card purge RPC exists');

INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES
  ('13131313-1111-4111-8111-111111111111','authenticated','authenticated','purge-a@example.invalid','{}'),
  ('13131313-2222-4222-8222-222222222222','authenticated','authenticated','purge-b@example.invalid','{}');
INSERT INTO private.clientes_asaas(cliente_id,ambiente,asaas_customer_id,estado) VALUES
  ('13131313-1111-4111-8111-111111111111','sandbox','cus_purge_a','pronto'),
  ('13131313-2222-4222-8222-222222222222','sandbox','cus_purge_b','pronto');
INSERT INTO public.clientes_cartoes(id,cliente_id,ambiente,asaas_customer_id,asaas_credit_card_token,bandeira,ultimo4) VALUES
  ('13131313-1111-4111-8111-111111111101','13131313-1111-4111-8111-111111111111','sandbox','cus_purge_a','token_purge_a','VISA','1111'),
  ('13131313-2222-4222-8222-222222222202','13131313-2222-4222-8222-222222222222','sandbox','cus_purge_b','token_purge_b','VISA','2222');
INSERT INTO private.cartoes_operacoes(cliente_id,operacao_id,contexto,ambiente,salvar_cartao,asaas_customer_id,token_temporario,bandeira_temporaria,ultimo4_temporario,asaas_payment_id)
VALUES ('13131313-1111-4111-8111-111111111111','13131313-1111-4111-8111-111111111301','perfil','sandbox',true,'cus_purge_a','token_temp_a','VISA','1111','pay_financial_reference_a');
INSERT INTO private.validacoes_cartoes(cliente_id,operacao_id,ambiente,valor_centavos,referencia_externa,asaas_customer_id,token_temporario,bandeira_temporaria,ultimo4_temporario,asaas_cobranca_id,estado)
VALUES ('13131313-1111-4111-8111-111111111111','13131313-1111-4111-8111-111111111302','sandbox',137,'card-validation:13131313-1111-4111-8111-111111111302','cus_purge_a','token_validation_a','VISA','1111','pay_validation_reference_a','validando');
INSERT INTO public.account_deletion_requests(id,user_id,status,requested_at,delete_at,processing_at)
VALUES ('13131313-1111-4111-8111-111111111401','13131313-1111-4111-8111-111111111111','processing',now()-interval '8 days',now()-interval '1 day',now());

SELECT throws_ok($$
  SELECT public.purgar_cartoes_conta('13131313-1111-4111-8111-111111111111','13131313-1111-4111-8111-111111111401')
$$, 'P0001', 'POLITICA_RETENCAO_NAO_APROVADA', 'fails closed without approved retention policy');

INSERT INTO private.politicas_retencao_cartoes(escopo,aprovada_em,aprovado_por,evidencia)
VALUES ('cartoes_salvos',now(),'responsavel-sintetico','matriz-sintetica');
SELECT is(
  public.purgar_cartoes_conta('13131313-1111-4111-8111-111111111111','13131313-1111-4111-8111-111111111401')->>'purged',
  'true', 'the approved, owned processing request purges A');
SELECT is((SELECT count(*) FROM public.clientes_cartoes WHERE cliente_id='13131313-1111-4111-8111-111111111111'), 0::bigint,
  'saved card and its token are removed for A');
SELECT is((SELECT count(*) FROM private.clientes_asaas WHERE cliente_id='13131313-1111-4111-8111-111111111111'), 0::bigint,
  'reusable customer link is removed for A');
SELECT is((SELECT token_temporario IS NULL AND asaas_customer_id IS NULL AND asaas_payment_id='pay_financial_reference_a'
  FROM private.cartoes_operacoes WHERE operacao_id='13131313-1111-4111-8111-111111111301'), true,
  'temporary token/customer are erased while the financial reference remains');
SELECT is((SELECT token_temporario IS NULL AND asaas_customer_id='cus_purge_a' AND asaas_cobranca_id='pay_validation_reference_a'
  FROM private.validacoes_cartoes WHERE operacao_id='13131313-1111-4111-8111-111111111302'), true,
  'validation retains only customer/payment reconciliation references, never its token');
SELECT is((SELECT count(*) FROM public.clientes_cartoes WHERE cliente_id='13131313-2222-4222-8222-222222222222'), 1::bigint,
  'B remains untouched');
SELECT lives_ok($$
  SELECT public.purgar_cartoes_conta('13131313-1111-4111-8111-111111111111','13131313-1111-4111-8111-111111111401')
$$, 'purge replay is idempotent');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$
  SELECT public.purgar_cartoes_conta('13131313-1111-4111-8111-111111111111','13131313-1111-4111-8111-111111111401')
$$, '42501', NULL, 'ordinary authenticated session cannot execute the privileged purge');
RESET ROLE;
SELECT throws_ok($$
  SELECT public.registrar_operacao_cartao_service('13131313-1111-4111-8111-111111111111',NULL,'13131313-1111-4111-8111-111111111302','perfil','sandbox',true,NULL)
$$, 'P0001', 'CONTA_EM_EXCLUSAO', 'late tokenization is blocked after deletion processing starts');

INSERT INTO public.account_deletion_requests(id,user_id,status,requested_at,delete_at)
VALUES ('13131313-2222-4222-8222-222222222402','13131313-2222-4222-8222-222222222222','scheduled',now(),now()+interval '7 days');
SELECT throws_ok($$
  SELECT public.purgar_cartoes_conta('13131313-2222-4222-8222-222222222222','13131313-2222-4222-8222-222222222402')
$$, 'P0001', 'SOLICITACAO_NAO_VENCIDA', 'scheduling and cancellation window never purge cards early');
SELECT is((SELECT status FROM public.cancel_account_deletion_request('13131313-2222-4222-8222-222222222222')),
  'cancelled', 'cancellation inside the seven-day window remains reversible');
SELECT is((SELECT count(*) FROM public.clientes_cartoes WHERE cliente_id='13131313-2222-4222-8222-222222222222'), 1::bigint,
  'cancelling the schedule never purges B cards');

SELECT * FROM finish();
ROLLBACK;
