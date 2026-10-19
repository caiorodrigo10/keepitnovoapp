BEGIN;

CREATE FUNCTION public.semana_repasse(p_entregue_em timestamptz)
RETURNS TABLE(semana_inicio date,previsto_para date)
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT date_trunc('week',p_entregue_em AT TIME ZONE 'America/Sao_Paulo')::date,
         date_trunc('week',p_entregue_em AT TIME ZONE 'America/Sao_Paulo')::date + 11;
$$;
REVOKE ALL ON FUNCTION public.semana_repasse(timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.semana_repasse(timestamptz) TO authenticated;

ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN semana_inicio date,
  ADD COLUMN previsto_para date;

UPDATE public.lancamentos_financeiros l SET semana_inicio=s.semana_inicio,previsto_para=s.previsto_para
FROM public.pedidos p CROSS JOIN LATERAL public.semana_repasse(p.entregue_em) s
WHERE l.pedido_id=p.id AND l.tipo='merchant_credit' AND l.valor_centavos>0 AND p.entregue_em IS NOT NULL;

CREATE UNIQUE INDEX credito_positivo_unico_por_pin ON public.lancamentos_financeiros(pedido_id)
  WHERE tipo='merchant_credit' AND valor_centavos>0;

CREATE FUNCTION private.vincular_credito_semana() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_entregue_em timestamptz;
BEGIN
  IF NEW.tipo='merchant_credit' AND NEW.valor_centavos>0 THEN
    SELECT entregue_em INTO v_entregue_em FROM public.pedidos WHERE id=NEW.pedido_id AND status='entregue';
    IF v_entregue_em IS NULL THEN RAISE EXCEPTION 'CREDITO_EXIGE_PIN'; END IF;
    SELECT semana_inicio,previsto_para INTO NEW.semana_inicio,NEW.previsto_para FROM public.semana_repasse(v_entregue_em);
    NEW.disponivel_em := NEW.previsto_para::timestamp AT TIME ZONE 'America/Sao_Paulo';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER vincular_credito_semana BEFORE INSERT ON public.lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION private.vincular_credito_semana();

CREATE TABLE public.repasses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estabelecimento_id uuid NOT NULL REFERENCES public.estabelecimentos(id) ON DELETE RESTRICT,
  semana_inicio date NOT NULL CHECK (extract(isodow FROM semana_inicio)=1),
  previsto_para date NOT NULL CHECK (previsto_para=semana_inicio+11),
  valor_centavos bigint NOT NULL CHECK (valor_centavos>=0),
  estado text NOT NULL CHECK (estado IN ('pendente','em_analise','pago','compensado','invalidado')),
  destinatario_nome text NOT NULL,
  destinatario_responsavel text NOT NULL,
  chave_pix text NOT NULL,
  chave_pix_tipo text NOT NULL,
  preparado_em timestamptz NOT NULL DEFAULT now(),
  preparado_por uuid NOT NULL REFERENCES auth.users(id),
  confirmado_em timestamptz,
  confirmado_por uuid REFERENCES auth.users(id),
  confirmacao_operacao_id uuid UNIQUE,
  referencia text,
  invalidado_em timestamptz,
  invalidado_por uuid REFERENCES auth.users(id),
  invalidacao_operacao_id uuid UNIQUE,
  motivo_invalidacao text
);
CREATE UNIQUE INDEX repasse_ativo_por_loja_semana ON public.repasses(estabelecimento_id,semana_inicio)
  WHERE estado<>'invalidado';
CREATE UNIQUE INDEX repasse_referencia_paga_unica ON public.repasses(referencia)
  WHERE estado='pago' AND referencia IS NOT NULL;
CREATE INDEX repasses_fila ON public.repasses(estado,previsto_para);

