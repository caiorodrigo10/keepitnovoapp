-- Task 5 — SQL-only anonymisation checkpoint.  Storage blobs and Auth users
-- are deliberately handled by later phases outside this transaction.

CREATE TABLE private.account_deletion_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.account_deletion_requests(id) ON DELETE RESTRICT,
  bucket text NOT NULL CHECK (bucket IN ('fachadas', 'produtos')),
  path text NOT NULL CHECK (length(btrim(path)) > 0),
  estado text NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'removido')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, bucket, path)
);
ALTER TABLE private.account_deletion_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.account_deletion_files FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.account_deletion_files FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.account_deletion_files TO service_role;

-- Historical financial rows survive account deletion.  They lose only the
-- direct profile/actor relationship, always with RESTRICT rather than cascade.
ALTER TABLE public.pedidos ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE public.pedidos DROP CONSTRAINT pedidos_cliente_id_fkey;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE RESTRICT;
ALTER TABLE public.tentativas_pagamento ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE public.tentativas_pagamento DROP CONSTRAINT tentativas_pagamento_cliente_id_fkey;
ALTER TABLE public.tentativas_pagamento ADD CONSTRAINT tentativas_pagamento_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE RESTRICT;
ALTER TABLE private.cartoes_operacoes ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE private.cartoes_operacoes DROP CONSTRAINT cartoes_operacoes_cliente_id_fkey;
ALTER TABLE private.cartoes_operacoes ADD CONSTRAINT cartoes_operacoes_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE RESTRICT;
ALTER TABLE private.validacoes_cartoes ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE private.validacoes_cartoes DROP CONSTRAINT validacoes_cartoes_cliente_id_fkey;
ALTER TABLE private.validacoes_cartoes ADD CONSTRAINT validacoes_cartoes_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE RESTRICT;
ALTER TABLE public.eventos_pagamento ALTER COLUMN evento_externo_id DROP NOT NULL;
ALTER TABLE public.antecipacoes_recebiveis ALTER COLUMN antecipacao_externa_id DROP NOT NULL;
ALTER TABLE public.antecipacoes_recebiveis ALTER COLUMN cobranca_id DROP NOT NULL;

