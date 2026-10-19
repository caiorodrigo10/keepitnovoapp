BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT has_table('private', 'cartoes_operacoes', 'immutable card-operation ledger exists');
SELECT has_function('public', 'registrar_operacao_cartao_service', ARRAY['uuid','uuid','uuid','text','text','boolean','uuid'], 'service-only operation registration exists in exposed schema');
SELECT has_function('public', 'claim_cliente_asaas_service', ARRAY['uuid','text'], 'service-only customer creation claim exists in exposed schema');

INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES
  ('97777777-0000-4000-8000-000000000001','authenticated','authenticated','operation-a@example.invalid','{}'),
  ('97777777-0000-4000-8000-000000000002','authenticated','authenticated','operation-b@example.invalid','{}');
INSERT INTO private.clientes_asaas(cliente_id,ambiente,asaas_customer_id,estado) VALUES
  ('97777777-0000-4000-8000-000000000001','sandbox','synthetic_customer_operation_a','pronto'),
  ('97777777-0000-4000-8000-000000000002','sandbox','synthetic_customer_operation_b','pronto');
INSERT INTO public.clientes_cartoes(id,cliente_id,ambiente,asaas_customer_id,asaas_credit_card_token,bandeira,ultimo4) VALUES
  ('97777777-0000-4000-8000-000000000101','97777777-0000-4000-8000-000000000001','sandbox','synthetic_customer_operation_a','synthetic_token_operation_a','VISA','1234');

SELECT is(
  (public.registrar_operacao_cartao_service('97777777-0000-4000-8000-000000000001',NULL,'97777777-0000-4000-8000-000000000201','perfil','sandbox',true,NULL)->>'salvarCartao')::boolean,
  true,
  'profile registration persists explicit save consent before gateway work'
);
SELECT is(
  (SELECT count(*) FROM private.cartoes_operacoes WHERE cliente_id='97777777-0000-4000-8000-000000000001' AND operacao_id='97777777-0000-4000-8000-000000000201'),
  1::bigint,
  'same client and operation have one immutable row'
);
SELECT lives_ok($$
  SELECT public.registrar_operacao_cartao_service('97777777-0000-4000-8000-000000000001',NULL,'97777777-0000-4000-8000-000000000201','perfil','sandbox',true,NULL)
$$, 'identical operation replay is idempotent');
SELECT throws_ok($$
  SELECT public.registrar_operacao_cartao_service('97777777-0000-4000-8000-000000000001',NULL,'97777777-0000-4000-8000-000000000201','perfil','sandbox',false,NULL)
$$, 'P0001', 'OPERACAO_DIVERGENTE', 'replay cannot change save consent');
SELECT throws_ok($$
  SELECT public.registrar_operacao_cartao_service('97777777-0000-4000-8000-000000000001',NULL,'97777777-0000-4000-8000-000000000201','perfil','producao',true,NULL)
$$, 'P0001', 'OPERACAO_DIVERGENTE', 'replay cannot change environment');

SELECT is(
  (public.obter_cartao_operacao_service('97777777-0000-4000-8000-000000000001','97777777-0000-4000-8000-000000000101','sandbox')->>'token'),
  'synthetic_token_operation_a',
  'server-only card lookup returns its token'
);
SELECT throws_ok($$
  SELECT public.registrar_operacao_cartao_service('97777777-0000-4000-8000-000000000001',NULL,'97777777-0000-4000-8000-000000000202','perfil','sandbox',false,'97777777-0000-4000-8000-000000000999')
$$, 'P0001', 'CARTAO_INDISPONIVEL', 'a removed or foreign selected card cannot begin a payment operation');

INSERT INTO public.account_deletion_requests(user_id,status,requested_at,delete_at)
VALUES ('97777777-0000-4000-8000-000000000002','scheduled',now(),now()+interval '7 days');
SELECT throws_ok($$
  SELECT public.registrar_operacao_cartao_service('97777777-0000-4000-8000-000000000002',NULL,'97777777-0000-4000-8000-000000000203','perfil','sandbox',true,NULL)
$$, 'P0001', 'CONTA_EM_EXCLUSAO', 'account deletion blocks new card persistence');