CREATE TABLE public.repasse_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repasse_id uuid NOT NULL REFERENCES public.repasses(id) ON DELETE RESTRICT,
  lancamento_id uuid NOT NULL REFERENCES public.lancamentos_financeiros(id) ON DELETE RESTRICT,
  valor_centavos bigint NOT NULL CHECK (valor_centavos<>0),
  criado_em timestamptz NOT NULL DEFAULT now(),
  liberado_em timestamptz,
  UNIQUE(repasse_id,lancamento_id)
);
CREATE UNIQUE INDEX credito_alocado_uma_vez ON public.repasse_itens(lancamento_id)
  WHERE valor_centavos>0 AND liberado_em IS NULL;
CREATE INDEX repasse_itens_lancamento ON public.repasse_itens(lancamento_id) WHERE liberado_em IS NULL;

CREATE FUNCTION private.proteger_snapshot_repasse() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.estabelecimento_id IS DISTINCT FROM OLD.estabelecimento_id
    OR NEW.semana_inicio IS DISTINCT FROM OLD.semana_inicio OR NEW.previsto_para IS DISTINCT FROM OLD.previsto_para
    OR NEW.valor_centavos IS DISTINCT FROM OLD.valor_centavos OR NEW.destinatario_nome IS DISTINCT FROM OLD.destinatario_nome
    OR NEW.destinatario_responsavel IS DISTINCT FROM OLD.destinatario_responsavel OR NEW.chave_pix IS DISTINCT FROM OLD.chave_pix
    OR NEW.chave_pix_tipo IS DISTINCT FROM OLD.chave_pix_tipo OR NEW.preparado_em IS DISTINCT FROM OLD.preparado_em
    OR NEW.preparado_por IS DISTINCT FROM OLD.preparado_por THEN RAISE EXCEPTION 'SNAPSHOT_REPASSE_IMUTAVEL'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proteger_snapshot_repasse BEFORE UPDATE ON public.repasses
  FOR EACH ROW EXECUTE FUNCTION private.proteger_snapshot_repasse();

CREATE FUNCTION private.proteger_alocacao_repasse() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.repasse_id IS DISTINCT FROM OLD.repasse_id
    OR NEW.lancamento_id IS DISTINCT FROM OLD.lancamento_id OR NEW.valor_centavos IS DISTINCT FROM OLD.valor_centavos
    OR NEW.criado_em IS DISTINCT FROM OLD.criado_em OR OLD.liberado_em IS NOT NULL
    OR NEW.liberado_em IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.repasses WHERE id=OLD.repasse_id AND estado='invalidado')
    THEN RAISE EXCEPTION 'ALOCACAO_IMUTAVEL'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proteger_alocacao_repasse BEFORE UPDATE ON public.repasse_itens
  FOR EACH ROW EXECUTE FUNCTION private.proteger_alocacao_repasse();

ALTER TABLE public.lancamentos_financeiros ADD COLUMN repasse_id uuid REFERENCES public.repasses(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX payout_unico_por_repasse ON public.lancamentos_financeiros(repasse_id)
  WHERE tipo='payout' AND repasse_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.lancamento_financeiro_imutavel() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.valor_centavos IS DISTINCT FROM OLD.valor_centavos OR NEW.tipo IS DISTINCT FROM OLD.tipo
    OR NEW.estabelecimento_id IS DISTINCT FROM OLD.estabelecimento_id OR NEW.pedido_id IS DISTINCT FROM OLD.pedido_id
    OR NEW.criado_em IS DISTINCT FROM OLD.criado_em OR NEW.disponivel_em IS DISTINCT FROM OLD.disponivel_em
    OR NEW.semana_inicio IS DISTINCT FROM OLD.semana_inicio OR NEW.previsto_para IS DISTINCT FROM OLD.previsto_para
    OR NEW.repasse_id IS DISTINCT FROM OLD.repasse_id THEN RAISE EXCEPTION 'LANCAMENTO_IMUTAVEL'; END IF;
  IF NEW.solicitacao_id IS DISTINCT FROM OLD.solicitacao_id OR NEW.motivo_reembolso IS DISTINCT FROM OLD.motivo_reembolso
    OR NEW.responsavel_reembolso IS DISTINCT FROM OLD.responsavel_reembolso OR NEW.aprovador_id IS DISTINCT FROM OLD.aprovador_id
    OR NEW.reembolso_origem_id IS DISTINCT FROM OLD.reembolso_origem_id THEN RAISE EXCEPTION 'REEMBOLSO_METADATA_IMUTAVEL'; END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE public.repasse_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repasse_id uuid NOT NULL REFERENCES public.repasses(id) ON DELETE RESTRICT,
  operacao_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('preparacao','analise','confirmacao','invalidacao')),
  motivo text,
  referencia text,
  ator_id uuid NOT NULL REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(repasse_id,operacao_id)
);
CREATE FUNCTION private.impedir_mutacao_repasse_evento() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'EVENTO_IMUTAVEL'; END;
$$;
CREATE TRIGGER repasse_evento_imutavel BEFORE UPDATE OR DELETE ON public.repasse_eventos
  FOR EACH ROW EXECUTE FUNCTION private.impedir_mutacao_repasse_evento();

