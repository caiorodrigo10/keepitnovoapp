BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

\set account_deletion_fixture_included true
\ir fixtures/account_deletion.sql

SELECT has_table('private', 'politicas_retencao_cartoes', 'the fixed MVP policy reuses the private card-policy record');
SELECT has_column('private', 'politicas_retencao_cartoes', 'versao', 'the fixed policy records its version');
SELECT has_column('private', 'politicas_retencao_cartoes', 'habilitada', 'the fixed policy has an explicit execution gate');
SELECT has_function('private', 'exigir_politica_retencao', ARRAY['text'], 'the versioned policy gate exists');

SELECT throws_ok($$SELECT private.exigir_politica_retencao('mvp-2026-10-15')$$,
  'P0001', 'POLITICA_RETENCAO_NAO_HABILITADA', 'an absent policy fails closed');
SELECT pg_temp.disable_test_policy();
SELECT throws_ok($$SELECT private.exigir_politica_retencao('test-mvp')$$,
  'P0001', 'POLITICA_RETENCAO_NAO_HABILITADA', 'a disabled policy fails closed');
SELECT pg_temp.set_test_policy('different-version', true);
SELECT throws_ok($$SELECT private.exigir_politica_retencao('test-mvp')$$,
  'P0001', 'POLITICA_RETENCAO_NAO_HABILITADA', 'a different policy version fails closed');
SELECT pg_temp.enable_test_policy();
SELECT lives_ok($$SELECT private.exigir_politica_retencao('test-mvp')$$,
  'only the enabled, exact synthetic version passes');
SELECT is((SELECT prazo_financeiro_anos FROM private.politicas_retencao_cartoes
  WHERE escopo = 'cartoes_salvos'), 5::smallint,
  'H/F use the fixed five-year MVP period after financial closure');
SELECT is((SELECT prazo_auditoria_dias FROM private.politicas_retencao_cartoes
  WHERE escopo = 'cartoes_salvos'), 180::smallint,
  'A uses the fixed 180-day MVP period after completion or cancellation');

SELECT has_table('private', 'retencoes_conta', 'retentions are kept in a private table');
SELECT has_column('private', 'retencoes_conta', 'solicitacao_id', 'retention is tied to one deletion request');
SELECT has_column('private', 'retencoes_conta', 'tabela', 'retention identifies its source table');
SELECT has_column('private', 'retencoes_conta', 'linha_id', 'retention identifies its source row');
SELECT has_column('private', 'retencoes_conta', 'campo', 'retention identifies its source field');
SELECT has_column('private', 'retencoes_conta', 'valor_minimo', 'retention stores only an optional minimum value');
SELECT has_column('private', 'retencoes_conta', 'versao_politica', 'retention records the governing version');
SELECT has_column('private', 'retencoes_conta', 'encerramento_financeiro', 'retention captures the financial close');
SELECT has_column('private', 'retencoes_conta', 'expira_em', 'retention has a fixed expiry');
SELECT ok(EXISTS (
  SELECT 1
  FROM pg_constraint c
  WHERE c.conrelid = to_regclass('private.retencoes_conta')
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) = 'UNIQUE (solicitacao_id, tabela, linha_id, campo)'
), 'one request/source field can produce only one retention');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity
  FROM pg_class WHERE oid = to_regclass('private.retencoes_conta')),
  'retentions enforce RLS even for their owner');
SELECT ok(NOT COALESCE((SELECT has_table_privilege('authenticated', oid, 'SELECT')
  FROM pg_class WHERE oid = to_regclass('private.retencoes_conta')), false),
  'authenticated users have no retention-table read grant');

SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT private.exigir_politica_retencao('test-mvp')$$, '42501', NULL,
  'an authenticated session cannot invoke the private policy gate');
SELECT throws_ok($$SELECT * FROM private.politicas_retencao_cartoes$$, '42501', NULL,
  'an authenticated session cannot read the private policy record');
SELECT throws_ok($$SELECT * FROM private.retencoes_conta$$, '42501', NULL,
  'an authenticated session cannot read private retentions');
RESET ROLE;

SELECT throws_ok($$
  INSERT INTO private.retencoes_conta
    (solicitacao_id, tabela, linha_id, campo, valor_minimo, versao_politica,
     encerramento_financeiro, expira_em)
  VALUES
    (pg_temp.test_id('request-token'), 'private.validacoes_cartoes', pg_temp.test_id('card-token'),
     'token_temporario', 'token-proibido', 'test-mvp', now(), now() + interval '5 years')
$$, '23514', NULL, 'tokens cannot be recorded as a retention');

