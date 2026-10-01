BEGIN;

-- Referência bancária e identificador do comprovante pertencem à operação
-- privada do Admin; nenhuma coluna desta tabela é exposta pelo Data API.
CREATE TABLE private.repasse_comprovantes (
  repasse_id uuid PRIMARY KEY REFERENCES public.repasses(id) ON DELETE RESTRICT,
  referencia text NOT NULL CHECK (length(btrim(referencia)) BETWEEN 1 AND 256),
  comprovante_identificador text CHECK (comprovante_identificador IS NULL OR
    length(btrim(comprovante_identificador)) BETWEEN 1 AND 512),
  operacao_id uuid UNIQUE,
  ator_id uuid NOT NULL REFERENCES auth.users(id),
  registrado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX repasse_comprovante_referencia_unica ON private.repasse_comprovantes(referencia);
ALTER TABLE private.repasse_comprovantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.repasse_comprovantes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.repasse_comprovantes FROM PUBLIC, anon, authenticated;

-- Migração honesta: confirmações antigas conservam a referência, porém não
-- recebem um comprovante inventado. O Admin verá esse vazio explicitamente.
INSERT INTO private.repasse_comprovantes(repasse_id,referencia,comprovante_identificador,operacao_id,ator_id,registrado_em)
SELECT id,referencia,NULL,confirmacao_operacao_id,COALESCE(confirmado_por,preparado_por),COALESCE(confirmado_em,preparado_em)
FROM public.repasses WHERE estado='pago' AND referencia IS NOT NULL;
DROP INDEX public.repasse_referencia_paga_unica;
UPDATE public.repasses SET referencia=NULL WHERE referencia IS NOT NULL;
UPDATE public.lancamentos_financeiros SET asaas_id_externo=NULL
WHERE tipo='payout' AND asaas_id_externo IS NOT NULL;

-- RLS protege linhas; privilégios por coluna impedem até SELECT direto da
-- referência, inclusive por um lojista que é dono do lote.
REVOKE ALL ON public.repasses FROM authenticated;
GRANT SELECT (id,estabelecimento_id,semana_inicio,previsto_para,valor_centavos,
  estado,preparado_em,confirmado_em,invalidado_em) ON public.repasses TO authenticated;
DROP POLICY participantes_leem_repasse_eventos ON public.repasse_eventos;
CREATE POLICY admin_le_repasse_eventos ON public.repasse_eventos FOR SELECT TO authenticated
  USING (public.is_admin((select auth.uid())));

-- SECURITY DEFINER é necessário apenas para projetar colunas privadas ao
-- Admin. A condição de sessão e propriedade é explícita em cada linha.
CREATE FUNCTION public.listar_repasses_visiveis() RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid(); v_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  v_admin:=public.is_admin(v_uid);
  RETURN QUERY SELECT CASE WHEN v_admin THEN to_jsonb(r) ELSE jsonb_build_object(
    'id',r.id,'estabelecimento_id',r.estabelecimento_id,'semana_inicio',r.semana_inicio,
    'previsto_para',r.previsto_para,'valor_centavos',r.valor_centavos,'estado',r.estado,
    'preparado_em',r.preparado_em,'confirmado_em',r.confirmado_em) END
  FROM public.repasses r WHERE v_admin OR EXISTS (
    SELECT 1 FROM public.estabelecimentos e WHERE e.id=r.estabelecimento_id AND e.dono_user_id=v_uid)
  ORDER BY r.semana_inicio DESC,r.id;
END;
$$;
REVOKE ALL ON FUNCTION public.listar_repasses_visiveis() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.listar_repasses_visiveis() TO authenticated;

CREATE FUNCTION public.consultar_comprovante_repasse(p_repasse_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_item private.repasse_comprovantes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.repasses WHERE id=p_repasse_id) THEN RAISE EXCEPTION 'REPASSE_NAO_ENCONTRADO'; END IF;
  SELECT * INTO v_item FROM private.repasse_comprovantes WHERE repasse_id=p_repasse_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('referencia',v_item.referencia,
    'comprovante_identificador',v_item.comprovante_identificador,
    'registrado_em',v_item.registrado_em);
END;
$$;
REVOKE ALL ON FUNCTION public.consultar_comprovante_repasse(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.consultar_comprovante_repasse(uuid) TO authenticated;

DROP FUNCTION public.confirmar_repasse(uuid,text,uuid);
CREATE FUNCTION public.confirmar_repasse(p_repasse_id uuid,p_referencia text,
  p_comprovante_identificador text,p_operacao_id uuid) RETURNS public.repasses
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid(); v_repasse public.repasses%ROWTYPE;
  v_comprovante private.repasse_comprovantes%ROWTYPE;
  v_ref text:=btrim(p_referencia); v_prova text:=btrim(p_comprovante_identificador);
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF p_operacao_id IS NULL THEN RAISE EXCEPTION 'OPERACAO_ID_OBRIGATORIO'; END IF;
  IF p_referencia IS NULL OR v_ref='' THEN RAISE EXCEPTION 'REFERENCIA_OBRIGATORIA'; END IF;
  IF length(v_ref)>256 THEN RAISE EXCEPTION 'REFERENCIA_INVALIDA'; END IF;
  IF p_comprovante_identificador IS NULL OR v_prova='' THEN RAISE EXCEPTION 'COMPROVANTE_OBRIGATORIO'; END IF;
  IF length(v_prova)>512 THEN RAISE EXCEPTION 'COMPROVANTE_INVALIDO'; END IF;
  SELECT * INTO v_repasse FROM public.repasses WHERE id=p_repasse_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPASSE_NAO_ENCONTRADO'; END IF;
  SELECT * INTO v_comprovante FROM private.repasse_comprovantes WHERE repasse_id=p_repasse_id;
  IF v_repasse.estado='pago' THEN
    IF v_repasse.confirmacao_operacao_id IS DISTINCT FROM p_operacao_id THEN RAISE EXCEPTION 'OPERACAO_ID_EM_USO'; END IF;
    IF v_comprovante.referencia IS DISTINCT FROM v_ref THEN RAISE EXCEPTION 'REFERENCIA_DIVERGENTE'; END IF;
    IF v_comprovante.comprovante_identificador IS DISTINCT FROM v_prova THEN RAISE EXCEPTION 'COMPROVANTE_DIVERGENTE'; END IF;
    RETURN v_repasse;
  END IF;
  IF v_repasse.estado NOT IN ('pendente','em_analise') THEN RAISE EXCEPTION 'ESTADO_INVALIDO'; END IF;
  IF EXISTS(SELECT 1 FROM public.repasses WHERE confirmacao_operacao_id=p_operacao_id AND id<>p_repasse_id)
    OR EXISTS(SELECT 1 FROM public.repasse_eventos WHERE repasse_id=p_repasse_id AND operacao_id=p_operacao_id)
    THEN RAISE EXCEPTION 'OPERACAO_ID_EM_USO'; END IF;
  IF EXISTS(SELECT 1 FROM private.repasse_comprovantes WHERE referencia=v_ref AND repasse_id<>p_repasse_id)
    THEN RAISE EXCEPTION 'REFERENCIA_EM_USO'; END IF;
  INSERT INTO private.repasse_comprovantes(repasse_id,referencia,comprovante_identificador,operacao_id,ator_id)
    VALUES(p_repasse_id,v_ref,v_prova,p_operacao_id,v_uid);
  INSERT INTO public.lancamentos_financeiros(estabelecimento_id,tipo,valor_centavos,status,repasse_id,
    ator_admin_id,concluido_em,detalhe)
  VALUES(v_repasse.estabelecimento_id,'payout',-v_repasse.valor_centavos,'concluido',v_repasse.id,
    v_uid,now(),'Repasse semanal confirmado após PIX manual');
  UPDATE public.repasses SET estado='pago',confirmado_em=now(),confirmado_por=v_uid,
    confirmacao_operacao_id=p_operacao_id WHERE id=p_repasse_id RETURNING * INTO v_repasse;
  INSERT INTO public.repasse_eventos(repasse_id,operacao_id,tipo,ator_id)
    VALUES(p_repasse_id,p_operacao_id,'confirmacao',v_uid);
  RETURN v_repasse;
END;
$$;
REVOKE ALL ON FUNCTION public.confirmar_repasse(uuid,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirmar_repasse(uuid,text,text,uuid) TO authenticated;

COMMIT;