CREATE TABLE private.operacoes_preparacao_repasse (
  operacao_id uuid PRIMARY KEY,
  semana_inicio date NOT NULL,
  ator_id uuid NOT NULL REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.operacoes_preparacao_itens (
  operacao_id uuid NOT NULL REFERENCES private.operacoes_preparacao_repasse(operacao_id) ON DELETE RESTRICT,
  repasse_id uuid NOT NULL REFERENCES public.repasses(id) ON DELETE RESTRICT,
  PRIMARY KEY(operacao_id,repasse_id)
);

ALTER TABLE public.repasses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repasses FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.repasses FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.repasses TO authenticated;
CREATE POLICY participantes_leem_repasses ON public.repasses FOR SELECT TO authenticated
  USING (public.is_admin((select auth.uid())) OR EXISTS (
    SELECT 1 FROM public.estabelecimentos e WHERE e.id=estabelecimento_id AND e.dono_user_id=(select auth.uid())
  ));
ALTER TABLE public.repasse_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repasse_itens FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.repasse_itens FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.repasse_itens TO authenticated;
CREATE POLICY participantes_leem_repasse_itens ON public.repasse_itens FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.repasses r WHERE r.id=repasse_id));
ALTER TABLE public.repasse_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repasse_eventos FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.repasse_eventos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.repasse_eventos TO authenticated;
CREATE POLICY participantes_leem_repasse_eventos ON public.repasse_eventos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.repasses r WHERE r.id=repasse_id));

