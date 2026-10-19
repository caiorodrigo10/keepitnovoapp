BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

\set account_deletion_fixture_included true
\ir fixtures/account_deletion.sql

-- Removing either contract below must fail this suite: the SQL phase is the
-- only place that can anonymously detach historical data before Auth deletion.
SELECT has_table('private', 'account_deletion_files',
  'the private, validated Storage manifest exists before personal URLs are cleared');
SELECT has_function('public', 'apply_account_deletion_data',
  ARRAY['uuid', 'uuid', 'bigint'],
  'the service-only data-purge wrapper has its fenced RPC contract');

CREATE TEMP TABLE pg_temp.data_claims (label text PRIMARY KEY, claim jsonb NOT NULL);
CREATE OR REPLACE FUNCTION pg_temp.apply_claim(p_label text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_claim jsonb;
BEGIN
  SELECT claim INTO v_claim FROM pg_temp.data_claims WHERE label=p_label;
  RETURN public.apply_account_deletion_data((v_claim->>'id')::uuid,
    (v_claim->>'leaseToken')::uuid,(v_claim->>'generation')::bigint);
END;
$$;

SELECT pg_temp.enable_test_policy();
INSERT INTO public.hubs (id,nome,endereco,lat,lng)
VALUES (pg_temp.test_id('data-hub'),'Hub data','Rua data, 1',0,0);
INSERT INTO public.produtos (id,estabelecimento_id,nome,preco_reais,categoria_produto)
SELECT pg_temp.test_id('produto-l'),id,'Produto pessoal L',10,'alimentos'
FROM public.estabelecimentos WHERE dono_user_id=pg_temp.test_id('lojista');
INSERT INTO private.cotacoes (id,cliente_id,estabelecimento_id,hub_id,itens,taxas,
  subtotal_centavos,frete_centavos,comissao_centavos,total_centavos,liquido_lojista_centavos)
SELECT pg_temp.test_id('cotacao-a'),pg_temp.test_id('a'),id,pg_temp.test_id('data-hub'),
  '[{"nome":"texto A"}]'::jsonb,'{"cpf":"A"}'::jsonb,1000,0,0,1000,1000
FROM public.estabelecimentos WHERE dono_user_id=pg_temp.test_id('lojista');
INSERT INTO public.pedidos (id,cliente_id,estabelecimento_id,hub_id,status,pago_em,entregue_em,
  subtotal_produtos_reais,taxa_deslocamento_reais,taxa_keepit_reais,total_pago_reais,
  motivo_cancelamento,qr_code_pix,pix_copia_e_cola,cotacao_id,nf_solicitada,asaas_payment_id)
SELECT pg_temp.test_id('pedido-a'),pg_temp.test_id('a'),id,pg_temp.test_id('data-hub'),'entregue',now(),now(),
  10,0,0,10,'texto A','qr-a','pix-a',pg_temp.test_id('cotacao-a'),true,'pay-a'
FROM public.estabelecimentos WHERE dono_user_id=pg_temp.test_id('lojista');
INSERT INTO public.pedidos_itens (pedido_id,produto_id,nome_snapshot,preco_unitario_reais,quantidade,subtotal_reais)
VALUES (pg_temp.test_id('pedido-a'),pg_temp.test_id('produto-l'),'Nome pessoal A',10,1,10);
INSERT INTO private.pedido_segredos (pedido_id,pin_hash,pin_texto)
VALUES (pg_temp.test_id('pedido-a'),'hash-a','1234');
INSERT INTO public.tentativas_pagamento (id,pedido_id,cliente_id,operacao_id,forma,estado,
  asaas_payment_id,qr_code_pix,pix_copia_e_cola,encerramento_confirmacao)
VALUES (pg_temp.test_id('tentativa-a'),pg_temp.test_id('pedido-a'),pg_temp.test_id('a'),
  pg_temp.test_id('op-a'),'pix','confirmado','pay-tentativa-a','qr-tentativa-a','pix-tentativa-a','{"nome":"A"}');
UPDATE public.tentativas_pagamento SET encerramento_claim_token=pg_temp.test_id('encerramento-a'),
  encerramento_claim_expira_em=now()+interval '1 hour' WHERE id=pg_temp.test_id('tentativa-a');
INSERT INTO public.eventos_pagamento (id,evento_externo_id,tipo,cobranca_id,referencia,valor_centavos,
  metodo,tentativa_id,pedido_id,resultado)
VALUES (pg_temp.test_id('evento-a'),'evento-externo-a','PAYMENT_CONFIRMED','cobranca-a','referencia-a',1000,
  'pix',pg_temp.test_id('tentativa-a'),pg_temp.test_id('pedido-a'),'confirmado');
INSERT INTO public.ocorrencias_pagamento (id,evento_pagamento_id,tentativa_id,pedido_id,tipo,estado,referencia_externa,detalhe)
VALUES (pg_temp.test_id('ocorrencia-a'),pg_temp.test_id('evento-a'),pg_temp.test_id('tentativa-a'),
  pg_temp.test_id('pedido-a'),'estorno','encerrada','ocorrencia-externa-a','detalhe pessoal A');
INSERT INTO public.antecipacoes_recebiveis (id,antecipacao_externa_id,tentativa_id,pedido_id,cobranca_id,estado,
  valor_centavos,tarifa_centavos,liquido_centavos,motivo_negacao)
VALUES (pg_temp.test_id('antecipacao-a'),'antecipacao-a',pg_temp.test_id('tentativa-a'),pg_temp.test_id('pedido-a'),
  'cobranca-antecipacao-a','CREDITED',1000,0,1000,'motivo pessoal A');
INSERT INTO public.lancamentos_financeiros (id,estabelecimento_id,pedido_id,tipo,valor_centavos,status,asaas_id_externo,detalhe)
SELECT pg_temp.test_id('lancamento-a'),id,pg_temp.test_id('pedido-a'),'charge',1000,'concluido','lancamento-externo-a','detalhe pessoal A'
FROM public.estabelecimentos WHERE dono_user_id=pg_temp.test_id('lojista');
INSERT INTO public.eventos_reembolso (lancamento_id,operacao_id,tipo,referencia,detalhe,ator_id)
VALUES (pg_temp.test_id('lancamento-a'),pg_temp.test_id('evento-reembolso-a'),'confirmacao','ref-reembolso-a','detalhe A',pg_temp.test_id('a'));
INSERT INTO public.clientes_hubs_favoritos(cliente_id,hub_id)
VALUES (pg_temp.test_id('a'),pg_temp.test_id('data-hub'));
INSERT INTO public.clientes_estabelecimentos_favoritos(cliente_id,estabelecimento_id)
SELECT pg_temp.test_id('a'),id FROM public.estabelecimentos WHERE dono_user_id=pg_temp.test_id('lojista');

SELECT pg_temp.due_request(pg_temp.test_id('a'));
INSERT INTO pg_temp.data_claims VALUES ('a',pg_temp.claim_user(pg_temp.test_id('a')));
SELECT throws_ok($$ DELETE FROM auth.users WHERE id=pg_temp.test_id('a') $$,
  '23503',NULL,'Auth cannot be deleted before the explicit RESTRICT detachment');
SELECT lives_ok($$ SELECT public.purge_account_deletion_cards(
  (SELECT (claim->>'id')::uuid FROM pg_temp.data_claims WHERE label='a'),
  (SELECT (claim->>'leaseToken')::uuid FROM pg_temp.data_claims WHERE label='a'),
  (SELECT (claim->>'generation')::bigint FROM pg_temp.data_claims WHERE label='a')) $$,
  'A reaches the cards checkpoint before SQL data anonymisation');

CREATE OR REPLACE FUNCTION pg_temp.fail_data_checkpoint() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_DATA_CHECKPOINT'; END; $$;
CREATE TRIGGER test_fail_data_checkpoint AFTER UPDATE ON private.account_deletion_executions
FOR EACH ROW WHEN (NEW.phase='data_purged') EXECUTE FUNCTION pg_temp.fail_data_checkpoint();
SELECT throws_ok($$ SELECT pg_temp.apply_claim('a') $$,'P0001','TEST_DATA_CHECKPOINT',
  'an injected final-checkpoint failure aborts the complete SQL data phase');
SELECT is((SELECT cliente_id FROM public.pedidos WHERE id=pg_temp.test_id('pedido-a')),pg_temp.test_id('a'),
  'rollback restores the customer relationship');
SELECT is((SELECT count(*) FROM public.clientes WHERE id=pg_temp.test_id('a')),1::bigint,
  'rollback restores the customer profile');
SELECT is((SELECT pin_texto FROM private.pedido_segredos WHERE pedido_id=pg_temp.test_id('pedido-a')),'1234',
  'rollback restores the personal PIN');
DROP TRIGGER test_fail_data_checkpoint ON private.account_deletion_executions;

SELECT lives_ok($$ SELECT pg_temp.apply_claim('a') $$,
  'the fenced data transaction removes A after the injected failure is removed');
SELECT is((SELECT cliente_id FROM public.pedidos WHERE id=pg_temp.test_id('pedido-a')),NULL::uuid,
  'A historical order detaches its customer');
SELECT is((SELECT total_pago_reais FROM public.pedidos WHERE id=pg_temp.test_id('pedido-a')),10::numeric,
  'A historical order keeps its settled value');
SELECT is((SELECT nome_snapshot FROM public.pedidos_itens WHERE pedido_id=pg_temp.test_id('pedido-a')),'Item histórico',
  'the historical item keeps its amount but loses its personal product label');
SELECT is((SELECT count(*) FROM private.pedido_segredos WHERE pedido_id=pg_temp.test_id('pedido-a')),0::bigint,
  'A PIN is removed rather than retained');
SELECT is((SELECT count(*) FROM private.cotacoes WHERE id=pg_temp.test_id('cotacao-a')),0::bigint,
  'A quote JSON and personal text are removed');
SELECT is((SELECT encerramento_claim_token FROM public.tentativas_pagamento WHERE id=pg_temp.test_id('tentativa-a')),
  NULL::uuid,'A payment-close claim token is removed');
SELECT is((SELECT count(*) FROM public.eventos_pagamento WHERE id=pg_temp.test_id('evento-a') AND referencia IS NULL),1::bigint,
  'payment-event external references are segregated out of the public history');
SELECT is((SELECT count(*) FROM public.ocorrencias_pagamento WHERE id=pg_temp.test_id('ocorrencia-a') AND referencia_externa IS NULL AND detalhe='Conteúdo removido'),1::bigint,
  'payment-occurrence text and external references are removed');
SELECT is((SELECT count(*) FROM public.antecipacoes_recebiveis WHERE id=pg_temp.test_id('antecipacao-a') AND motivo_negacao IS NULL),1::bigint,
  'receivable-advance free text is removed');
SELECT is((SELECT count(*) FROM private.retencoes_conta WHERE solicitacao_id=(SELECT (claim->>'id')::uuid FROM pg_temp.data_claims WHERE label='a')
  AND campo IN ('asaas_payment_id','evento_externo_id','referencia_externa','antecipacao_externa_id','asaas_id_externo','referencia')),
  7::bigint,'allowed financial references are retained privately with expiry before source redaction');
SELECT is((SELECT count(*) FROM public.clientes_hubs_favoritos WHERE cliente_id=pg_temp.test_id('a')),0::bigint,
  'A hub favourites disappear');
SELECT is((SELECT count(*) FROM public.clientes WHERE id=pg_temp.test_id('a')),0::bigint,
  'A customer profile is removed');
SELECT is((SELECT count(*) FROM public.clientes WHERE id=pg_temp.test_id('b')),1::bigint,
  'B customer profile remains isolated from A deletion');
SELECT is((SELECT phase FROM private.account_deletion_executions WHERE request_id=(SELECT (claim->>'id')::uuid FROM pg_temp.data_claims WHERE label='a')),
  'data_purged','the data checkpoint advances only after all SQL handlers return');
SELECT is((SELECT user_id FROM public.account_deletion_requests WHERE id=(SELECT (claim->>'id')::uuid FROM pg_temp.data_claims WHERE label='a')),
  NULL::uuid,'the request is explicitly detached before any future Auth delete');
SELECT is(pg_temp.apply_claim('a')->>'phase','data_purged','checkpoint replay is read-only and idempotent');

-- The pure merchant path preserves B's order and records only validated,
-- owner-prefixed Storage paths; it never deletes the blob in this SQL phase.
INSERT INTO public.pedidos (id,cliente_id,estabelecimento_id,hub_id,status,pago_em,entregue_em,
  subtotal_produtos_reais,taxa_deslocamento_reais,taxa_keepit_reais,total_pago_reais)
SELECT pg_temp.test_id('pedido-l'),pg_temp.test_id('b'),id,pg_temp.test_id('data-hub'),'entregue',now(),now(),10,0,0,10
FROM public.estabelecimentos WHERE dono_user_id=pg_temp.test_id('lojista');
INSERT INTO storage.objects(bucket_id,name,owner)
VALUES ('fachadas',pg_temp.test_id('lojista')::text||'/fachada.png',pg_temp.test_id('lojista')),
  ('produtos',pg_temp.test_id('lojista')::text||'/produto.png',pg_temp.test_id('lojista')),
  ('fachadas',pg_temp.test_id('lojista')::text||'/nao-comprovado.png',pg_temp.test_id('b'));
DELETE FROM public.clientes WHERE id=pg_temp.test_id('lojista');
SELECT pg_temp.due_request(pg_temp.test_id('lojista'));
INSERT INTO pg_temp.data_claims VALUES ('lojista',pg_temp.claim_user(pg_temp.test_id('lojista')));
SELECT public.purge_account_deletion_cards((claim->>'id')::uuid,(claim->>'leaseToken')::uuid,(claim->>'generation')::bigint)
FROM pg_temp.data_claims WHERE label='lojista';
SELECT lives_ok($$ SELECT pg_temp.apply_claim('lojista') $$,'a pure merchant reaches data_purged');
SELECT is((SELECT dono_user_id FROM public.estabelecimentos WHERE id=(SELECT estabelecimento_id FROM public.pedidos WHERE id=pg_temp.test_id('pedido-l'))),
  NULL::uuid,'merchant ownership is removed while the historical order relation remains');
SELECT is((SELECT status FROM public.estabelecimentos WHERE id=(SELECT estabelecimento_id FROM public.pedidos WHERE id=pg_temp.test_id('pedido-l'))),
  'suspenso','the merchant becomes a suspended historical shell');
SELECT is((SELECT count(*) FROM private.account_deletion_files WHERE request_id=(SELECT (claim->>'id')::uuid FROM pg_temp.data_claims WHERE label='lojista')),
  2::bigint,'only validated owner-owned fachada and product paths enter the manifest');
SELECT is((SELECT count(*) FROM storage.objects WHERE owner=pg_temp.test_id('lojista')),2::bigint,
  'the SQL phase does not call Storage or remove blobs');
SELECT is((SELECT cliente_id FROM public.pedidos WHERE id=pg_temp.test_id('pedido-l')),pg_temp.test_id('b'),
  'a merchant purge never removes another customer authorship');

-- A dual identity follows both handlers; B remains a separate account.
INSERT INTO public.pedidos (id,cliente_id,estabelecimento_id,hub_id,status,pago_em,entregue_em,
  subtotal_produtos_reais,taxa_deslocamento_reais,taxa_keepit_reais,total_pago_reais)
SELECT pg_temp.test_id('pedido-duplo'),pg_temp.test_id('duplo'),id,pg_temp.test_id('data-hub'),'entregue',now(),now(),10,0,0,10
FROM public.estabelecimentos WHERE dono_user_id=pg_temp.test_id('duplo');
SELECT pg_temp.due_request(pg_temp.test_id('duplo'));
INSERT INTO pg_temp.data_claims VALUES ('duplo',pg_temp.claim_user(pg_temp.test_id('duplo')));
SELECT public.purge_account_deletion_cards((claim->>'id')::uuid,(claim->>'leaseToken')::uuid,(claim->>'generation')::bigint)
FROM pg_temp.data_claims WHERE label='duplo';
SELECT lives_ok($$ SELECT pg_temp.apply_claim('duplo') $$,'a dual customer and merchant reaches data_purged');
SELECT is((SELECT count(*) FROM public.clientes WHERE id=pg_temp.test_id('duplo')),0::bigint,
  'the dual customer profile is removed');
SELECT is((SELECT dono_user_id FROM public.estabelecimentos WHERE id=(SELECT estabelecimento_id FROM public.pedidos WHERE id=pg_temp.test_id('pedido-duplo'))),
  NULL::uuid,'the dual merchant shell loses ownership');

INSERT INTO auth.users (id,aud,role,email,raw_user_meta_data)
VALUES (pg_temp.test_id('vazia'),'authenticated','authenticated','fixture-vazia@example.invalid','{"nome":"Fixture vazia"}');
UPDATE public.clientes SET nome='Fixture vazia' WHERE id=pg_temp.test_id('vazia');
SELECT pg_temp.due_request(pg_temp.test_id('vazia'));
INSERT INTO pg_temp.data_claims VALUES ('vazia',pg_temp.claim_user(pg_temp.test_id('vazia')));
SELECT public.purge_account_deletion_cards((claim->>'id')::uuid,(claim->>'leaseToken')::uuid,(claim->>'generation')::bigint)
FROM pg_temp.data_claims WHERE label='vazia';
SELECT lives_ok($$ SELECT pg_temp.apply_claim('vazia') $$,'an empty account reaches data_purged without manufacturing retained data');
SELECT is((SELECT count(*) FROM public.clientes WHERE id=pg_temp.test_id('vazia')),0::bigint,
  'the empty account profile is removed');
SELECT is((SELECT count(*) FROM private.retencoes_conta WHERE solicitacao_id=(SELECT (claim->>'id')::uuid FROM pg_temp.data_claims WHERE label='vazia')),
  0::bigint,'an account without financial facts creates no private retention');

SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.apply_account_deletion_data(pg_temp.test_id('request-a'),pg_temp.test_id('lease-a'),1) $$,
  '42501',NULL,'ordinary sessions cannot invoke the data-purge wrapper');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
