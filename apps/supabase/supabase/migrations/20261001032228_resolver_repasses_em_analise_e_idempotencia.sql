BEGIN;

ALTER TABLE public.repasse_eventos DROP CONSTRAINT repasse_eventos_tipo_check;
ALTER TABLE public.repasse_eventos ADD CONSTRAINT repasse_eventos_tipo_check
  CHECK (tipo IN ('preparacao','analise','confirmacao','invalidacao','resolucao_sem_pix'));
ALTER TABLE public.repasse_eventos ADD COLUMN evidencia_sem_pix text;
CREATE UNIQUE INDEX analise_repasse_operacao_unica ON public.repasse_eventos(operacao_id) WHERE tipo='analise';

CREATE OR REPLACE FUNCTION public.confirmar_repasse(p_repasse_id uuid,p_referencia text,p_operacao_id uuid)
RETURNS public.repasses LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid(); v_repasse public.repasses%ROWTYPE; v_ref text:=btrim(p_referencia);
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF p_operacao_id IS NULL THEN RAISE EXCEPTION 'OPERACAO_ID_OBRIGATORIO'; END IF;
  IF p_referencia IS NULL OR v_ref='' THEN RAISE EXCEPTION 'REFERENCIA_OBRIGATORIA'; END IF;
  SELECT * INTO v_repasse FROM public.repasses WHERE id=p_repasse_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPASSE_NAO_ENCONTRADO'; END IF;
  IF EXISTS(SELECT 1 FROM public.repasses WHERE confirmacao_operacao_id=p_operacao_id AND id<>p_repasse_id)
    THEN RAISE EXCEPTION 'OPERACAO_ID_EM_USO'; END IF;
  IF v_repasse.estado='pago' THEN
    IF v_repasse.confirmacao_operacao_id IS DISTINCT FROM p_operacao_id THEN RAISE EXCEPTION 'OPERACAO_ID_EM_USO'; END IF;
    IF v_repasse.referencia IS DISTINCT FROM v_ref THEN RAISE EXCEPTION 'REFERENCIA_DIVERGENTE'; END IF;
    RETURN v_repasse;
  END IF;
  IF v_repasse.estado NOT IN ('pendente','em_analise') THEN RAISE EXCEPTION 'ESTADO_INVALIDO'; END IF;
  IF EXISTS(SELECT 1 FROM public.repasse_eventos WHERE repasse_id=p_repasse_id AND operacao_id=p_operacao_id)
    THEN RAISE EXCEPTION 'OPERACAO_ID_EM_USO'; END IF;
  INSERT INTO public.lancamentos_financeiros(estabelecimento_id,tipo,valor_centavos,status,repasse_id,
    asaas_id_externo,ator_admin_id,concluido_em,detalhe)
  VALUES(v_repasse.estabelecimento_id,'payout',-v_repasse.valor_centavos,'concluido',v_repasse.id,
    v_ref,v_uid,now(),'Repasse semanal confirmado após PIX manual');
  UPDATE public.repasses SET estado='pago',confirmado_em=now(),confirmado_por=v_uid,
    confirmacao_operacao_id=p_operacao_id,referencia=v_ref WHERE id=p_repasse_id RETURNING * INTO v_repasse;
  INSERT INTO public.repasse_eventos(repasse_id,operacao_id,tipo,referencia,ator_id)
    VALUES(p_repasse_id,p_operacao_id,'confirmacao',v_ref,v_uid);
  RETURN v_repasse;
END;
$$;

CREATE OR REPLACE FUNCTION public.marcar_repasse_em_analise(p_repasse_id uuid,p_motivo text,p_operacao_id uuid)
RETURNS public.repasses LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid(); v_repasse public.repasses%ROWTYPE; v_evento public.repasse_eventos%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo)='' THEN RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'; END IF;
  IF p_operacao_id IS NULL THEN RAISE EXCEPTION 'OPERACAO_ID_OBRIGATORIO'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('analise-repasse:'||p_operacao_id::text,0));
  SELECT * INTO v_evento FROM public.repasse_eventos WHERE operacao_id=p_operacao_id AND tipo='analise';
  IF FOUND AND (v_evento.repasse_id<>p_repasse_id OR v_evento.motivo IS DISTINCT FROM btrim(p_motivo))
    THEN RAISE EXCEPTION 'OPERACAO_ID_EM_USO'; END IF;
  SELECT * INTO v_repasse FROM public.repasses WHERE id=p_repasse_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPASSE_NAO_ENCONTRADO'; END IF;
  IF v_evento.id IS NOT NULL THEN RETURN v_repasse; END IF;
  IF v_repasse.estado NOT IN ('pendente','em_analise') THEN RAISE EXCEPTION 'ESTADO_INVALIDO'; END IF;
  IF EXISTS(SELECT 1 FROM public.repasse_eventos WHERE repasse_id=p_repasse_id AND operacao_id=p_operacao_id)
    THEN RAISE EXCEPTION 'OPERACAO_ID_EM_USO'; END IF;
  UPDATE public.repasses SET estado='em_analise' WHERE id=p_repasse_id RETURNING * INTO v_repasse;
  INSERT INTO public.repasse_eventos(repasse_id,operacao_id,tipo,motivo,ator_id)
    VALUES(p_repasse_id,p_operacao_id,'analise',btrim(p_motivo),v_uid);
  RETURN v_repasse;