ALTER TABLE public.estabelecimentos ALTER COLUMN dono_user_id DROP NOT NULL;
ALTER TABLE public.estabelecimentos ALTER COLUMN cnpj DROP NOT NULL;
ALTER TABLE public.estabelecimentos ALTER COLUMN responsavel_nome DROP NOT NULL;
ALTER TABLE public.estabelecimentos ALTER COLUMN telefone DROP NOT NULL;
ALTER TABLE public.estabelecimentos ALTER COLUMN endereco DROP NOT NULL;
ALTER TABLE public.estabelecimentos ALTER COLUMN chave_pix DROP NOT NULL;
ALTER TABLE public.estabelecimentos ALTER COLUMN chave_pix_tipo DROP NOT NULL;
ALTER TABLE public.estabelecimentos DROP CONSTRAINT estabelecimentos_dono_user_id_fkey;
ALTER TABLE public.estabelecimentos ADD CONSTRAINT estabelecimentos_dono_user_id_fkey
  FOREIGN KEY (dono_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.estabelecimentos ADD CONSTRAINT estabelecimentos_cadastro_ou_casca_excluida
  CHECK (
    (excluido_em IS NULL AND dono_user_id IS NOT NULL AND cnpj IS NOT NULL
      AND responsavel_nome IS NOT NULL AND telefone IS NOT NULL AND endereco IS NOT NULL
      AND chave_pix IS NOT NULL AND chave_pix_tipo IS NOT NULL)
    OR
    (excluido_em IS NOT NULL AND dono_user_id IS NULL
      AND nome_fantasia = 'Estabelecimento excluído' AND cnpj IS NULL
      AND responsavel_nome IS NULL AND telefone IS NULL AND descricao IS NULL
      AND foto_fachada_url IS NULL AND dados_receita IS NULL AND endereco IS NULL
      AND lat IS NULL AND lng IS NULL AND chave_pix IS NULL AND chave_pix_tipo IS NULL
      AND asaas_wallet_id IS NULL AND motivo_rejeicao IS NULL AND motivo_suspensao IS NULL
      AND status = 'suspenso' AND pausado_manualmente = true)
  );

-- Auth references are explicitly nullable: no account deletion may erase an
-- audit/financial record through a legacy cascade or a non-null actor FK.
ALTER TABLE public.historico_taxas ALTER COLUMN ator_id DROP NOT NULL;
ALTER TABLE public.historico_taxas DROP CONSTRAINT historico_taxas_ator_id_fkey;
ALTER TABLE public.historico_taxas ADD CONSTRAINT historico_taxas_ator_id_fkey FOREIGN KEY (ator_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.solicitacoes_pedido ALTER COLUMN solicitante_id DROP NOT NULL;
ALTER TABLE public.solicitacoes_pedido DROP CONSTRAINT solicitacoes_pedido_solicitante_id_fkey;
ALTER TABLE public.solicitacoes_pedido ADD CONSTRAINT solicitacoes_pedido_solicitante_id_fkey FOREIGN KEY (solicitante_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.solicitacoes_pedido DROP CONSTRAINT solicitacoes_pedido_decisor_id_fkey;
ALTER TABLE public.solicitacoes_pedido ADD CONSTRAINT solicitacoes_pedido_decisor_id_fkey FOREIGN KEY (decisor_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.decisoes_solicitacao ALTER COLUMN ator_id DROP NOT NULL;
ALTER TABLE public.decisoes_solicitacao DROP CONSTRAINT decisoes_solicitacao_ator_id_fkey;
ALTER TABLE public.decisoes_solicitacao ADD CONSTRAINT decisoes_solicitacao_ator_id_fkey FOREIGN KEY (ator_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.repasse_eventos ALTER COLUMN ator_id DROP NOT NULL;
ALTER TABLE public.repasse_eventos DROP CONSTRAINT repasse_eventos_ator_id_fkey;
ALTER TABLE public.repasse_eventos ADD CONSTRAINT repasse_eventos_ator_id_fkey FOREIGN KEY (ator_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.repasses ALTER COLUMN preparado_por DROP NOT NULL;
ALTER TABLE public.repasses DROP CONSTRAINT repasses_preparado_por_fkey;
ALTER TABLE public.repasses ADD CONSTRAINT repasses_preparado_por_fkey FOREIGN KEY (preparado_por) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.repasses DROP CONSTRAINT repasses_confirmado_por_fkey;
ALTER TABLE public.repasses ADD CONSTRAINT repasses_confirmado_por_fkey FOREIGN KEY (confirmado_por) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.repasses DROP CONSTRAINT repasses_invalidado_por_fkey;
ALTER TABLE public.repasses ADD CONSTRAINT repasses_invalidado_por_fkey FOREIGN KEY (invalidado_por) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.lancamentos_financeiros DROP CONSTRAINT lancamentos_financeiros_ator_admin_id_fkey;
ALTER TABLE public.lancamentos_financeiros ADD CONSTRAINT lancamentos_financeiros_ator_admin_id_fkey FOREIGN KEY (ator_admin_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.lancamentos_financeiros DROP CONSTRAINT lancamentos_financeiros_aprovador_id_fkey;
ALTER TABLE public.lancamentos_financeiros ADD CONSTRAINT lancamentos_financeiros_aprovador_id_fkey FOREIGN KEY (aprovador_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.eventos_reembolso DROP CONSTRAINT eventos_reembolso_ator_id_fkey;
ALTER TABLE public.eventos_reembolso ADD CONSTRAINT eventos_reembolso_ator_id_fkey FOREIGN KEY (ator_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE private.operacoes_abertura_solicitacao ALTER COLUMN solicitante_id DROP NOT NULL;
ALTER TABLE private.operacoes_abertura_solicitacao DROP CONSTRAINT operacoes_abertura_solicitacao_solicitante_id_fkey;
ALTER TABLE private.operacoes_abertura_solicitacao ADD CONSTRAINT operacoes_abertura_solicitacao_solicitante_id_fkey FOREIGN KEY (solicitante_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE private.operacoes_hubs_admin ALTER COLUMN ator_id DROP NOT NULL;
ALTER TABLE private.operacoes_hubs_admin DROP CONSTRAINT operacoes_hubs_admin_ator_id_fkey;
ALTER TABLE private.operacoes_hubs_admin ADD CONSTRAINT operacoes_hubs_admin_ator_id_fkey FOREIGN KEY (ator_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE private.operacoes_preparacao_repasse ALTER COLUMN ator_id DROP NOT NULL;
ALTER TABLE private.operacoes_preparacao_repasse DROP CONSTRAINT operacoes_preparacao_repasse_ator_id_fkey;
ALTER TABLE private.operacoes_preparacao_repasse ADD CONSTRAINT operacoes_preparacao_repasse_ator_id_fkey FOREIGN KEY (ator_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE private.repasse_comprovantes ALTER COLUMN ator_id DROP NOT NULL;
ALTER TABLE private.repasse_comprovantes DROP CONSTRAINT repasse_comprovantes_ator_id_fkey;
ALTER TABLE private.repasse_comprovantes ADD CONSTRAINT repasse_comprovantes_ator_id_fkey FOREIGN KEY (ator_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

CREATE FUNCTION private.redacao_exclusao_ativa()
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE v_request_id uuid; v_target uuid;
BEGIN
  v_request_id := nullif(current_setting('keepit.account_deletion_request', true), '')::uuid;
  IF v_request_id IS NULL
    OR current_user <> (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p
      WHERE p.oid = 'public.apply_account_deletion_data(uuid,uuid,bigint)'::regprocedure)
  THEN RETURN NULL; END IF;
  SELECT e.target_user_id INTO v_target
  FROM private.account_deletion_executions e
  JOIN public.account_deletion_requests r ON r.id = e.request_id
  WHERE e.request_id = v_request_id AND e.phase = 'cards_purged'
    AND r.status = 'processing'
    AND EXISTS (SELECT 1 FROM private.politicas_retencao_cartoes p
      WHERE p.escopo = 'cartoes_salvos' AND p.versao = e.policy_version AND p.habilitada);
  RETURN v_target;
END;
$$;
REVOKE ALL ON FUNCTION private.redacao_exclusao_ativa() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lancamento_financeiro_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_target uuid := private.redacao_exclusao_ativa();
BEGIN
  IF v_target IS NOT NULL
    AND NEW.valor_centavos IS NOT DISTINCT FROM OLD.valor_centavos
    AND NEW.tipo IS NOT DISTINCT FROM OLD.tipo
    AND NEW.estabelecimento_id IS NOT DISTINCT FROM OLD.estabelecimento_id
    AND NEW.pedido_id IS NOT DISTINCT FROM OLD.pedido_id
    AND NEW.criado_em IS NOT DISTINCT FROM OLD.criado_em
    AND NEW.disponivel_em IS NOT DISTINCT FROM OLD.disponivel_em
    AND NEW.solicitacao_id IS NOT DISTINCT FROM OLD.solicitacao_id
    AND NEW.responsavel_reembolso IS NOT DISTINCT FROM OLD.responsavel_reembolso
    AND NEW.operacao_confirmacao_id IS NOT DISTINCT FROM OLD.operacao_confirmacao_id
    AND NEW.estado_reserva IS NOT DISTINCT FROM OLD.estado_reserva
    AND NEW.liberada_em IS NOT DISTINCT FROM OLD.liberada_em
    AND NEW.reembolso_origem_id IS NOT DISTINCT FROM OLD.reembolso_origem_id
    AND NEW.semana_inicio IS NOT DISTINCT FROM OLD.semana_inicio
    AND NEW.previsto_para IS NOT DISTINCT FROM OLD.previsto_para
    AND NEW.repasse_id IS NOT DISTINCT FROM OLD.repasse_id
    AND NEW.asaas_id_externo IS NULL AND NEW.detalhe IS NULL
    AND NEW.motivo_reembolso IS NULL AND NEW.liberacao_motivo IS NULL
    AND (NEW.ator_admin_id IS NOT DISTINCT FROM OLD.ator_admin_id OR OLD.ator_admin_id = v_target)
    AND (NEW.aprovador_id IS NOT DISTINCT FROM OLD.aprovador_id OR OLD.aprovador_id = v_target)
  THEN RETURN NEW; END IF;
  IF NEW.valor_centavos IS DISTINCT FROM OLD.valor_centavos OR NEW.tipo IS DISTINCT FROM OLD.tipo
    OR NEW.estabelecimento_id IS DISTINCT FROM OLD.estabelecimento_id OR NEW.pedido_id IS DISTINCT FROM OLD.pedido_id
    OR NEW.criado_em IS DISTINCT FROM OLD.criado_em OR NEW.disponivel_em IS DISTINCT FROM OLD.disponivel_em
    OR NEW.solicitacao_id IS DISTINCT FROM OLD.solicitacao_id OR NEW.motivo_reembolso IS DISTINCT FROM OLD.motivo_reembolso
    OR NEW.responsavel_reembolso IS DISTINCT FROM OLD.responsavel_reembolso OR NEW.aprovador_id IS DISTINCT FROM OLD.aprovador_id
    OR NEW.operacao_confirmacao_id IS DISTINCT FROM OLD.operacao_confirmacao_id OR NEW.estado_reserva IS DISTINCT FROM OLD.estado_reserva
    OR NEW.liberada_em IS DISTINCT FROM OLD.liberada_em OR NEW.liberacao_motivo IS DISTINCT FROM OLD.liberacao_motivo
    OR NEW.reembolso_origem_id IS DISTINCT FROM OLD.reembolso_origem_id OR NEW.semana_inicio IS DISTINCT FROM OLD.semana_inicio
    OR NEW.previsto_para IS DISTINCT FROM OLD.previsto_para OR NEW.repasse_id IS DISTINCT FROM OLD.repasse_id
  THEN RAISE EXCEPTION 'LANCAMENTO_IMUTAVEL'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.proteger_snapshot_repasse()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_target uuid := private.redacao_exclusao_ativa();
BEGIN
  IF v_target IS NOT NULL AND OLD.estabelecimento_id IN (
    SELECT (jsonb_array_elements_text(e.scope -> 'estabelecimentoIds'))::uuid
    FROM private.account_deletion_executions e
    WHERE e.request_id = nullif(current_setting('keepit.account_deletion_request', true), '')::uuid)
    AND NEW.id IS NOT DISTINCT FROM OLD.id AND NEW.estabelecimento_id IS NOT DISTINCT FROM OLD.estabelecimento_id
    AND NEW.semana_inicio IS NOT DISTINCT FROM OLD.semana_inicio AND NEW.previsto_para IS NOT DISTINCT FROM OLD.previsto_para
    AND NEW.valor_centavos IS NOT DISTINCT FROM OLD.valor_centavos AND NEW.preparado_em IS NOT DISTINCT FROM OLD.preparado_em
    AND NEW.destinatario_nome IS NULL AND NEW.destinatario_responsavel IS NULL
    AND NEW.chave_pix IS NULL AND NEW.chave_pix_tipo IS NULL
    AND (NEW.preparado_por IS NOT DISTINCT FROM OLD.preparado_por OR OLD.preparado_por = v_target)
    AND (NEW.confirmado_por IS NOT DISTINCT FROM OLD.confirmado_por OR OLD.confirmado_por = v_target)
    AND (NEW.invalidado_por IS NOT DISTINCT FROM OLD.invalidado_por OR OLD.invalidado_por = v_target)
  THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.estabelecimento_id IS DISTINCT FROM OLD.estabelecimento_id
    OR NEW.semana_inicio IS DISTINCT FROM OLD.semana_inicio OR NEW.previsto_para IS DISTINCT FROM OLD.previsto_para
    OR NEW.valor_centavos IS DISTINCT FROM OLD.valor_centavos OR NEW.destinatario_nome IS DISTINCT FROM OLD.destinatario_nome
    OR NEW.destinatario_responsavel IS DISTINCT FROM OLD.destinatario_responsavel OR NEW.chave_pix IS DISTINCT FROM OLD.chave_pix
    OR NEW.chave_pix_tipo IS DISTINCT FROM OLD.chave_pix_tipo OR NEW.preparado_em IS DISTINCT FROM OLD.preparado_em
    OR NEW.preparado_por IS DISTINCT FROM OLD.preparado_por THEN RAISE EXCEPTION 'SNAPSHOT_REPASSE_IMUTAVEL'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.impedir_mutacao_repasse_evento()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_target uuid := private.redacao_exclusao_ativa();
BEGIN
  IF TG_OP = 'UPDATE' AND v_target IS NOT NULL AND OLD.ator_id = v_target
    AND NEW.id IS NOT DISTINCT FROM OLD.id AND NEW.repasse_id IS NOT DISTINCT FROM OLD.repasse_id
    AND NEW.operacao_id IS NOT DISTINCT FROM OLD.operacao_id AND NEW.tipo IS NOT DISTINCT FROM OLD.tipo
    AND NEW.criado_em IS NOT DISTINCT FROM OLD.criado_em AND NEW.motivo IS NULL
    AND NEW.referencia IS NULL AND NEW.ator_id IS NULL THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'EVENTO_IMUTAVEL';
END;
$$;

CREATE FUNCTION private.redigir_dados_financeiros(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid; v_scope jsonb; v_encerramento timestamptz; v_count integer := 0;
BEGIN
  SELECT target_user_id, scope INTO v_user, v_scope FROM private.account_deletion_executions WHERE request_id = p_request_id;
  IF v_user IS NULL THEN RAISE EXCEPTION 'SOLICITACAO_INDISPONIVEL'; END IF;
  SELECT max(coalesce(p.entregue_em, p.cancelado_em, p.pago_em, p.criado_em)) INTO v_encerramento
  FROM public.pedidos p WHERE p.id IN (SELECT (jsonb_array_elements_text(v_scope -> 'pedidoIds'))::uuid);

  INSERT INTO private.retencoes_conta(solicitacao_id,tabela,linha_id,campo,valor_minimo,versao_politica,encerramento_financeiro,expira_em)
  SELECT p_request_id,'public.pedidos',p.id,'asaas_payment_id',p.asaas_payment_id,
    (SELECT policy_version FROM private.account_deletion_executions WHERE request_id=p_request_id),v_encerramento,v_encerramento+interval '5 years'
  FROM public.pedidos p WHERE p.asaas_payment_id IS NOT NULL AND p.id IN
    (SELECT (jsonb_array_elements_text(v_scope -> 'pedidoIds'))::uuid) AND v_encerramento + interval '5 years' > now();
  INSERT INTO private.retencoes_conta(solicitacao_id,tabela,linha_id,campo,valor_minimo,versao_politica,encerramento_financeiro,expira_em)
  SELECT p_request_id,'public.tentativas_pagamento',t.id,'asaas_payment_id',t.asaas_payment_id,
    (SELECT policy_version FROM private.account_deletion_executions WHERE request_id=p_request_id),v_encerramento,v_encerramento+interval '5 years'
  FROM public.tentativas_pagamento t WHERE t.asaas_payment_id IS NOT NULL AND t.pedido_id IN
    (SELECT (jsonb_array_elements_text(v_scope -> 'pedidoIds'))::uuid) AND v_encerramento + interval '5 years' > now();
  INSERT INTO private.retencoes_conta(solicitacao_id,tabela,linha_id,campo,valor_minimo,versao_politica,encerramento_financeiro,expira_em)
  SELECT p_request_id,'public.eventos_pagamento',ep.id,'evento_externo_id',ep.evento_externo_id,
    (SELECT policy_version FROM private.account_deletion_executions WHERE request_id=p_request_id),v_encerramento,v_encerramento+interval '5 years'
  FROM public.eventos_pagamento ep WHERE ep.evento_externo_id IS NOT NULL AND ep.pedido_id IN
    (SELECT (jsonb_array_elements_text(v_scope -> 'pedidoIds'))::uuid) AND v_encerramento + interval '5 years' > now();
  INSERT INTO private.retencoes_conta(solicitacao_id,tabela,linha_id,campo,valor_minimo,versao_politica,encerramento_financeiro,expira_em)
  SELECT p_request_id,'public.ocorrencias_pagamento',o.id,'referencia_externa',o.referencia_externa,
    (SELECT policy_version FROM private.account_deletion_executions WHERE request_id=p_request_id),v_encerramento,v_encerramento+interval '5 years'
  FROM public.ocorrencias_pagamento o WHERE o.referencia_externa IS NOT NULL AND o.pedido_id IN
    (SELECT (jsonb_array_elements_text(v_scope -> 'pedidoIds'))::uuid) AND v_encerramento + interval '5 years' > now();
  INSERT INTO private.retencoes_conta(solicitacao_id,tabela,linha_id,campo,valor_minimo,versao_politica,encerramento_financeiro,expira_em)
  SELECT p_request_id,'public.antecipacoes_recebiveis',a.id,'antecipacao_externa_id',a.antecipacao_externa_id,
    (SELECT policy_version FROM private.account_deletion_executions WHERE request_id=p_request_id),v_encerramento,v_encerramento+interval '5 years'
  FROM public.antecipacoes_recebiveis a WHERE a.antecipacao_externa_id IS NOT NULL AND a.pedido_id IN
    (SELECT (jsonb_array_elements_text(v_scope -> 'pedidoIds'))::uuid) AND v_encerramento + interval '5 years' > now();
  INSERT INTO private.retencoes_conta(solicitacao_id,tabela,linha_id,campo,valor_minimo,versao_politica,encerramento_financeiro,expira_em)
  SELECT p_request_id,'public.lancamentos_financeiros',l.id,'asaas_id_externo',l.asaas_id_externo,
    (SELECT policy_version FROM private.account_deletion_executions WHERE request_id=p_request_id),v_encerramento,v_encerramento+interval '5 years'
  FROM public.lancamentos_financeiros l WHERE l.asaas_id_externo IS NOT NULL AND l.pedido_id IN
    (SELECT (jsonb_array_elements_text(v_scope -> 'pedidoIds'))::uuid) AND v_encerramento + interval '5 years' > now();
  INSERT INTO private.retencoes_conta(solicitacao_id,tabela,linha_id,campo,valor_minimo,versao_politica,encerramento_financeiro,expira_em)
  SELECT p_request_id,'public.eventos_reembolso',er.id,'referencia',er.referencia,
    (SELECT policy_version FROM private.account_deletion_executions WHERE request_id=p_request_id),v_encerramento,v_encerramento+interval '5 years'
  FROM public.eventos_reembolso er JOIN public.lancamentos_financeiros l ON l.id=er.lancamento_id
  WHERE er.referencia IS NOT NULL AND l.pedido_id IN (SELECT (jsonb_array_elements_text(v_scope -> 'pedidoIds'))::uuid)
    AND v_encerramento + interval '5 years' > now();
  UPDATE public.pedidos SET motivo_recusa=NULL,motivo_cancelamento=NULL,motivo_nao_retirado=NULL,
    qr_code_pix=NULL,pix_copia_e_cola=NULL,tentativas_pin=0,pin_bloqueado_ate=NULL,nf_solicitada=false,
    asaas_payment_id=NULL,cotacao_id=NULL
  WHERE id IN (SELECT (jsonb_array_elements_text(v_scope -> 'pedidoIds'))::uuid);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  DELETE FROM private.pedido_segredos WHERE pedido_id IN
    (SELECT (jsonb_array_elements_text(v_scope -> 'pedidoIds'))::uuid);
  UPDATE public.pedidos_itens SET nome_snapshot='Item histórico'
  WHERE pedido_id IN (SELECT (jsonb_array_elements_text(v_scope -> 'pedidoIds'))::uuid);
  UPDATE public.tentativas_pagamento SET cliente_id=NULL,asaas_payment_id=NULL,qr_code_pix=NULL,pix_copia_e_cola=NULL,
    claim_token=NULL,claim_expira_em=NULL,encerramento_claim_token=NULL,encerramento_claim_expira_em=NULL,
    encerramento_confirmacao=NULL,reconciliacao_motivo=NULL WHERE cliente_id=v_user;
  UPDATE public.eventos_pagamento SET evento_externo_id=NULL,cobranca_id=NULL,referencia=NULL,reembolso_externo_id=NULL
  WHERE pedido_id IN (SELECT (jsonb_array_elements_text(v_scope -> 'pedidoIds'))::uuid);
  UPDATE public.ocorrencias_pagamento SET referencia_externa=NULL,detalhe='Conteúdo removido'
  WHERE pedido_id IN (SELECT (jsonb_array_elements_text(v_scope -> 'pedidoIds'))::uuid);
  UPDATE public.antecipacoes_recebiveis SET antecipacao_externa_id=NULL,cobranca_id=NULL,motivo_negacao=NULL
  WHERE pedido_id IN (SELECT (jsonb_array_elements_text(v_scope -> 'pedidoIds'))::uuid);
  UPDATE public.lancamentos_financeiros SET asaas_id_externo=NULL,detalhe=NULL,motivo_reembolso=NULL,
    liberacao_motivo=NULL,ator_admin_id=CASE WHEN ator_admin_id=v_user THEN NULL ELSE ator_admin_id END,
    aprovador_id=CASE WHEN aprovador_id=v_user THEN NULL ELSE aprovador_id END
  WHERE pedido_id IN (SELECT (jsonb_array_elements_text(v_scope -> 'pedidoIds'))::uuid)
    OR ator_admin_id=v_user OR aprovador_id=v_user;
  UPDATE public.solicitacoes_pedido SET solicitante_id=CASE WHEN solicitante_id=v_user THEN NULL ELSE solicitante_id END,
    decisor_id=CASE WHEN decisor_id=v_user THEN NULL ELSE decisor_id END,
    motivo=CASE WHEN solicitante_id=v_user OR decisor_id=v_user THEN 'Conteúdo removido' ELSE motivo END,
    motivo_decisao=CASE WHEN solicitante_id=v_user OR decisor_id=v_user THEN 'Conteúdo removido' ELSE motivo_decisao END
  WHERE solicitante_id=v_user OR decisor_id=v_user;
  UPDATE public.decisoes_solicitacao SET ator_id=NULL,motivo='Conteúdo removido'
  WHERE ator_id=v_user;
  UPDATE public.eventos_reembolso SET ator_id=CASE WHEN ator_id=v_user THEN NULL ELSE ator_id END,
    referencia=NULL,detalhe=NULL WHERE ator_id=v_user OR lancamento_id IN (
      SELECT id FROM public.lancamentos_financeiros WHERE pedido_id IN
        (SELECT (jsonb_array_elements_text(v_scope -> 'pedidoIds'))::uuid));
  UPDATE public.historico_taxas SET ator_id=NULL,motivo='Conteúdo removido',antes='{}'::jsonb,depois='{}'::jsonb WHERE ator_id=v_user;
  UPDATE public.estabelecimentos SET aprovado_por=NULL WHERE aprovado_por=v_user;
  UPDATE private.operacoes_abertura_solicitacao SET solicitante_id=NULL WHERE solicitante_id=v_user;
  UPDATE private.operacoes_hubs_admin SET ator_id=NULL WHERE ator_id=v_user;
  UPDATE private.operacoes_preparacao_repasse SET ator_id=NULL WHERE ator_id=v_user;
  UPDATE private.repasse_comprovantes SET ator_id=NULL WHERE ator_id=v_user;
  UPDATE public.repasse_eventos SET ator_id=NULL,motivo=NULL,referencia=NULL WHERE ator_id=v_user;
  UPDATE public.repasses SET destinatario_nome=NULL,destinatario_responsavel=NULL,chave_pix=NULL,chave_pix_tipo=NULL,
    preparado_por=CASE WHEN preparado_por=v_user THEN NULL ELSE preparado_por END,
    confirmado_por=CASE WHEN confirmado_por=v_user THEN NULL ELSE confirmado_por END,
    invalidado_por=CASE WHEN invalidado_por=v_user THEN NULL ELSE invalidado_por END
  WHERE estabelecimento_id IN (SELECT (jsonb_array_elements_text(v_scope -> 'estabelecimentoIds'))::uuid);
  RETURN jsonb_build_object('pedidosRedigidos',v_count);
END;
$$;

CREATE FUNCTION private.apagar_dados_lojista(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid; v_scope jsonb; v_count integer := 0;
BEGIN
  SELECT target_user_id,scope INTO v_user,v_scope FROM private.account_deletion_executions WHERE request_id=p_request_id;
  INSERT INTO private.account_deletion_files(request_id,bucket,path)
  SELECT p_request_id,o.bucket_id,o.name FROM storage.objects o
  WHERE o.owner=v_user AND o.bucket_id IN ('fachadas','produtos')
    AND o.name LIKE v_user::text || '/%'
  ON CONFLICT (request_id,bucket,path) DO NOTHING;
  DELETE FROM public.clientes_estabelecimentos_favoritos WHERE estabelecimento_id IN
    (SELECT (jsonb_array_elements_text(v_scope -> 'estabelecimentoIds'))::uuid);
  DELETE FROM public.estabelecimentos_horarios WHERE estabelecimento_id IN
    (SELECT (jsonb_array_elements_text(v_scope -> 'estabelecimentoIds'))::uuid);
  DELETE FROM public.estabelecimentos_hubs WHERE estabelecimento_id IN
    (SELECT (jsonb_array_elements_text(v_scope -> 'estabelecimentoIds'))::uuid);
  UPDATE public.estabelecimentos_falhas SET detalhes=NULL WHERE estabelecimento_id IN
    (SELECT (jsonb_array_elements_text(v_scope -> 'estabelecimentoIds'))::uuid);
  UPDATE public.pedidos SET cotacao_id=NULL WHERE cotacao_id IN
    (SELECT (jsonb_array_elements_text(v_scope -> 'cotacaoIds'))::uuid);
  DELETE FROM private.cotacoes WHERE id IN (SELECT (jsonb_array_elements_text(v_scope -> 'cotacaoIds'))::uuid);
  DELETE FROM public.produtos WHERE estabelecimento_id IN
    (SELECT (jsonb_array_elements_text(v_scope -> 'estabelecimentoIds'))::uuid);
  UPDATE public.estabelecimentos SET dono_user_id=NULL,nome_fantasia='Estabelecimento excluído',cnpj=NULL,
    responsavel_nome=NULL,telefone=NULL,descricao=NULL,foto_fachada_url=NULL,dados_receita=NULL,endereco=NULL,
    lat=NULL,lng=NULL,raio_atendimento_km=NULL,chave_pix=NULL,chave_pix_tipo=NULL,asaas_wallet_id=NULL,
    motivo_rejeicao=NULL,motivo_suspensao=NULL,status='suspenso',pausado_manualmente=true,suspenso_em=now(),excluido_em=now()
  WHERE id IN (SELECT (jsonb_array_elements_text(v_scope -> 'estabelecimentoIds'))::uuid);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('estabelecimentosAnonimizados',v_count);
END;
$$;

CREATE FUNCTION private.apagar_dados_cliente(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid; v_scope jsonb; v_count integer := 0;
BEGIN
  SELECT target_user_id,scope INTO v_user,v_scope FROM private.account_deletion_executions WHERE request_id=p_request_id;
  DELETE FROM public.clientes_hubs_favoritos WHERE cliente_id=v_user;
  DELETE FROM public.clientes_estabelecimentos_favoritos WHERE cliente_id=v_user;
  UPDATE public.pedidos SET cotacao_id=NULL WHERE cotacao_id IN (SELECT id FROM private.cotacoes WHERE cliente_id=v_user);
  DELETE FROM private.cotacoes WHERE cliente_id=v_user;
  DELETE FROM private.cartoes_gestao_operacoes WHERE cliente_id=v_user;
  DELETE FROM public.clientes_cartoes WHERE cliente_id=v_user;
  DELETE FROM private.clientes_asaas WHERE cliente_id=v_user;
  UPDATE private.cartoes_operacoes SET cliente_id=NULL WHERE cliente_id=v_user;
  UPDATE private.validacoes_cartoes SET cliente_id=NULL WHERE cliente_id=v_user;
  UPDATE public.pedidos SET cliente_id=NULL WHERE cliente_id=v_user;
  UPDATE public.tentativas_pagamento SET cliente_id=NULL WHERE cliente_id=v_user;
  DELETE FROM public.clientes WHERE id=v_user;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('clientesRemovidos',v_count);
END;
$$;

CREATE FUNCTION public.apply_account_deletion_data(
  p_request_id uuid, p_lease_token uuid, p_generation bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_execution private.account_deletion_executions%ROWTYPE; v_request public.account_deletion_requests%ROWTYPE;
DECLARE v_scope jsonb; v_user uuid;
BEGIN
  IF p_request_id IS NULL OR p_lease_token IS NULL OR p_generation IS NULL THEN RAISE EXCEPTION 'SOLICITACAO_INVALIDA'; END IF;
  SELECT target_user_id INTO v_user FROM private.account_deletion_executions WHERE request_id=p_request_id;
  IF v_user IS NULL THEN RAISE EXCEPTION 'SOLICITACAO_INDISPONIVEL'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('account-deletion:'||v_user::text,0));
  SELECT e.* INTO v_execution FROM private.account_deletion_executions e
    JOIN public.account_deletion_requests r ON r.id=e.request_id
    WHERE e.request_id=p_request_id FOR UPDATE OF e,r;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOLICITACAO_INDISPONIVEL'; END IF;
  SELECT * INTO v_request FROM public.account_deletion_requests WHERE id=p_request_id;
  IF v_request.status<>'processing' OR v_execution.lease_token IS DISTINCT FROM p_lease_token
    OR v_execution.generation IS DISTINCT FROM p_generation OR v_execution.lease_until IS NULL OR v_execution.lease_until<=now() THEN RAISE EXCEPTION 'LEASE_INVALIDA'; END IF;
  IF v_execution.phase='data_purged' THEN RETURN jsonb_build_object('purged',true,'phase','data_purged'); END IF;
  PERFORM private.exigir_politica_retencao(v_execution.policy_version);
  IF v_execution.phase<>'cards_purged' THEN RAISE EXCEPTION 'FASE_EXCLUSAO_INVALIDA'; END IF;
  SELECT jsonb_build_object(
    'pedidoIds',coalesce((SELECT jsonb_agg(p.id ORDER BY p.id) FROM public.pedidos p LEFT JOIN public.estabelecimentos e ON e.id=p.estabelecimento_id WHERE p.cliente_id=v_user OR e.dono_user_id=v_user),'[]'::jsonb),
    'estabelecimentoIds',coalesce((SELECT jsonb_agg(e.id ORDER BY e.id) FROM public.estabelecimentos e WHERE e.dono_user_id=v_user),'[]'::jsonb),
    'cotacaoIds',coalesce((SELECT jsonb_agg(c.id ORDER BY c.id) FROM private.cotacoes c LEFT JOIN public.estabelecimentos e ON e.id=c.estabelecimento_id WHERE c.cliente_id=v_user OR e.dono_user_id=v_user),'[]'::jsonb)
  ) INTO v_scope;
  UPDATE private.account_deletion_executions SET scope=v_scope,updated_at=now() WHERE request_id=p_request_id;
  PERFORM set_config('keepit.account_deletion_request',p_request_id::text,true);
  PERFORM private.redigir_dados_financeiros(p_request_id);
  PERFORM private.apagar_dados_lojista(p_request_id);
  PERFORM private.apagar_dados_cliente(p_request_id);
  UPDATE public.account_deletion_requests SET user_id=NULL,updated_at=now() WHERE user_id=v_user;
  UPDATE private.account_deletion_executions SET phase='data_purged',updated_at=now()
    WHERE request_id=p_request_id AND lease_token=p_lease_token AND generation=p_generation AND lease_until>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'LEASE_INVALIDA'; END IF;
  RETURN jsonb_build_object('purged',true,'phase','data_purged');
END;
$$;

REVOKE ALL ON FUNCTION public.apply_account_deletion_data(uuid,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_account_deletion_data(uuid,uuid,bigint) TO service_role;
REVOKE ALL ON FUNCTION private.redigir_dados_financeiros(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.apagar_dados_lojista(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.apagar_dados_cliente(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.lancamento_financeiro_imutavel() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.proteger_snapshot_repasse() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.impedir_mutacao_repasse_evento() FROM PUBLIC,anon,authenticated;

COMMENT ON FUNCTION public.apply_account_deletion_data(uuid,uuid,bigint) IS
  'Service-role-only fenced SQL anonymisation checkpoint. It records only a validated Storage manifest; it never calls Storage or Auth APIs.';