CREATE FUNCTION public.preparar_repasses_semanais(p_semana_inicio date,p_operacao_id uuid)
RETURNS SETOF public.repasses LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid(); v_operacao private.operacoes_preparacao_repasse%ROWTYPE;
  v_estab public.estabelecimentos%ROWTYPE; v_repasse public.repasses%ROWTYPE;
  v_creditos bigint; v_divida bigint; v_valor bigint; v_abater bigint; v_restante bigint;
  v_ajuste record;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF p_operacao_id IS NULL THEN RAISE EXCEPTION 'OPERACAO_ID_OBRIGATORIO'; END IF;
  IF p_semana_inicio IS NULL OR extract(isodow FROM p_semana_inicio)<>1 THEN RAISE EXCEPTION 'SEMANA_INVALIDA'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('preparar-repasse:'||p_operacao_id::text,0));
  SELECT * INTO v_operacao FROM private.operacoes_preparacao_repasse WHERE operacao_id=p_operacao_id FOR UPDATE;
  IF FOUND THEN
    IF v_operacao.semana_inicio<>p_semana_inicio OR v_operacao.ator_id<>v_uid THEN RAISE EXCEPTION 'OPERACAO_ID_EM_USO'; END IF;
    RETURN QUERY SELECT r.* FROM public.repasses r JOIN private.operacoes_preparacao_itens i ON i.repasse_id=r.id
      WHERE i.operacao_id=p_operacao_id ORDER BY r.estabelecimento_id;
    RETURN;
  END IF;
  INSERT INTO private.operacoes_preparacao_repasse(operacao_id,semana_inicio,ator_id)
    VALUES(p_operacao_id,p_semana_inicio,v_uid);

  FOR v_estab IN SELECT e.* FROM public.estabelecimentos e WHERE
    EXISTS(SELECT 1 FROM public.repasses r WHERE r.estabelecimento_id=e.id AND r.semana_inicio=p_semana_inicio AND r.estado<>'invalidado')
    OR EXISTS(SELECT 1 FROM public.lancamentos_financeiros l WHERE l.estabelecimento_id=e.id
      AND l.tipo='merchant_credit' AND l.valor_centavos>0 AND l.status='concluido' AND l.semana_inicio<=p_semana_inicio
      AND NOT EXISTS(SELECT 1 FROM public.repasse_itens i WHERE i.lancamento_id=l.id AND i.liberado_em IS NULL))
    ORDER BY e.id
  LOOP
    PERFORM 1 FROM public.estabelecimentos WHERE id=v_estab.id FOR UPDATE;
    SELECT * INTO v_repasse FROM public.repasses WHERE estabelecimento_id=v_estab.id
      AND semana_inicio=p_semana_inicio AND estado<>'invalidado' FOR UPDATE;
    IF NOT FOUND THEN
      SELECT COALESCE(SUM(l.valor_centavos),0) INTO v_creditos FROM public.lancamentos_financeiros l
      WHERE l.estabelecimento_id=v_estab.id AND l.tipo='merchant_credit' AND l.valor_centavos>0
        AND l.status='concluido' AND l.semana_inicio<=p_semana_inicio
        AND NOT EXISTS(SELECT 1 FROM public.repasse_itens i WHERE i.lancamento_id=l.id AND i.liberado_em IS NULL);
      IF v_creditos<=0 THEN CONTINUE; END IF;
      SELECT COALESCE(SUM(GREATEST(0,-l.valor_centavos-COALESCE(a.consumido,0))),0) INTO v_divida
      FROM public.lancamentos_financeiros l LEFT JOIN LATERAL (
        SELECT -SUM(i.valor_centavos) AS consumido FROM public.repasse_itens i
        WHERE i.lancamento_id=l.id AND i.liberado_em IS NULL
      ) a ON true
      WHERE l.estabelecimento_id=v_estab.id AND l.tipo='merchant_credit' AND l.valor_centavos<0 AND l.status='concluido';
      v_valor:=GREATEST(0,v_creditos-v_divida);
      IF v_estab.chave_pix IS NULL OR btrim(v_estab.chave_pix)='' THEN RAISE EXCEPTION 'CHAVE_PIX_OBRIGATORIA'; END IF;
      INSERT INTO public.repasses(estabelecimento_id,semana_inicio,previsto_para,valor_centavos,estado,
        destinatario_nome,destinatario_responsavel,chave_pix,chave_pix_tipo,preparado_por)
      VALUES(v_estab.id,p_semana_inicio,p_semana_inicio+11,v_valor,
        CASE WHEN v_valor=0 THEN 'compensado' ELSE 'pendente' END,
        v_estab.nome_fantasia,v_estab.responsavel_nome,v_estab.chave_pix,v_estab.chave_pix_tipo,v_uid)
      RETURNING * INTO v_repasse;
      INSERT INTO public.repasse_itens(repasse_id,lancamento_id,valor_centavos)
        SELECT v_repasse.id,l.id,l.valor_centavos FROM public.lancamentos_financeiros l
        WHERE l.estabelecimento_id=v_estab.id AND l.tipo='merchant_credit' AND l.valor_centavos>0
          AND l.status='concluido' AND l.semana_inicio<=p_semana_inicio
          AND NOT EXISTS(SELECT 1 FROM public.repasse_itens i WHERE i.lancamento_id=l.id AND i.liberado_em IS NULL);
      v_abater:=v_creditos-v_valor;
      FOR v_ajuste IN SELECT l.id,l.valor_centavos,COALESCE(a.consumido,0) AS consumido
        FROM public.lancamentos_financeiros l LEFT JOIN LATERAL (
          SELECT -SUM(i.valor_centavos) AS consumido FROM public.repasse_itens i
          WHERE i.lancamento_id=l.id AND i.liberado_em IS NULL
        ) a ON true
        WHERE l.estabelecimento_id=v_estab.id AND l.tipo='merchant_credit' AND l.valor_centavos<0 AND l.status='concluido'
        ORDER BY l.criado_em,l.id
      LOOP
        EXIT WHEN v_abater=0;
        v_restante:=LEAST(v_abater,-v_ajuste.valor_centavos-v_ajuste.consumido);
        IF v_restante>0 THEN
          INSERT INTO public.repasse_itens(repasse_id,lancamento_id,valor_centavos)
          VALUES(v_repasse.id,v_ajuste.id,-v_restante);
          v_abater:=v_abater-v_restante;
        END IF;
      END LOOP;
      IF v_abater<>0 OR (SELECT COALESCE(SUM(valor_centavos),0) FROM public.repasse_itens WHERE repasse_id=v_repasse.id)<>v_valor
        THEN RAISE EXCEPTION 'ALOCACAO_INCONSISTENTE'; END IF;
      INSERT INTO public.repasse_eventos(repasse_id,operacao_id,tipo,ator_id)
        VALUES(v_repasse.id,p_operacao_id,'preparacao',v_uid);
    END IF;
    INSERT INTO private.operacoes_preparacao_itens(operacao_id,repasse_id) VALUES(p_operacao_id,v_repasse.id);
  END LOOP;
  RETURN QUERY SELECT r.* FROM public.repasses r JOIN private.operacoes_preparacao_itens i ON i.repasse_id=r.id
    WHERE i.operacao_id=p_operacao_id ORDER BY r.estabelecimento_id;