SELECT is(
  (public.claim_cliente_asaas_service('97777777-0000-4000-8000-000000000001','producao')->>'acquired')::boolean,
  true,
  'unbound environment obtains a customer creation claim'
);
UPDATE private.clientes_asaas SET claim_expira_em=now()-interval '1 second'
WHERE cliente_id='97777777-0000-4000-8000-000000000001' AND ambiente='producao';
SELECT is(
  public.claim_cliente_asaas_service('97777777-0000-4000-8000-000000000001','producao')->>'estado',
  'reconciliacao',
  'expired customer claim never authorizes a second POST'
);
SELECT is(
  public.vincular_cliente_asaas_recuperado_service('97777777-0000-4000-8000-000000000001','producao','synthetic_customer_recovered')->>'customerId',
  'synthetic_customer_recovered',
  'a single customer recovered by reference can finalize an expired lease without a new POST'
);
SELECT is(
  public.claim_cliente_asaas_service('97777777-0000-4000-8000-000000000001','producao')->>'customerId',
  'synthetic_customer_recovered',
  'recovered customer is reused by the next delivery'
);

INSERT INTO public.clientes_cartoes(id,cliente_id,ambiente,asaas_customer_id,asaas_credit_card_token,bandeira,ultimo4) VALUES
  ('97777777-0000-4000-8000-000000000102','97777777-0000-4000-8000-000000000001','producao','synthetic_customer_recovered','synthetic_token_operation_a_prod','VISA','5678');
SELECT public.registrar_operacao_cartao_service('97777777-0000-4000-8000-000000000001',NULL,'97777777-0000-4000-8000-000000000204','perfil','sandbox',false,'97777777-0000-4000-8000-000000000101');
SELECT throws_ok($$
  SELECT public.invalidar_cartao_operacao_service('97777777-0000-4000-8000-000000000001','97777777-0000-4000-8000-000000000102','97777777-0000-4000-8000-000000000204')
$$, 'P0001', 'OPERACAO_DIVERGENTE', 'invalidation cannot substitute a card from another environment');
SELECT lives_ok($$
  SELECT public.obter_cartao_operacao_service('97777777-0000-4000-8000-000000000001','97777777-0000-4000-8000-000000000101','sandbox')
$$, 'dispatch authorization resolves the saved card under the client lock');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','97777777-0000-4000-8000-000000000001',true);
SELECT throws_ok($$
  SELECT public.remover_cartao_cliente('97777777-0000-4000-8000-000000000101','97777777-0000-4000-8000-000000000290')
$$, 'P0001', 'CARTAO_EM_USO', 'removal after dispatch authorization cannot race a token post');
RESET ROLE;

-- A confirmed invalid token removes its card atomically with the same
-- deterministic primary-card repair as a customer-requested removal.
INSERT INTO public.clientes_cartoes(id,cliente_id,ambiente,asaas_customer_id,asaas_credit_card_token,bandeira,ultimo4,principal,created_at) VALUES
  ('97777777-0000-4000-8000-000000000103','97777777-0000-4000-8000-000000000001','sandbox','synthetic_customer_operation_a','synthetic_token_operation_a_older','VISA','3333',false,'2025-01-01'),
  ('97777777-0000-4000-8000-000000000104','97777777-0000-4000-8000-000000000001','sandbox','synthetic_customer_operation_a','synthetic_token_operation_a_later','VISA','4444',false,'2025-01-01'),
  ('97777777-0000-4000-8000-000000000105','97777777-0000-4000-8000-000000000002','sandbox','synthetic_customer_operation_b','synthetic_token_operation_b','VISA','5555',false,'2025-01-01');