END;
$$;

CREATE FUNCTION public.resolver_repasse_sem_pix(p_repasse_id uuid,p_motivo text,p_evidencia_sem_pix text,p_operacao_id uuid)
RETURNS public.repasses LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid(); v_repasse public.repasses%ROWTYPE; v_evento public.repasse_eventos%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF p_operacao_id IS NULL THEN RAISE EXCEPTION 'OPERACAO_ID_OBRIGATORIO'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo)='' THEN RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'; END IF;
  IF p_evidencia_sem_pix IS NULL OR btrim(p_evidencia_sem_pix)='' THEN RAISE EXCEPTION 'EVIDENCIA_SEM_PIX_OBRIGATORIA'; END IF;
  SELECT * INTO v_repasse FROM public.repasses WHERE id=p_repasse_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPASSE_NAO_ENCONTRADO'; END IF;
  IF v_repasse.estado='invalidado' AND v_repasse.invalidacao_operacao_id=p_operacao_id THEN
    SELECT * INTO v_evento FROM public.repasse_eventos WHERE repasse_id=p_repasse_id AND operacao_id=p_operacao_id AND tipo='resolucao_sem_pix';
    IF v_evento.id IS NULL OR v_evento.motivo IS DISTINCT FROM btrim(p_motivo)
      OR v_evento.evidencia_sem_pix IS DISTINCT FROM btrim(p_evidencia_sem_pix)
      THEN RAISE EXCEPTION 'OPERACAO_ID_EM_USO'; END IF;
    RETURN v_repasse;
  END IF;
  IF v_repasse.estado<>'em_analise' THEN RAISE EXCEPTION 'ESTADO_INVALIDO'; END IF;
  IF EXISTS(SELECT 1 FROM public.repasses WHERE invalidacao_operacao_id=p_operacao_id AND id<>p_repasse_id)
    OR EXISTS(SELECT 1 FROM public.repasse_eventos WHERE repasse_id=p_repasse_id AND operacao_id=p_operacao_id)
    THEN RAISE EXCEPTION 'OPERACAO_ID_EM_USO'; END IF;
  UPDATE public.repasses SET estado='invalidado',invalidado_em=now(),invalidado_por=v_uid,
    invalidacao_operacao_id=p_operacao_id,motivo_invalidacao=btrim(p_motivo) WHERE id=p_repasse_id RETURNING * INTO v_repasse;
  UPDATE public.repasse_itens SET liberado_em=now() WHERE repasse_id=p_repasse_id AND liberado_em IS NULL;
  INSERT INTO public.repasse_eventos(repasse_id,operacao_id,tipo,motivo,evidencia_sem_pix,ator_id)
    VALUES(p_repasse_id,p_operacao_id,'resolucao_sem_pix',btrim(p_motivo),btrim(p_evidencia_sem_pix),v_uid);
  RETURN v_repasse;
END;
$$;
REVOKE ALL ON FUNCTION public.resolver_repasse_sem_pix(uuid,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolver_repasse_sem_pix(uuid,text,text,uuid) TO authenticated;

-- A fila antiga continua disponível para reembolsos, nunca para payout avulso.
CREATE OR REPLACE FUNCTION public.confirmar_lancamento_admin(
  p_lancamento_id uuid,p_resultado text,p_detalhe text DEFAULT NULL,p_asaas_id_externo text DEFAULT NULL
) RETURNS TABLE(lancamento_id uuid,tipo text,status text,ator_admin_id uuid,concluido_em timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_tipo text; v_lancamento public.lancamentos_financeiros%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'NAO_AUTORIZADO'; END IF;
  SELECT lf.tipo INTO v_tipo FROM public.lancamentos_financeiros lf WHERE lf.id=p_lancamento_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LANCAMENTO_NAO_ENCONTRADO'; END IF;
  IF v_tipo='payout' THEN RAISE EXCEPTION 'SAQUES_DESATIVADOS_USE_REPASSE_SEMANAL'; END IF;
  IF v_tipo='refund' THEN
    v_lancamento:=private.conciliar_reembolso(p_lancamento_id,p_resultado,
      CASE WHEN p_resultado='concluido' THEN COALESCE(p_asaas_id_externo,p_detalhe) ELSE p_asaas_id_externo END,
      gen_random_uuid(),CASE WHEN p_resultado='erro' THEN p_detalhe ELSE NULL END,auth.uid());
    RETURN QUERY SELECT v_lancamento.id,v_lancamento.tipo,v_lancamento.status,v_lancamento.ator_admin_id,v_lancamento.concluido_em;
  ELSE
    RETURN QUERY SELECT x.lancamento_id,x.tipo,x.status,x.ator_admin_id,x.concluido_em
      FROM private.confirmar_lancamento_admin(p_lancamento_id,p_resultado,p_detalhe,p_asaas_id_externo) x;
  END IF;
END;
$$;

COMMIT;