END;
$$;
REVOKE ALL ON FUNCTION public.preparar_repasses_semanais(date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preparar_repasses_semanais(date,uuid) TO authenticated;

CREATE FUNCTION public.confirmar_repasse(p_repasse_id uuid,p_referencia text,p_operacao_id uuid)
RETURNS public.repasses LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid(); v_repasse public.repasses%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF p_operacao_id IS NULL THEN RAISE EXCEPTION 'OPERACAO_ID_OBRIGATORIO'; END IF;
  IF p_referencia IS NULL OR btrim(p_referencia)='' THEN RAISE EXCEPTION 'REFERENCIA_OBRIGATORIA'; END IF;
  SELECT * INTO v_repasse FROM public.repasses WHERE id=p_repasse_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPASSE_NAO_ENCONTRADO'; END IF;
  IF v_repasse.estado='pago' AND v_repasse.referencia=btrim(p_referencia) THEN RETURN v_repasse; END IF;
  IF v_repasse.estado NOT IN ('pendente','em_analise') THEN RAISE EXCEPTION 'ESTADO_INVALIDO'; END IF;
  IF EXISTS(SELECT 1 FROM public.repasses WHERE confirmacao_operacao_id=p_operacao_id AND id<>p_repasse_id)
    THEN RAISE EXCEPTION 'OPERACAO_ID_EM_USO'; END IF;
  INSERT INTO public.lancamentos_financeiros(estabelecimento_id,tipo,valor_centavos,status,repasse_id,
    asaas_id_externo,ator_admin_id,concluido_em,detalhe)
  VALUES(v_repasse.estabelecimento_id,'payout',-v_repasse.valor_centavos,'concluido',v_repasse.id,
    btrim(p_referencia),v_uid,now(),'Repasse semanal confirmado após PIX manual');
  UPDATE public.repasses SET estado='pago',confirmado_em=now(),confirmado_por=v_uid,
    confirmacao_operacao_id=p_operacao_id,referencia=btrim(p_referencia) WHERE id=p_repasse_id RETURNING * INTO v_repasse;
  INSERT INTO public.repasse_eventos(repasse_id,operacao_id,tipo,referencia,ator_id)
    VALUES(p_repasse_id,p_operacao_id,'confirmacao',btrim(p_referencia),v_uid);
  RETURN v_repasse;
END;
$$;
REVOKE ALL ON FUNCTION public.confirmar_repasse(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirmar_repasse(uuid,text,uuid) TO authenticated;

CREATE FUNCTION public.marcar_repasse_em_analise(p_repasse_id uuid,p_motivo text,p_operacao_id uuid)
RETURNS public.repasses LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid(); v_repasse public.repasses%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo)='' THEN RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'; END IF;
  IF p_operacao_id IS NULL THEN RAISE EXCEPTION 'OPERACAO_ID_OBRIGATORIO'; END IF;
  SELECT * INTO v_repasse FROM public.repasses WHERE id=p_repasse_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPASSE_NAO_ENCONTRADO'; END IF;
  IF EXISTS(SELECT 1 FROM public.repasse_eventos WHERE repasse_id=p_repasse_id AND operacao_id=p_operacao_id AND tipo='analise') THEN RETURN v_repasse; END IF;
  IF v_repasse.estado NOT IN ('pendente','em_analise') THEN RAISE EXCEPTION 'ESTADO_INVALIDO'; END IF;
  UPDATE public.repasses SET estado='em_analise' WHERE id=p_repasse_id RETURNING * INTO v_repasse;
  INSERT INTO public.repasse_eventos(repasse_id,operacao_id,tipo,motivo,ator_id)
    VALUES(p_repasse_id,p_operacao_id,'analise',btrim(p_motivo),v_uid);
  RETURN v_repasse;
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_repasse_em_analise(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marcar_repasse_em_analise(uuid,text,uuid) TO authenticated;

CREATE FUNCTION public.invalidar_repasse(p_repasse_id uuid,p_motivo text,p_operacao_id uuid)
RETURNS public.repasses LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid(); v_repasse public.repasses%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo)='' THEN RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'; END IF;
  IF p_operacao_id IS NULL THEN RAISE EXCEPTION 'OPERACAO_ID_OBRIGATORIO'; END IF;
  SELECT * INTO v_repasse FROM public.repasses WHERE id=p_repasse_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPASSE_NAO_ENCONTRADO'; END IF;
  IF v_repasse.estado='invalidado' AND v_repasse.invalidacao_operacao_id=p_operacao_id THEN RETURN v_repasse; END IF;
  IF v_repasse.estado<>'pendente' THEN RAISE EXCEPTION 'ESTADO_INVALIDO'; END IF;
  UPDATE public.repasses SET estado='invalidado',invalidado_em=now(),invalidado_por=v_uid,
    invalidacao_operacao_id=p_operacao_id,motivo_invalidacao=btrim(p_motivo) WHERE id=p_repasse_id RETURNING * INTO v_repasse;
  UPDATE public.repasse_itens SET liberado_em=now() WHERE repasse_id=p_repasse_id AND liberado_em IS NULL;
  INSERT INTO public.repasse_eventos(repasse_id,operacao_id,tipo,motivo,ator_id)
    VALUES(p_repasse_id,p_operacao_id,'invalidacao',btrim(p_motivo),v_uid);
  RETURN v_repasse;
END;
$$;
REVOKE ALL ON FUNCTION public.invalidar_repasse(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.invalidar_repasse(uuid,text,uuid) TO authenticated;

-- Projeção sem materialização: dívida antiga é aplicada às semanas ainda livres em ordem.
CREATE VIEW public.previsoes_repasse WITH (security_invoker=true) AS
WITH creditos AS (
  SELECT l.estabelecimento_id,l.semana_inicio,SUM(l.valor_centavos)::bigint AS bruto
  FROM public.lancamentos_financeiros l
  WHERE l.tipo='merchant_credit' AND l.valor_centavos>0 AND l.status='concluido' AND l.semana_inicio IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.repasse_itens i WHERE i.lancamento_id=l.id AND i.liberado_em IS NULL)
  GROUP BY l.estabelecimento_id,l.semana_inicio
), dividas AS (
  SELECT l.estabelecimento_id,
    COALESCE(SUM(GREATEST(0,-l.valor_centavos-COALESCE(a.consumido,0))),0)::bigint AS saldo
  FROM public.lancamentos_financeiros l LEFT JOIN LATERAL (
    SELECT -SUM(i.valor_centavos) AS consumido FROM public.repasse_itens i
    WHERE i.lancamento_id=l.id AND i.liberado_em IS NULL
  ) a ON true
  WHERE l.tipo='merchant_credit' AND l.valor_centavos<0 AND l.status='concluido'
  GROUP BY l.estabelecimento_id
), semanas AS (
  SELECT c.*,COALESCE(d.saldo,0) AS divida,
    COALESCE(SUM(c.bruto) OVER (PARTITION BY c.estabelecimento_id ORDER BY c.semana_inicio
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS credito_anterior
  FROM creditos c LEFT JOIN dividas d ON d.estabelecimento_id=c.estabelecimento_id
)
SELECT md5(s.estabelecimento_id::text||':'||s.semana_inicio::text)::uuid AS id,
  s.estabelecimento_id,s.semana_inicio,s.semana_inicio+11 AS previsto_para,
  GREATEST(0,s.bruto-GREATEST(0,s.divida-s.credito_anterior))::bigint AS valor_centavos
FROM semanas s JOIN public.estabelecimentos e ON e.id=s.estabelecimento_id
WHERE public.is_admin((select auth.uid())) OR e.dono_user_id=(select auth.uid());
REVOKE ALL ON public.previsoes_repasse FROM PUBLIC,anon;
GRANT SELECT ON public.previsoes_repasse TO authenticated;

-- Carteira mostra o direito por PIN e o montante já congelado para PIX, sem D+7.
CREATE OR REPLACE VIEW public.carteira_lojista WITH (security_invoker=true) AS
WITH lancamentos AS (
  SELECT l.estabelecimento_id,
    COALESCE(SUM(l.valor_centavos) FILTER (WHERE l.tipo='merchant_credit' AND l.status='concluido'
      OR l.tipo='payout' AND l.status<>'erro'),0) AS saldo_centavos,
    COALESCE(-SUM(l.valor_centavos) FILTER (WHERE l.tipo='payout' AND l.status='concluido'),0) AS pago_centavos,
    COALESCE(-SUM(l.valor_centavos) FILTER (WHERE l.tipo='merchant_credit' AND l.valor_centavos<0),0) AS debitado_centavos
  FROM public.lancamentos_financeiros l GROUP BY l.estabelecimento_id
), reservados AS (
  SELECT estabelecimento_id,COALESCE(SUM(valor_centavos),0) AS reservado_centavos
  FROM public.repasses WHERE estado IN ('pendente','em_analise') GROUP BY estabelecimento_id
)
SELECT e.id AS estabelecimento_id,
  (COALESCE(l.saldo_centavos,0)-COALESCE(r.reservado_centavos,0))/100.0 AS saldo_disponivel_reais,
  COALESCE(r.reservado_centavos,0)/100.0 AS saldo_bloqueado_reais,
  COALESCE(l.pago_centavos,0)/100.0 AS total_sacado_reais,
  COALESCE(l.debitado_centavos,0)/100.0 AS total_debitado_reais
FROM public.estabelecimentos e LEFT JOIN lancamentos l ON l.estabelecimento_id=e.id
LEFT JOIN reservados r ON r.estabelecimento_id=e.id
WHERE public.is_admin((select auth.uid())) OR e.dono_user_id=(select auth.uid());

-- A rota antiga não cria novos payouts fora do lote semanal.
CREATE OR REPLACE FUNCTION public.solicitar_saque(p_valor_centavos bigint)
RETURNS TABLE(lancamento_id uuid,estabelecimento_id uuid,valor_centavos bigint,status text,solicitado_em timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'SAQUES_DESATIVADOS_USE_REPASSE_SEMANAL'; END;
$$;
REVOKE ALL ON FUNCTION public.solicitar_saque(bigint) FROM PUBLIC,anon,authenticated;

COMMIT;
