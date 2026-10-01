BEGIN;

ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN solicitacao_id uuid REFERENCES public.solicitacoes_pedido(id) ON DELETE RESTRICT,
  ADD COLUMN motivo_reembolso text,
  ADD COLUMN responsavel_reembolso text CHECK (responsavel_reembolso IN ('keepit','lojista')),
  ADD COLUMN aprovador_id uuid REFERENCES auth.users(id),
  ADD COLUMN operacao_confirmacao_id uuid,
  ADD COLUMN estado_reserva text NOT NULL DEFAULT 'ativa' CHECK (estado_reserva IN ('ativa','liberada')),
  ADD COLUMN liberada_em timestamptz,
  ADD COLUMN liberacao_motivo text,
  ADD COLUMN reembolso_origem_id uuid REFERENCES public.lancamentos_financeiros(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX reembolso_unico_por_solicitacao ON public.lancamentos_financeiros(solicitacao_id)
  WHERE tipo='refund' AND solicitacao_id IS NOT NULL;
CREATE UNIQUE INDEX reembolso_referencia_externa_unica ON public.lancamentos_financeiros(asaas_id_externo)
  WHERE tipo='refund' AND asaas_id_externo IS NOT NULL;
CREATE UNIQUE INDEX reembolso_confirmacao_operacao_unica ON public.lancamentos_financeiros(operacao_confirmacao_id)
  WHERE tipo='refund' AND operacao_confirmacao_id IS NOT NULL;
CREATE UNIQUE INDEX ajuste_reembolso_unico ON public.lancamentos_financeiros(reembolso_origem_id)
  WHERE tipo='merchant_credit' AND reembolso_origem_id IS NOT NULL;

UPDATE public.lancamentos_financeiros SET responsavel_reembolso='keepit',
  motivo_reembolso='cancelamento_admin' WHERE tipo='refund' AND responsavel_reembolso IS NULL;

CREATE OR REPLACE FUNCTION public.lancamento_financeiro_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.valor_centavos IS DISTINCT FROM OLD.valor_centavos
    OR NEW.tipo IS DISTINCT FROM OLD.tipo
    OR NEW.estabelecimento_id IS DISTINCT FROM OLD.estabelecimento_id
    OR NEW.pedido_id IS DISTINCT FROM OLD.pedido_id
    OR NEW.criado_em IS DISTINCT FROM OLD.criado_em
    OR NEW.disponivel_em IS DISTINCT FROM OLD.disponivel_em THEN
    RAISE EXCEPTION 'LANCAMENTO_IMUTAVEL';
  END IF;
  IF NEW.solicitacao_id IS DISTINCT FROM OLD.solicitacao_id
    OR NEW.motivo_reembolso IS DISTINCT FROM OLD.motivo_reembolso
    OR NEW.responsavel_reembolso IS DISTINCT FROM OLD.responsavel_reembolso
    OR NEW.aprovador_id IS DISTINCT FROM OLD.aprovador_id
    OR NEW.reembolso_origem_id IS DISTINCT FROM OLD.reembolso_origem_id THEN
    RAISE EXCEPTION 'REEMBOLSO_METADATA_IMUTAVEL';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE public.eventos_reembolso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id uuid NOT NULL REFERENCES public.lancamentos_financeiros(id) ON DELETE RESTRICT,
  operacao_id uuid UNIQUE,
  evento_externo_id text UNIQUE,
  tipo text NOT NULL CHECK (tipo IN ('aprovacao','falha','confirmacao','liberacao','reabertura','webhook')),
  referencia text,
  detalhe text,
  ator_id uuid REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.eventos_reembolso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_reembolso FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.eventos_reembolso FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.eventos_reembolso TO authenticated;
CREATE POLICY admin_le_eventos_reembolso ON public.eventos_reembolso FOR SELECT TO authenticated
  USING (public.is_admin((select auth.uid())));

CREATE TABLE public.despesas_reembolso (
  lancamento_id uuid PRIMARY KEY REFERENCES public.lancamentos_financeiros(id) ON DELETE RESTRICT,
  valor_centavos bigint NOT NULL CHECK (valor_centavos > 0),
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.despesas_reembolso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas_reembolso FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.despesas_reembolso FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.despesas_reembolso TO authenticated;
CREATE POLICY admin_le_despesas_reembolso ON public.despesas_reembolso FOR SELECT TO authenticated
  USING (public.is_admin((select auth.uid())));

-- O mesmo lock de pedidos usado por PIN/cancelamento serializa todas as reservas.
CREATE FUNCTION private.validar_reserva_reembolso() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_pedido public.pedidos%ROWTYPE; v_reservado bigint;
BEGIN
  IF NEW.tipo <> 'refund' THEN RETURN NEW; END IF;
  IF NEW.pedido_id IS NULL OR NEW.valor_centavos >= 0 THEN RAISE EXCEPTION 'VALOR_INVALIDO'; END IF;
  SELECT * INTO v_pedido FROM public.pedidos WHERE id=NEW.pedido_id FOR UPDATE;
  IF NOT FOUND OR v_pedido.pago_em IS NULL THEN RAISE EXCEPTION 'PAGAMENTO_NAO_CONFIRMADO'; END IF;
  SELECT COALESCE(sum(-valor_centavos),0) INTO v_reservado FROM public.lancamentos_financeiros
    WHERE pedido_id=NEW.pedido_id AND tipo='refund' AND estado_reserva='ativa';
  IF v_reservado + (-NEW.valor_centavos) > round(v_pedido.total_pago_reais*100)::bigint THEN
    RAISE EXCEPTION 'REEMBOLSO_EXCEDIDO';
  END IF;
  IF NEW.solicitacao_id IS NULL THEN
    SELECT id INTO NEW.solicitacao_id FROM public.solicitacoes_pedido
      WHERE pedido_id=NEW.pedido_id AND estado='aprovada' AND tipo<>'pos_entrega'
      ORDER BY encerrada_em DESC,id DESC LIMIT 1;
  END IF;
  IF NEW.responsavel_reembolso IS NULL THEN NEW.responsavel_reembolso:='keepit'; END IF;
  IF NEW.motivo_reembolso IS NULL THEN
    NEW.motivo_reembolso:=CASE v_pedido.status
      WHEN 'cancelado' THEN 'cancelamento_cliente_pre_aceite'
      WHEN 'cancelado_timeout' THEN 'timeout_aceite'
      WHEN 'recusado' THEN 'recusa_lojista'
      WHEN 'cancelado_atraso' THEN 'cancelamento_atraso'
      WHEN 'nao_retirado' THEN 'nao_retirado_cliente'
      WHEN 'nao_entregue_lojista' THEN 'nao_entregue_lojista'
      ELSE 'cancelamento_admin' END;
  END IF;
  IF NEW.aprovador_id IS NULL THEN NEW.aprovador_id:=auth.uid(); END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validar_reserva_reembolso BEFORE INSERT ON public.lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION private.validar_reserva_reembolso();

CREATE FUNCTION public.saldo_reembolsavel(p_pedido_id uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_pago bigint; v_reservado bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  SELECT CASE WHEN pago_em IS NULL THEN 0 ELSE round(total_pago_reais*100)::bigint END INTO v_pago
    FROM public.pedidos WHERE id=p_pedido_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'; END IF;
  SELECT COALESCE(sum(-valor_centavos),0) INTO v_reservado FROM public.lancamentos_financeiros
    WHERE pedido_id=p_pedido_id AND tipo='refund' AND estado_reserva='ativa';
  RETURN v_pago-v_reservado;
END;
$$;
REVOKE ALL ON FUNCTION public.saldo_reembolsavel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saldo_reembolsavel(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.decidir_solicitacao_pedido(p_caso_id uuid,p_aprovar boolean,p_motivo text,p_valor_centavos integer,p_responsavel text,p_operacao_id uuid)
RETURNS public.solicitacoes_pedido LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_pedido public.pedidos%ROWTYPE; v_caso public.solicitacoes_pedido%ROWTYPE;
  v_uid uuid := auth.uid(); v_pedido_id uuid; v_agora timestamptz := now(); v_decisao_id uuid;
  v_refund_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF p_operacao_id IS NULL THEN RAISE EXCEPTION 'OPERACAO_ID_OBRIGATORIO'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo)='' THEN RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'; END IF;
  SELECT pedido_id INTO v_pedido_id FROM public.solicitacoes_pedido WHERE id=p_caso_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOLICITACAO_NAO_ENCONTRADA'; END IF;
  SELECT * INTO v_pedido FROM public.pedidos WHERE id=v_pedido_id FOR UPDATE;
  SELECT * INTO v_caso FROM public.solicitacoes_pedido WHERE id=p_caso_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.decisoes_solicitacao d WHERE d.operacao_id=p_operacao_id AND d.solicitacao_id=p_caso_id) THEN RETURN v_caso; END IF;
  IF v_caso.estado<>'aberta' THEN RAISE EXCEPTION 'ESTADO_INVALIDO'; END IF;
  IF p_aprovar IS NULL THEN RAISE EXCEPTION 'DECISAO_OBRIGATORIA'; END IF;
  IF p_aprovar AND v_caso.tipo<>'pos_entrega' AND v_pedido.status IN ('entregue','cancelado','cancelado_timeout','cancelado_atraso','cancelado_admin','recusado','nao_retirado','nao_entregue_lojista','estornado_chargeback') THEN RAISE EXCEPTION 'ESTADO_INVALIDO'; END IF;
  IF p_aprovar AND v_caso.tipo='pos_entrega' THEN
    IF v_pedido.status<>'entregue' THEN RAISE EXCEPTION 'ESTADO_INVALIDO'; END IF;
    IF p_valor_centavos IS NULL OR p_valor_centavos<=0 OR p_responsavel IS NULL OR p_responsavel NOT IN ('keepit','lojista') THEN RAISE EXCEPTION 'VALOR_RESPONSABILIDADE_OBRIGATORIOS'; END IF;
    IF v_pedido.pago_em IS NULL THEN RAISE EXCEPTION 'PAGAMENTO_NAO_CONFIRMADO'; END IF;
  END IF;
  UPDATE public.solicitacoes_pedido SET estado=CASE WHEN p_aprovar THEN 'aprovada' ELSE 'negada' END,
    motivo_decisao=btrim(p_motivo),decisor_id=v_uid,encerrada_em=v_agora WHERE id=p_caso_id RETURNING * INTO v_caso;
  INSERT INTO public.decisoes_solicitacao(solicitacao_id,operacao_id,aprovar,motivo,valor_centavos,responsavel,ator_id)
  VALUES(p_caso_id,p_operacao_id,p_aprovar,btrim(p_motivo),p_valor_centavos,p_responsavel,v_uid) RETURNING id INTO v_decisao_id;
  IF p_aprovar AND v_caso.tipo='pos_entrega' THEN
    INSERT INTO public.lancamentos_financeiros(estabelecimento_id,pedido_id,tipo,valor_centavos,status,ator_admin_id,detalhe,solicitacao_id,motivo_reembolso,responsavel_reembolso,aprovador_id)
    VALUES(v_pedido.estabelecimento_id,v_pedido.id,'refund',-p_valor_centavos,'pendente',v_uid,btrim(p_motivo),p_caso_id,'pos_entrega',p_responsavel,v_uid)
    RETURNING id INTO v_refund_id;
    INSERT INTO public.eventos_reembolso(lancamento_id,operacao_id,tipo,detalhe,ator_id)
    VALUES(v_refund_id,p_operacao_id,'aprovacao',btrim(p_motivo),v_uid);
  ELSIF p_aprovar THEN
    UPDATE public.pedidos SET status='cancelado_admin',cancelado_em=v_agora,motivo_cancelamento=btrim(p_motivo) WHERE id=v_pedido.id;
    IF v_pedido.pago_em IS NOT NULL THEN
      INSERT INTO public.lancamentos_financeiros(estabelecimento_id,pedido_id,tipo,valor_centavos,status,ator_admin_id,detalhe,solicitacao_id,motivo_reembolso,responsavel_reembolso,aprovador_id)
      VALUES(v_pedido.estabelecimento_id,v_pedido.id,'refund',-round(v_pedido.total_pago_reais*100)::bigint,'pendente',v_uid,'Reembolso integral por decisão de atendimento',p_caso_id,'cancelamento_admin','keepit',v_uid)
      RETURNING id INTO v_refund_id;
      INSERT INTO public.eventos_reembolso(lancamento_id,operacao_id,tipo,detalhe,ator_id)
      VALUES(v_refund_id,p_operacao_id,'aprovacao',btrim(p_motivo),v_uid);
    END IF;
    WITH encerradas AS (
      UPDATE public.solicitacoes_pedido SET estado='negada',motivo_decisao='pedido cancelado por decisão administrativa',decisor_id=v_uid,encerrada_em=v_agora
      WHERE pedido_id=v_pedido.id AND id<>p_caso_id AND estado='aberta' RETURNING id
    ) INSERT INTO public.decisoes_solicitacao(solicitacao_id,operacao_id,aprovar,motivo,ator_id,origem_decisao_id)
      SELECT id,gen_random_uuid(),false,'pedido cancelado por decisão administrativa',v_uid,v_decisao_id FROM encerradas;
  END IF;
  RETURN v_caso;
END;
$$;

CREATE FUNCTION private.conciliar_reembolso(
  p_lancamento_id uuid,p_resultado text,p_referencia text,p_operacao_id uuid,p_detalhe text,p_ator_id uuid,p_evento_externo_id text DEFAULT NULL
) RETURNS public.lancamentos_financeiros LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_pedido_id uuid; v_lancamento public.lancamentos_financeiros%ROWTYPE; v_tipo text;
BEGIN
  IF p_resultado NOT IN ('concluido','erro') OR p_resultado IS NULL THEN RAISE EXCEPTION 'RESULTADO_INVALIDO'; END IF;
  IF p_resultado='concluido' AND (p_referencia IS NULL OR btrim(p_referencia)='') THEN RAISE EXCEPTION 'REFERENCIA_OBRIGATORIA'; END IF;
  IF p_resultado='erro' AND (p_detalhe IS NULL OR btrim(p_detalhe)='') THEN RAISE EXCEPTION 'DETALHE_OBRIGATORIO'; END IF;
  SELECT pedido_id INTO v_pedido_id FROM public.lancamentos_financeiros WHERE id=p_lancamento_id AND tipo='refund';
  IF NOT FOUND THEN RAISE EXCEPTION 'REEMBOLSO_NAO_ENCONTRADO'; END IF;
  PERFORM 1 FROM public.pedidos WHERE id=v_pedido_id FOR UPDATE;
  SELECT * INTO v_lancamento FROM public.lancamentos_financeiros WHERE id=p_lancamento_id FOR UPDATE;
  IF v_lancamento.estado_reserva<>'ativa' THEN RAISE EXCEPTION 'RESERVA_LIBERADA'; END IF;
  IF p_operacao_id IS NOT NULL THEN
    SELECT tipo INTO v_tipo FROM public.eventos_reembolso WHERE operacao_id=p_operacao_id AND lancamento_id=p_lancamento_id;
    IF FOUND THEN
      IF v_tipo<>(CASE WHEN p_resultado='erro' THEN 'falha' ELSE 'confirmacao' END) THEN RAISE EXCEPTION 'OPERACAO_ID_EM_USO'; END IF;
      RETURN v_lancamento;
    END IF;
    IF EXISTS(SELECT 1 FROM public.eventos_reembolso WHERE operacao_id=p_operacao_id) THEN RAISE EXCEPTION 'OPERACAO_ID_EM_USO'; END IF;
  END IF;
  IF v_lancamento.asaas_id_externo IS NOT NULL AND p_referencia IS NOT NULL AND v_lancamento.asaas_id_externo<>btrim(p_referencia) THEN
    RAISE EXCEPTION 'REFERENCIA_DIVERGENTE';
  END IF;
  IF v_lancamento.status='concluido' THEN
    IF p_resultado<>'concluido' THEN RAISE EXCEPTION 'ESTADO_INVALIDO'; END IF;
    RETURN v_lancamento;
  END IF;
  UPDATE public.lancamentos_financeiros SET status=p_resultado,
    asaas_id_externo=COALESCE(asaas_id_externo,NULLIF(btrim(p_referencia),'')),
    ator_admin_id=COALESCE(p_ator_id,ator_admin_id),
    detalhe=COALESCE(NULLIF(btrim(p_detalhe),''),detalhe),
    concluido_em=CASE WHEN p_resultado='concluido' THEN now() ELSE NULL END,
    operacao_confirmacao_id=CASE WHEN p_resultado='concluido' THEN p_operacao_id ELSE operacao_confirmacao_id END
    WHERE id=p_lancamento_id RETURNING * INTO v_lancamento;
  INSERT INTO public.eventos_reembolso(lancamento_id,operacao_id,evento_externo_id,tipo,referencia,detalhe,ator_id)
  VALUES(p_lancamento_id,p_operacao_id,p_evento_externo_id,
    CASE WHEN p_evento_externo_id IS NOT NULL THEN 'webhook' WHEN p_resultado='erro' THEN 'falha' ELSE 'confirmacao' END,
    p_referencia,p_detalhe,p_ator_id);
  IF p_resultado='concluido' THEN
    IF v_lancamento.responsavel_reembolso='lojista' THEN
      INSERT INTO public.lancamentos_financeiros(estabelecimento_id,pedido_id,tipo,valor_centavos,status,ator_admin_id,detalhe,reembolso_origem_id)
      VALUES(v_lancamento.estabelecimento_id,v_lancamento.pedido_id,'merchant_credit',v_lancamento.valor_centavos,'concluido',p_ator_id,
        'Responsabilidade por devolução confirmada',v_lancamento.id)
      ON CONFLICT (reembolso_origem_id) WHERE tipo='merchant_credit' AND reembolso_origem_id IS NOT NULL DO NOTHING;
    ELSE
      INSERT INTO public.despesas_reembolso(lancamento_id,valor_centavos)
      VALUES(v_lancamento.id,-v_lancamento.valor_centavos) ON CONFLICT (lancamento_id) DO NOTHING;
    END IF;
  END IF;
  RETURN v_lancamento;
END;
$$;
REVOKE ALL ON FUNCTION private.conciliar_reembolso(uuid,text,text,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.registrar_execucao_reembolso(
  p_lancamento_id uuid,p_resultado text,p_referencia text,p_operacao_id uuid,p_detalhe text DEFAULT NULL
) RETURNS public.lancamentos_financeiros LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF p_operacao_id IS NULL THEN RAISE EXCEPTION 'OPERACAO_ID_OBRIGATORIO'; END IF;
  RETURN private.conciliar_reembolso(p_lancamento_id,p_resultado,p_referencia,p_operacao_id,p_detalhe,auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_execucao_reembolso(uuid,text,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.registrar_execucao_reembolso(uuid,text,text,uuid,text) TO authenticated;

CREATE FUNCTION public.confirmar_reembolso(p_caso_id uuid,p_referencia text,p_operacao_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_pedido_id uuid; v_refund_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  SELECT pedido_id INTO v_pedido_id FROM public.solicitacoes_pedido WHERE id=p_caso_id AND estado='aprovada';
  IF NOT FOUND THEN RAISE EXCEPTION 'SOLICITACAO_NAO_APROVADA'; END IF;
  SELECT id INTO v_refund_id FROM public.lancamentos_financeiros
    WHERE solicitacao_id=p_caso_id AND tipo='refund';
  IF NOT FOUND THEN RAISE EXCEPTION 'REEMBOLSO_NAO_ENCONTRADO'; END IF;
  PERFORM private.conciliar_reembolso(v_refund_id,'concluido',p_referencia,p_operacao_id,NULL,auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.confirmar_reembolso(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirmar_reembolso(uuid,text,uuid) TO authenticated;

CREATE FUNCTION public.liberar_reserva_reembolso(p_lancamento_id uuid,p_comprovacao text,p_operacao_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_pedido_id uuid; v_lancamento public.lancamentos_financeiros%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF p_comprovacao IS NULL OR btrim(p_comprovacao)='' OR p_operacao_id IS NULL THEN RAISE EXCEPTION 'COMPROVACAO_OBRIGATORIA'; END IF;
  SELECT pedido_id INTO v_pedido_id FROM public.lancamentos_financeiros WHERE id=p_lancamento_id AND tipo='refund';
  IF NOT FOUND THEN RAISE EXCEPTION 'REEMBOLSO_NAO_ENCONTRADO'; END IF;
  PERFORM 1 FROM public.pedidos WHERE id=v_pedido_id FOR UPDATE;
  SELECT * INTO v_lancamento FROM public.lancamentos_financeiros WHERE id=p_lancamento_id FOR UPDATE;
  IF v_lancamento.estado_reserva='liberada' THEN
    IF EXISTS(SELECT 1 FROM public.eventos_reembolso WHERE operacao_id=p_operacao_id AND lancamento_id=p_lancamento_id AND tipo='liberacao') THEN RETURN; END IF;
    RAISE EXCEPTION 'RESERVA_JA_LIBERADA';
  END IF;
  IF v_lancamento.status='concluido' THEN RAISE EXCEPTION 'CONCILIACAO_NECESSARIA'; END IF;
  UPDATE public.lancamentos_financeiros SET estado_reserva='liberada',status='erro',liberada_em=now(),liberacao_motivo=btrim(p_comprovacao)
    WHERE id=p_lancamento_id;
  INSERT INTO public.eventos_reembolso(lancamento_id,operacao_id,tipo,referencia,detalhe,ator_id)
    VALUES(p_lancamento_id,p_operacao_id,'liberacao',v_lancamento.asaas_id_externo,btrim(p_comprovacao),auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.liberar_reserva_reembolso(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.liberar_reserva_reembolso(uuid,text,uuid) TO authenticated;

CREATE FUNCTION public.reabrir_execucao_reembolso(p_lancamento_id uuid,p_comprovacao text,p_operacao_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_pedido_id uuid; v_lancamento public.lancamentos_financeiros%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF p_comprovacao IS NULL OR btrim(p_comprovacao)='' OR p_operacao_id IS NULL THEN RAISE EXCEPTION 'COMPROVACAO_OBRIGATORIA'; END IF;
  SELECT pedido_id INTO v_pedido_id FROM public.lancamentos_financeiros WHERE id=p_lancamento_id AND tipo='refund';
  IF NOT FOUND THEN RAISE EXCEPTION 'REEMBOLSO_NAO_ENCONTRADO'; END IF;
  PERFORM 1 FROM public.pedidos WHERE id=v_pedido_id FOR UPDATE;
  SELECT * INTO v_lancamento FROM public.lancamentos_financeiros WHERE id=p_lancamento_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.eventos_reembolso WHERE operacao_id=p_operacao_id AND lancamento_id=p_lancamento_id AND tipo='reabertura') THEN RETURN; END IF;
  IF v_lancamento.estado_reserva<>'ativa' OR v_lancamento.status<>'erro' THEN RAISE EXCEPTION 'ESTADO_INVALIDO'; END IF;
  UPDATE public.lancamentos_financeiros SET status='pendente',asaas_id_externo=NULL,
    detalhe='Execução reaberta após comprovação: '||btrim(p_comprovacao),concluido_em=NULL
    WHERE id=p_lancamento_id;
  INSERT INTO public.eventos_reembolso(lancamento_id,operacao_id,tipo,referencia,detalhe,ator_id)
    VALUES(p_lancamento_id,p_operacao_id,'reabertura',v_lancamento.asaas_id_externo,btrim(p_comprovacao),auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.reabrir_execucao_reembolso(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reabrir_execucao_reembolso(uuid,text,uuid) TO authenticated;

ALTER TABLE public.eventos_pagamento ADD COLUMN reembolso_externo_id text;

CREATE OR REPLACE FUNCTION public.processar_evento_reembolso(
  p_evento_id text,p_evento text,p_cobranca_id text,p_reembolso_id text,p_valor_centavos bigint,p_metodo text,p_referencia text
) RETURNS TABLE(resultado text,pedido_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_evento public.eventos_pagamento%ROWTYPE; v_tentativa public.tentativas_pagamento%ROWTYPE;
  v_pedido public.pedidos%ROWTYPE; v_refund_id uuid; v_candidatos integer; v_erro text; v_resultado text;
BEGIN
  IF p_evento_id IS NULL OR btrim(p_evento_id)='' OR p_evento NOT IN
    ('PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED','PAYMENT_REFUND_IN_PROGRESS','PAYMENT_REFUND_DENIED')
    THEN RAISE EXCEPTION 'EVENTO_INVALIDO'; END IF;
  INSERT INTO public.eventos_pagamento(evento_externo_id,tipo,cobranca_id,referencia,valor_centavos,metodo,reembolso_externo_id)
    VALUES(p_evento_id,p_evento,p_cobranca_id,p_referencia,p_valor_centavos,p_metodo,p_reembolso_id)
    ON CONFLICT(evento_externo_id) DO NOTHING;
  SELECT * INTO v_evento FROM public.eventos_pagamento WHERE evento_externo_id=p_evento_id FOR UPDATE;
  IF v_evento.tipo<>p_evento OR v_evento.cobranca_id IS DISTINCT FROM p_cobranca_id
    OR v_evento.reembolso_externo_id IS DISTINCT FROM p_reembolso_id
    OR v_evento.valor_centavos IS DISTINCT FROM p_valor_centavos THEN RAISE EXCEPTION 'EVENTO_DIVERGENTE'; END IF;
  IF v_evento.processado_em IS NOT NULL THEN RETURN QUERY SELECT v_evento.resultado,v_evento.pedido_id; RETURN; END IF;
  SELECT * INTO v_tentativa FROM public.tentativas_pagamento WHERE asaas_payment_id=p_cobranca_id;
  IF NOT FOUND THEN
    UPDATE public.eventos_pagamento SET resultado='aguardando_vinculo',erro_codigo='COBRANCA_AGUARDANDO_VINCULO'
      WHERE id=v_evento.id;
    RETURN QUERY SELECT 'aguardando_vinculo'::text,NULL::uuid; RETURN;
  END IF;
  SELECT * INTO v_pedido FROM public.pedidos WHERE id=v_tentativa.pedido_id FOR UPDATE;
  IF p_referencia IS NOT NULL AND p_referencia<>v_tentativa.id::text THEN v_erro:='REFERENCIA_DIVERGENTE'; END IF;
  IF p_metodo IS NOT NULL AND p_metodo<>v_tentativa.forma THEN v_erro:='METODO_DIVERGENTE'; END IF;
  IF p_reembolso_id IS NULL OR btrim(p_reembolso_id)='' OR p_valor_centavos IS NULL OR p_valor_centavos<=0
    THEN v_erro:='REEMBOLSO_IDENTIDADE_INVALIDA'; END IF;
  IF v_erro IS NULL THEN
    SELECT lf.id INTO v_refund_id FROM public.lancamentos_financeiros lf
      WHERE lf.pedido_id=v_pedido.id AND lf.tipo='refund' AND lf.asaas_id_externo=p_reembolso_id;
    IF v_refund_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.lancamentos_financeiros lf WHERE lf.id=v_refund_id
        AND lf.estado_reserva='ativa' AND -lf.valor_centavos=p_valor_centavos) THEN v_erro:='VALOR_DIVERGENTE'; END IF;
    ELSE
      SELECT count(*)::integer,min(lf.id::text)::uuid INTO v_candidatos,v_refund_id FROM public.lancamentos_financeiros lf
        WHERE lf.pedido_id=v_pedido.id AND lf.tipo='refund' AND lf.estado_reserva='ativa'
          AND lf.status IN ('pendente','erro') AND lf.asaas_id_externo IS NULL AND -lf.valor_centavos=p_valor_centavos;
      IF v_candidatos<>1 THEN v_erro:='REEMBOLSO_AMBIGUO'; END IF;
    END IF;
  END IF;
  IF v_erro IS NULL AND p_evento='PAYMENT_REFUND_DENIED' AND EXISTS (
    SELECT 1 FROM public.lancamentos_financeiros lf WHERE lf.id=v_refund_id AND lf.status='concluido'
  ) THEN v_erro:='ESTADO_DIVERGENTE'; END IF;
  IF v_erro IS NOT NULL THEN
    v_resultado:='conciliacao_necessaria';
  ELSIF p_evento='PAYMENT_REFUND_IN_PROGRESS' THEN
    v_resultado:='estorno_em_processamento';
  ELSIF p_evento='PAYMENT_REFUND_DENIED' THEN
    PERFORM private.conciliar_reembolso(v_refund_id,'erro',p_reembolso_id,NULL,'Estorno negado pelo gateway',NULL,p_evento_id);
    v_resultado:='falha_registrada';
  ELSE
    PERFORM private.conciliar_reembolso(v_refund_id,'concluido',p_reembolso_id,NULL,NULL,NULL,p_evento_id);
    v_resultado:='reembolso_conciliado';
  END IF;
  UPDATE public.eventos_pagamento SET tentativa_id=v_tentativa.id,pedido_id=v_pedido.id,
    resultado=v_resultado,erro_codigo=v_erro,processado_em=now() WHERE id=v_evento.id;
  IF v_erro IS NOT NULL THEN
    INSERT INTO public.ocorrencias_pagamento(evento_pagamento_id,tentativa_id,pedido_id,tipo,referencia_externa,detalhe)
    VALUES(v_evento.id,v_tentativa.id,v_pedido.id,'estorno',p_reembolso_id,v_erro)
    ON CONFLICT(evento_pagamento_id) DO NOTHING;
  END IF;
  RETURN QUERY SELECT v_resultado,v_pedido.id;
END;
$$;
REVOKE ALL ON FUNCTION public.processar_evento_reembolso(text,text,text,text,bigint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.processar_evento_reembolso(text,text,text,text,bigint,text,text) TO service_role;

-- Clientes antigos da fila passam pela mesma confirmação; payout mantém o fluxo anterior.
ALTER FUNCTION public.confirmar_lancamento_admin(uuid,text,text,text) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.confirmar_lancamento_admin(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.confirmar_lancamento_admin(
  p_lancamento_id uuid,p_resultado text,p_detalhe text DEFAULT NULL,p_asaas_id_externo text DEFAULT NULL
) RETURNS TABLE(lancamento_id uuid,tipo text,status text,ator_admin_id uuid,concluido_em timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_tipo text; v_lancamento public.lancamentos_financeiros%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'NAO_AUTORIZADO'; END IF;
  SELECT lf.tipo INTO v_tipo FROM public.lancamentos_financeiros lf WHERE lf.id=p_lancamento_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LANCAMENTO_NAO_ENCONTRADO'; END IF;
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
REVOKE ALL ON FUNCTION public.confirmar_lancamento_admin(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirmar_lancamento_admin(uuid,text,text,text) TO authenticated;

COMMIT;