-- This is a test-only, explicit transcription of the approved MVP matrix.
-- It is deliberately not a runtime classifier or a manifest executor.
CREATE OR REPLACE FUNCTION pg_temp.coluna_classificada(p_schema text, p_tabela text, p_coluna text)
RETURNS boolean LANGUAGE sql AS $$
  WITH allowlist(schema_name, table_name, columns) AS (VALUES
    ('private','cartoes_gestao_operacoes',ARRAY['cliente_id','operacao_id','acao','cartao_id','created_at']::text[]),
    ('private','cartoes_operacoes',ARRAY['id','cliente_id','operacao_id','contexto','tentativa_id','ambiente','asaas_customer_id','salvar_cartao','cartao_salvo_id','estado','claim_token','claim_expira_em','asaas_payment_id','token_temporario','bandeira_temporaria','ultimo4_temporario','aviso_codigo','created_at','updated_at','resposta_cobranca_perdida']::text[]),
    ('private','clientes_asaas',ARRAY['cliente_id','ambiente','asaas_customer_id','estado','claim_token','claim_expira_em','created_at','updated_at']::text[]),
    ('private','cotacoes',ARRAY['id','cliente_id','estabelecimento_id','hub_id','itens','taxas','subtotal_centavos','frete_centavos','comissao_centavos','total_centavos','liquido_lojista_centavos','criado_em']::text[]),
    ('private','eventos_validacao_cartoes',ARRAY['evento_id','operacao_id','evento','cobranca_id','recebido_em']::text[]),
    ('private','operacoes_abertura_solicitacao',ARRAY['operacao_id','solicitacao_id','pedido_id','tipo','solicitante_id']::text[]),
    ('private','operacoes_hubs_admin',ARRAY['operacao_id','tipo','estabelecimento_id','hub_ids','ator_id','criado_em']::text[]),
    ('private','operacoes_preparacao_itens',ARRAY['operacao_id','repasse_id']::text[]),
    ('private','operacoes_preparacao_repasse',ARRAY['operacao_id','semana_inicio','ator_id','criado_em']::text[]),
    ('private','pedido_segredos',ARRAY['pedido_id','pin_hash','pin_texto']::text[]),
    ('private','politicas_retencao_cartoes',ARRAY['escopo','aprovada_em','aprovado_por','evidencia','versao','habilitada','prazo_financeiro_anos','prazo_auditoria_dias']::text[]),
    ('private','repasse_comprovantes',ARRAY['repasse_id','referencia','comprovante_identificador','operacao_id','ator_id','registrado_em']::text[]),
    ('private','retencoes_conta',ARRAY['id','solicitacao_id','tabela','linha_id','campo','valor_minimo','versao_politica','encerramento_financeiro','expira_em','criado_em']::text[]),
    ('private','account_deletion_executions',ARRAY['request_id','target_user_id','policy_version','phase','lease_token','lease_until','generation','next_attempt_at','failure_code','has_cliente','has_lojista','scope','created_at','updated_at']::text[]),
    ('private','account_deletion_files',ARRAY['id','request_id','bucket','path','estado','created_at']::text[]),
    ('private','validacoes_cartoes',ARRAY['id','cliente_id','operacao_id','ambiente','valor_centavos','referencia_externa','asaas_customer_id','token_temporario','bandeira_temporaria','ultimo4_temporario','asaas_cobranca_id','asaas_estorno_id','valor_estornado_centavos','estorno_confirmado','estado','claim_etapa','claim_token','claim_expira_em','erro_seguro','created_at','updated_at']::text[]),
    ('public','_canary',ARRAY['id','message']::text[]),
    ('public','account_deletion_requests',ARRAY['id','user_id','status','requested_at','delete_at','cancelled_at','processing_at','completed_at','failed_at','failure_code','updated_at']::text[]),
    ('public','admin_users',ARRAY['id','nome','criado_em']::text[]),
    ('public','antecipacoes_recebiveis',ARRAY['id','antecipacao_externa_id','tentativa_id','pedido_id','cobranca_id','estado','valor_centavos','tarifa_centavos','liquido_centavos','data_credito','motivo_negacao','criado_em','atualizado_em']::text[]),
    ('public','clientes',ARRAY['id','nome','telefone','cpf','criado_em','bloqueado','motivo_bloqueio','bloqueado_em']::text[]),
    ('public','clientes_cartoes',ARRAY['id','cliente_id','ambiente','asaas_customer_id','asaas_credit_card_token','bandeira','ultimo4','principal','created_at']::text[]),
    ('public','clientes_estabelecimentos_favoritos',ARRAY['cliente_id','estabelecimento_id','criado_em']::text[]),
    ('public','clientes_hubs_favoritos',ARRAY['cliente_id','hub_id','criado_em']::text[]),
    ('public','configuracoes_taxas',ARRAY['singleton','versao','comissao_bps','servico_centavos']::text[]),
    ('public','decisoes_chargeback',ARRAY['id','ocorrencia_id','pedido_id','operacao_id','responsavel_principal','motivo','referencia','principal_informado_centavos','principal_debitado_centavos','taxa_centavos','lancamento_id','ator_admin_id','criado_em']::text[]),
    ('public','decisoes_solicitacao',ARRAY['id','solicitacao_id','operacao_id','aprovar','motivo','valor_centavos','responsavel','ator_id','decidido_em','origem_decisao_id','evento']::text[]),
    ('public','despesas_reembolso',ARRAY['lancamento_id','valor_centavos','criado_em']::text[]),
    ('public','estabelecimentos',ARRAY['id','dono_user_id','nome_fantasia','cnpj','responsavel_nome','telefone','categoria','descricao','foto_fachada_url','dados_receita','endereco','lat','lng','raio_atendimento_km','tempo_medio_entrega_min','taxa_deslocamento_reais','ticket_minimo_reais','chave_pix','chave_pix_tipo','asaas_wallet_id','status','motivo_rejeicao','motivo_suspensao','pausado_manualmente','aprovado_em','aprovado_por','suspenso_em','criado_em','atualizado_em','excluido_em']::text[]),
    ('public','estabelecimentos_falhas',ARRAY['id','estabelecimento_id','pedido_id','tipo','detalhes','criado_em']::text[]),
    ('public','estabelecimentos_horarios',ARRAY['estabelecimento_id','dia_semana','aberto','hora_abre','hora_fecha']::text[]),
    ('public','estabelecimentos_hubs',ARRAY['estabelecimento_id','hub_id','criado_em']::text[]),
    ('public','eventos_pagamento',ARRAY['id','evento_externo_id','tipo','cobranca_id','referencia','valor_centavos','metodo','tentativa_id','pedido_id','resultado','erro_codigo','recebido_em','processado_em','reembolso_externo_id']::text[]),
    ('public','eventos_reembolso',ARRAY['id','lancamento_id','operacao_id','evento_externo_id','tipo','referencia','detalhe','ator_id','criado_em']::text[]),
    ('public','historico_taxas',ARRAY['operacao_id','ator_id','motivo','antes','depois','criado_em']::text[]),
    ('public','hubs',ARRAY['id','nome','endereco','lat','lng','ponto_referencia','foto_url','ativo','criado_em','atualizado_em']::text[]),
    ('public','hubs_horarios',ARRAY['hub_id','dia_semana','aberto','hora_abre','hora_fecha']::text[]),
    ('public','lancamentos_financeiros',ARRAY['id','estabelecimento_id','pedido_id','tipo','valor_centavos','status','asaas_id_externo','ator_admin_id','detalhe','disponivel_em','criado_em','concluido_em','solicitacao_id','motivo_reembolso','responsavel_reembolso','aprovador_id','operacao_confirmacao_id','estado_reserva','liberada_em','liberacao_motivo','reembolso_origem_id','semana_inicio','previsto_para','repasse_id']::text[]),
    ('public','ocorrencias_pagamento',ARRAY['id','evento_pagamento_id','tentativa_id','pedido_id','tipo','estado','referencia_externa','detalhe','criado_em']::text[]),
    ('public','pedidos',ARRAY['id','numero','cliente_id','estabelecimento_id','hub_id','status','tentativas_pin','pin_bloqueado_ate','tempo_estimado_min','criado_em','pago_em','aceito_em','entregue_em','cancelado_em','subtotal_produtos_reais','taxa_deslocamento_reais','taxa_keepit_reais','taxa_servico_comprador_reais','total_pago_reais','nf_solicitada','motivo_recusa','motivo_cancelamento','motivo_nao_retirado','forma_pagamento','atualizado_em','saiu_hub_em','cliente_chegou_em','asaas_payment_id','qr_code_pix','pix_copia_e_cola','cotacao_id','operacao_id','forma_criacao']::text[]),
    ('public','pedidos_itens',ARRAY['id','pedido_id','produto_id','nome_snapshot','preco_unitario_reais','quantidade','subtotal_reais']::text[]),
    ('public','produtos',ARRAY['id','estabelecimento_id','nome','descricao','preco_reais','categoria_produto','foto_url','ativo','criado_em','atualizado_em','excluido_em']::text[]),
    ('public','repasse_eventos',ARRAY['id','repasse_id','operacao_id','tipo','motivo','referencia','ator_id','criado_em','evidencia_sem_pix']::text[]),
    ('public','repasse_itens',ARRAY['id','repasse_id','lancamento_id','valor_centavos','criado_em','liberado_em']::text[]),
    ('public','repasses',ARRAY['id','estabelecimento_id','semana_inicio','previsto_para','valor_centavos','estado','destinatario_nome','destinatario_responsavel','chave_pix','chave_pix_tipo','preparado_em','preparado_por','confirmado_em','confirmado_por','confirmacao_operacao_id','referencia','invalidado_em','invalidado_por','invalidacao_operacao_id','motivo_invalidacao']::text[]),
    ('public','solicitacoes_pedido',ARRAY['id','pedido_id','operacao_id','tipo','estado','motivo','solicitante_id','motivo_decisao','decisor_id','criado_em','encerrada_em']::text[]),
    ('public','tentativas_pagamento',ARRAY['id','pedido_id','cliente_id','operacao_id','forma','estado','asaas_payment_id','qr_code_pix','pix_copia_e_cola','expira_em','claim_token','claim_expira_em','encerrada_em','criado_em','encerramento_operacao_id','encerramento_claim_token','encerramento_claim_expira_em','encerramento_confirmacao','reconciliacao_motivo','aviso_cartao']::text[])
  )
  SELECT EXISTS (SELECT 1 FROM allowlist a WHERE a.schema_name=p_schema AND a.table_name=p_tabela AND p_coluna=ANY(a.columns));