SELECT public.registrar_operacao_cartao_service('97777777-0000-4000-8000-000000000001',NULL,'97777777-0000-4000-8000-000000000205','perfil','sandbox',false,'97777777-0000-4000-8000-000000000101');
SELECT is(
  public.invalidar_cartao_operacao_service('97777777-0000-4000-8000-000000000001','97777777-0000-4000-8000-000000000101','97777777-0000-4000-8000-000000000205')->>'estado',
  'invalidada',
  'invalidating a primary saved card closes its frozen operation'
);
SELECT is(
  (SELECT count(*) FILTER (WHERE principal) FROM public.clientes_cartoes WHERE cliente_id='97777777-0000-4000-8000-000000000001'),
  1::bigint,
  'invalidating a primary card leaves exactly one primary card'
);
SELECT is(
  (SELECT id FROM public.clientes_cartoes WHERE cliente_id='97777777-0000-4000-8000-000000000001' AND principal),
  '97777777-0000-4000-8000-000000000103'::uuid,
  'primary invalidation promotes the oldest then smallest-ID remaining card'
);
SELECT lives_ok($$
  SELECT public.invalidar_cartao_operacao_service('97777777-0000-4000-8000-000000000001','97777777-0000-4000-8000-000000000101','97777777-0000-4000-8000-000000000205')
$$, 'invalidating the same operation replays without recreating or changing cards');
SELECT is(
  (SELECT count(*) FROM public.clientes_cartoes WHERE cliente_id='97777777-0000-4000-8000-000000000001' AND ambiente='sandbox'),
  2::bigint,
  'primary invalidation replay leaves the remaining list unchanged'
);
SELECT is(
  (SELECT id FROM public.clientes_cartoes WHERE cliente_id='97777777-0000-4000-8000-000000000001' AND principal),
  '97777777-0000-4000-8000-000000000103'::uuid,
  'primary invalidation replay preserves the repaired primary'
);

SELECT public.registrar_operacao_cartao_service('97777777-0000-4000-8000-000000000001',NULL,'97777777-0000-4000-8000-000000000206','perfil','sandbox',false,'97777777-0000-4000-8000-000000000104');
SELECT throws_ok($$
  SELECT public.invalidar_cartao_operacao_service('97777777-0000-4000-8000-000000000001','97777777-0000-4000-8000-000000000105','97777777-0000-4000-8000-000000000206')
$$, 'P0001', 'OPERACAO_DIVERGENTE', 'another client card cannot replace an active operation target');
SELECT is(
  public.invalidar_cartao_operacao_service('97777777-0000-4000-8000-000000000001','97777777-0000-4000-8000-000000000104','97777777-0000-4000-8000-000000000206')->>'estado',
  'invalidada',
  'invalidating a non-primary saved card closes its frozen operation'
);
SELECT is(
  (SELECT id FROM public.clientes_cartoes WHERE cliente_id='97777777-0000-4000-8000-000000000001' AND principal),
  '97777777-0000-4000-8000-000000000103'::uuid,
  'invalidating a non-primary card preserves the primary card'
);
SELECT is(
  (SELECT count(*) FROM public.clientes_cartoes WHERE cliente_id='97777777-0000-4000-8000-000000000002'),
  1::bigint,
  'client B remains unaffected by client A invalidation attempts'
);

SELECT public.registrar_operacao_cartao_service('97777777-0000-4000-8000-000000000001',NULL,'97777777-0000-4000-8000-000000000207','perfil','sandbox',false,'97777777-0000-4000-8000-000000000103');
SELECT lives_ok($$
  SELECT public.invalidar_cartao_operacao_service('97777777-0000-4000-8000-000000000001','97777777-0000-4000-8000-000000000103','97777777-0000-4000-8000-000000000207')
$$, 'invalidating the final saved card succeeds');
SELECT is(
  (SELECT count(*) FROM public.clientes_cartoes WHERE cliente_id='97777777-0000-4000-8000-000000000001' AND ambiente='sandbox'),
  0::bigint,
  'invalidating the final saved card leaves an empty list'
);
SELECT lives_ok($$
  SELECT public.invalidar_cartao_operacao_service('97777777-0000-4000-8000-000000000001','97777777-0000-4000-8000-000000000103','97777777-0000-4000-8000-000000000207')
$$, 'final-card invalidation replay is idempotent');
SELECT is(
  (SELECT count(*) FROM public.clientes_cartoes WHERE cliente_id='97777777-0000-4000-8000-000000000002' AND principal),
  1::bigint,
  'client B keeps its own principal after client A final-card invalidation'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','97777777-0000-4000-8000-000000000001',true);
SELECT throws_ok($$SELECT * FROM private.cartoes_operacoes$$,'42501',NULL,'operation ledger is inaccessible to client sessions');
SELECT throws_ok($$SELECT public.obter_cartao_operacao_service('97777777-0000-4000-8000-000000000001','97777777-0000-4000-8000-000000000101','sandbox')$$,'42501',NULL,'token lookup RPC is service-only');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
