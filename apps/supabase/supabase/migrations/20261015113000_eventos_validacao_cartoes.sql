-- Task 8.  20261015112500 is already applied by Task 7, so this migration
-- deliberately uses the next timestamp and only adds/replaces objects.
CREATE TABLE IF NOT EXISTS private.eventos_validacao_cartoes (
  evento_id text PRIMARY KEY,
  operacao_id uuid NOT NULL REFERENCES private.validacoes_cartoes(operacao_id) ON DELETE CASCADE,
  evento text NOT NULL,
  cobranca_id text,
  recebido_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.eventos_validacao_cartoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.eventos_validacao_cartoes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.eventos_validacao_cartoes FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.eventos_validacao_cartoes TO service_role;

CREATE OR REPLACE FUNCTION private.processar_evento_validacao_cartao(
  p_evento_id text,p_evento text,p_cobranca_id text,p_referencia text,p_valor_centavos integer,p_metodo text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v private.validacoes_cartoes%ROWTYPE; v_inseridos integer;
BEGIN
  IF p_evento_id IS NULL OR length(btrim(p_evento_id))=0 OR p_metodo<>'cartao' OR p_valor_centavos IS NULL OR p_valor_centavos<=0 THEN
    RETURN jsonb_build_object('resultado','nao_tratado','operacao_id',NULL);
  END IF;
  SELECT * INTO v FROM private.validacoes_cartoes
    WHERE (p_cobranca_id IS NOT NULL AND asaas_cobranca_id=p_cobranca_id)
       OR (p_referencia IS NOT NULL AND referencia_externa=p_referencia)
    ORDER BY CASE WHEN p_cobranca_id IS NOT NULL AND asaas_cobranca_id=p_cobranca_id THEN 0 ELSE 1 END
    LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('resultado','nao_tratado','operacao_id',NULL); END IF;
  -- The reference path is the deliberate out-of-order binding: it is safe
  -- only for this exact operation, full validation amount and card method.
  IF p_referencia IS DISTINCT FROM v.referencia_externa OR p_valor_centavos<>v.valor_centavos OR (v.asaas_cobranca_id IS NOT NULL AND v.asaas_cobranca_id IS DISTINCT FROM p_cobranca_id) THEN
    RETURN jsonb_build_object('resultado','validacao_divergente','operacao_id',v.operacao_id);
  END IF;
  INSERT INTO private.eventos_validacao_cartoes(evento_id,operacao_id,evento,cobranca_id)
    VALUES(p_evento_id,v.operacao_id,p_evento,p_cobranca_id) ON CONFLICT (evento_id) DO NOTHING;
  GET DIAGNOSTICS v_inseridos = ROW_COUNT;
  IF v_inseridos=0 THEN RETURN jsonb_build_object('resultado','validacao_cartao_processada','operacao_id',v.operacao_id); END IF;
  IF p_evento IN ('PAYMENT_CONFIRMED','PAYMENT_RECEIVED') AND p_cobranca_id IS NOT NULL THEN
    UPDATE private.validacoes_cartoes SET asaas_cobranca_id=p_cobranca_id,
      estado=CASE WHEN estado IN ('tokenizado','validando','reconciliacao') THEN 'validando' ELSE estado END,
      claim_etapa=CASE WHEN claim_etapa='cobrar' THEN NULL ELSE claim_etapa END,
      claim_token=CASE WHEN claim_etapa='cobrar' THEN NULL ELSE claim_token END,
      claim_expira_em=CASE WHEN claim_etapa='cobrar' THEN NULL ELSE claim_expira_em END,
      updated_at=now() WHERE operacao_id=v.operacao_id;
  ELSIF p_evento IN ('PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED','PAYMENT_REFUND_DENIED','PAYMENT_REFUND_IN_PROGRESS') THEN
    -- A partial or denied refund is never evidence to promote a card.  A late
    -- refund event may arrive after the HTTP flow has already made this
    -- operation terminal; keep that terminal state intact and retain only its
    -- durable receipt above.  Reopening it would create a false admin pending
    -- item and can violate the one-active-validation-per-client index.  For a
    -- non-terminal operation, require reconciliation instead of promotion.
    UPDATE private.validacoes_cartoes SET estado='reconciliacao', erro_seguro='RECONCILIACAO',updated_at=now()
      WHERE operacao_id=v.operacao_id AND estado NOT IN ('concluida','recusada');
  END IF;
  RETURN jsonb_build_object('resultado','validacao_cartao_processada','operacao_id',v.operacao_id);
END;
$$;
CREATE OR REPLACE FUNCTION public.processar_evento_validacao_cartao_service(
  p_evento_id text,p_evento text,p_cobranca_id text,p_referencia text,p_valor_centavos integer,p_metodo text
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT private.processar_evento_validacao_cartao(p_evento_id,p_evento,p_cobranca_id,p_referencia,p_valor_centavos,p_metodo)
$$;
REVOKE ALL ON FUNCTION public.processar_evento_validacao_cartao_service(text,text,text,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.processar_evento_validacao_cartao_service(text,text,text,text,integer,text) TO service_role;

CREATE OR REPLACE FUNCTION private.reconciliar_cobranca_validacao_cartao(p_operacao_id uuid,p_cobranca_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v private.validacoes_cartoes%ROWTYPE;
BEGIN
  SELECT * INTO v FROM private.validacoes_cartoes WHERE operacao_id=p_operacao_id FOR UPDATE;
  IF NOT FOUND OR p_cobranca_id IS NULL OR length(btrim(p_cobranca_id))=0 THEN RAISE EXCEPTION 'OPERACAO_INDISPONIVEL'; END IF;
  IF v.asaas_cobranca_id IS NOT NULL AND v.asaas_cobranca_id<>p_cobranca_id THEN RAISE EXCEPTION 'COBRANCA_DIVERGENTE'; END IF;
  IF v.estado NOT IN ('tokenizado','validando','reconciliacao') THEN RETURN private.projetar_validacao_cartao(v,true); END IF;
  UPDATE private.validacoes_cartoes SET asaas_cobranca_id=p_cobranca_id,estado='validando',
    claim_etapa=CASE WHEN claim_etapa='cobrar' THEN NULL ELSE claim_etapa END,
    claim_token=CASE WHEN claim_etapa='cobrar' THEN NULL ELSE claim_token END,
    claim_expira_em=CASE WHEN claim_etapa='cobrar' THEN NULL ELSE claim_expira_em END,updated_at=now()
    WHERE id=v.id RETURNING * INTO v;
  RETURN private.projetar_validacao_cartao(v,true);
END;
$$;
CREATE OR REPLACE FUNCTION public.reconciliar_cobranca_validacao_cartao_service(p_operacao_id uuid,p_cobranca_id text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.reconciliar_cobranca_validacao_cartao(p_operacao_id,p_cobranca_id) $$;
REVOKE ALL ON FUNCTION public.reconciliar_cobranca_validacao_cartao_service(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconciliar_cobranca_validacao_cartao_service(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.listar_pendencias_validacao_cartao_admin()
RETURNS TABLE(operacao_id uuid, aberto_em timestamptz, estado text, erro_seguro text, referencia_externa text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT v.operacao_id,v.created_at,v.estado,v.erro_seguro,v.referencia_externa
  FROM private.validacoes_cartoes v
  WHERE EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id=auth.uid())
    AND v.estado IN ('validando','estorno_pendente','reconciliacao')
  ORDER BY v.created_at ASC,v.operacao_id ASC
$$;
REVOKE ALL ON FUNCTION public.listar_pendencias_validacao_cartao_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.listar_pendencias_validacao_cartao_admin() TO authenticated,service_role;