$$;

SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_attribute a
  JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','private') AND c.relkind='r'
    AND a.attnum>0 AND NOT a.attisdropped
    AND NOT pg_temp.coluna_classificada(n.nspname,c.relname,a.attname)
), 'every current application table and column has an explicit MVP-matrix classification');
SELECT ok(NOT pg_temp.coluna_classificada('public','clientes','coluna_sintetica_desconhecida'),
  'an unknown synthetic column fails matrix coverage');

SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','private') AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped
    AND a.atttypid='jsonb'::regtype
    AND (n.nspname,c.relname,a.attname) NOT IN (VALUES
      ('private','cotacoes','itens'), ('private','cotacoes','taxas'),
      ('private','account_deletion_executions','scope'),
      ('public','estabelecimentos','dados_receita'), ('public','historico_taxas','antes'),
      ('public','historico_taxas','depois'), ('public','tentativas_pagamento','encerramento_confirmacao')
    )
), 'every JSON field is explicitly covered by the matrix');

SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_constraint fk JOIN pg_class c ON c.oid=fk.conrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_class target ON target.oid=fk.confrelid JOIN pg_namespace target_n ON target_n.oid=target.relnamespace
  WHERE fk.contype='f' AND n.nspname IN ('public','private')
    AND target_n.nspname='auth' AND target.relname='users'
    AND (n.nspname,c.relname,fk.conname) NOT IN (VALUES
      ('public','account_deletion_requests','account_deletion_requests_user_id_fkey'),
      ('public','admin_users','admin_users_id_fkey'), ('public','clientes','clientes_id_fkey'),
      ('public','decisoes_chargeback','decisoes_chargeback_ator_admin_id_fkey'),
      ('public','decisoes_solicitacao','decisoes_solicitacao_ator_id_fkey'), ('public','estabelecimentos','estabelecimentos_aprovado_por_fkey'),
      ('public','estabelecimentos','estabelecimentos_dono_user_id_fkey'), ('public','eventos_reembolso','eventos_reembolso_ator_id_fkey'),
      ('public','historico_taxas','historico_taxas_ator_id_fkey'), ('public','lancamentos_financeiros','lancamentos_financeiros_aprovador_id_fkey'),
      ('public','lancamentos_financeiros','lancamentos_financeiros_ator_admin_id_fkey'), ('public','repasse_eventos','repasse_eventos_ator_id_fkey'),
      ('public','repasses','repasses_confirmado_por_fkey'), ('public','repasses','repasses_invalidado_por_fkey'),
      ('public','repasses','repasses_preparado_por_fkey'), ('public','solicitacoes_pedido','solicitacoes_pedido_decisor_id_fkey'),
      ('public','solicitacoes_pedido','solicitacoes_pedido_solicitante_id_fkey'), ('private','operacoes_abertura_solicitacao','operacoes_abertura_solicitacao_solicitante_id_fkey'),
      ('private','operacoes_hubs_admin','operacoes_hubs_admin_ator_id_fkey'), ('private','operacoes_preparacao_repasse','operacoes_preparacao_repasse_ator_id_fkey'),
      ('private','repasse_comprovantes','repasse_comprovantes_ator_id_fkey')
    )
), 'every real FK to an Auth identity is explicitly inventoried for deletion handling');

SELECT * FROM finish();
ROLLBACK;
