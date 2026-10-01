BEGIN;

-- Cada tentativa de abertura aponta para o caso devolvido, inclusive quando já existia.
CREATE TABLE private.operacoes_abertura_solicitacao (
  operacao_id uuid PRIMARY KEY,
  solicitacao_id uuid NOT NULL REFERENCES public.solicitacoes_pedido(id) ON DELETE RESTRICT,
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  solicitante_id uuid NOT NULL REFERENCES auth.users(id)
);
CREATE INDEX operacoes_abertura_por_solicitacao ON private.operacoes_abertura_solicitacao(solicitacao_id);
INSERT INTO private.operacoes_abertura_solicitacao(operacao_id,solicitacao_id,pedido_id,tipo,solicitante_id)
SELECT operacao_id,id,pedido_id,tipo,solicitante_id FROM public.solicitacoes_pedido;

ALTER TABLE public.decisoes_solicitacao
  ADD COLUMN origem_decisao_id uuid REFERENCES public.decisoes_solicitacao(id) ON DELETE RESTRICT,
  ADD COLUMN evento text NOT NULL DEFAULT 'decisao' CHECK (evento IN ('decisao','pin','recusa','cancelamento_admin'));

CREATE OR REPLACE FUNCTION public.abrir_solicitacao_pedido(p_pedido_id uuid,p_tipo text,p_motivo text,p_operacao_id uuid)
RETURNS public.solicitacoes_pedido LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_pedido public.pedidos%ROWTYPE; v_caso public.solicitacoes_pedido%ROWTYPE;
  v_operacao private.operacoes_abertura_solicitacao%ROWTYPE;
  v_uid uuid := auth.uid(); v_agora timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'; END IF;
  IF p_operacao_id IS NULL THEN RAISE EXCEPTION 'OPERACAO_ID_OBRIGATORIO'; END IF;
  IF p_tipo NOT IN ('cancelamento','pos_entrega','cliente_ausente','lojista_ausente','atraso') OR p_tipo IS NULL THEN RAISE EXCEPTION 'TIPO_INVALIDO'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo)='' THEN RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'; END IF;
  SELECT * INTO v_pedido FROM public.pedidos WHERE id=p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'; END IF;
  IF p_tipo='cliente_ausente' THEN
    IF NOT EXISTS (SELECT 1 FROM public.estabelecimentos e WHERE e.id=v_pedido.estabelecimento_id AND e.dono_user_id=v_uid) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  ELSIF v_pedido.cliente_id<>v_uid THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  SELECT * INTO v_operacao FROM private.operacoes_abertura_solicitacao WHERE operacao_id=p_operacao_id;
  IF FOUND THEN
    IF v_operacao.pedido_id<>p_pedido_id OR v_operacao.tipo<>p_tipo OR v_operacao.solicitante_id<>v_uid THEN RAISE EXCEPTION 'OPERACAO_ID_EM_USO'; END IF;
    SELECT * INTO v_caso FROM public.solicitacoes_pedido WHERE id=v_operacao.solicitacao_id;
    RETURN v_caso;
  END IF;
  IF v_pedido.status IN ('cancelado','cancelado_timeout','cancelado_atraso','cancelado_admin','recusado','nao_retirado','nao_entregue_lojista','estornado_chargeback') THEN RAISE EXCEPTION 'ESTADO_INVALIDO'; END IF;
  IF (v_pedido.status='entregue') <> (p_tipo='pos_entrega') THEN RAISE EXCEPTION 'ESTADO_INVALIDO'; END IF;
  IF p_tipo='lojista_ausente' AND (v_pedido.status<>'no_hub' OR v_pedido.cliente_chegou_em IS NULL OR v_agora<=v_pedido.cliente_chegou_em + GREATEST(COALESCE(v_pedido.tempo_estimado_min,0),20)*interval '1 minute') THEN RAISE EXCEPTION 'TEMPO_MINIMO_NAO_ATINGIDO'; END IF;
  IF p_tipo='atraso' AND (v_pedido.status NOT IN ('aceito','em_preparo') OR v_pedido.aceito_em IS NULL OR v_pedido.tempo_estimado_min IS NULL OR v_agora<=v_pedido.aceito_em + 2*v_pedido.tempo_estimado_min*interval '1 minute') THEN RAISE EXCEPTION 'ATRASO_NAO_CONFIRMADO'; END IF;
  IF p_tipo='cliente_ausente' AND v_pedido.status<>'no_hub' THEN RAISE EXCEPTION 'ESTADO_INVALIDO'; END IF;
  SELECT * INTO v_caso FROM public.solicitacoes_pedido WHERE pedido_id=p_pedido_id AND tipo=p_tipo AND estado='aberta' ORDER BY criado_em,id LIMIT 1;
  IF NOT FOUND THEN
    IF p_tipo='cancelamento' AND v_pedido.status IN ('aguardando_pagamento','aguardando_aceite') THEN
      INSERT INTO public.solicitacoes_pedido(pedido_id,operacao_id,tipo,estado,motivo,solicitante_id,motivo_decisao,decisor_id,encerrada_em)
      VALUES(p_pedido_id,p_operacao_id,p_tipo,'aprovada',btrim(p_motivo),v_uid,'cancelamento antes do aceite',v_uid,v_agora) RETURNING * INTO v_caso;
      UPDATE public.pedidos SET status='cancelado',cancelado_em=v_agora,motivo_cancelamento=btrim(p_motivo) WHERE id=p_pedido_id;
      IF v_pedido.pago_em IS NOT NULL THEN
        INSERT INTO public.lancamentos_financeiros(estabelecimento_id,pedido_id,tipo,valor_centavos,status,detalhe)
        VALUES(v_pedido.estabelecimento_id,p_pedido_id,'refund',-round(v_pedido.total_pago_reais*100)::bigint,'pendente','Reembolso integral por cancelamento antes do aceite');
      END IF;
      INSERT INTO public.decisoes_solicitacao(solicitacao_id,operacao_id,aprovar,motivo,ator_id)
      VALUES(v_caso.id,p_operacao_id,true,'cancelamento antes do aceite',v_uid);
    ELSE
      INSERT INTO public.solicitacoes_pedido(pedido_id,operacao_id,tipo,estado,motivo,solicitante_id)
      VALUES(p_pedido_id,p_operacao_id,p_tipo,'aberta',btrim(p_motivo),v_uid) RETURNING * INTO v_caso;
    END IF;
  END IF;
  INSERT INTO private.operacoes_abertura_solicitacao(operacao_id,solicitacao_id,pedido_id,tipo,solicitante_id)
  VALUES(p_operacao_id,v_caso.id,p_pedido_id,p_tipo,v_uid);
  RETURN v_caso;
END;
$$;

CREATE OR REPLACE FUNCTION public.decidir_solicitacao_pedido(p_caso_id uuid,p_aprovar boolean,p_motivo text,p_valor_centavos integer,p_responsavel text,p_operacao_id uuid)
RETURNS public.solicitacoes_pedido LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_pedido public.pedidos%ROWTYPE; v_caso public.solicitacoes_pedido%ROWTYPE;
  v_uid uuid := auth.uid(); v_pedido_id uuid; v_agora timestamptz := now(); v_decisao_id uuid;
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
  IF p_aprovar AND v_caso.tipo='pos_entrega' AND (p_valor_centavos IS NULL OR p_valor_centavos<0 OR p_responsavel IS NULL OR p_responsavel NOT IN ('keepit','lojista')) THEN RAISE EXCEPTION 'VALOR_RESPONSABILIDADE_OBRIGATORIOS'; END IF;
  UPDATE public.solicitacoes_pedido SET estado=CASE WHEN p_aprovar THEN 'aprovada' ELSE 'negada' END,
    motivo_decisao=btrim(p_motivo),decisor_id=v_uid,encerrada_em=v_agora WHERE id=p_caso_id RETURNING * INTO v_caso;
  INSERT INTO public.decisoes_solicitacao(solicitacao_id,operacao_id,aprovar,motivo,valor_centavos,responsavel,ator_id)
  VALUES(p_caso_id,p_operacao_id,p_aprovar,btrim(p_motivo),p_valor_centavos,p_responsavel,v_uid) RETURNING id INTO v_decisao_id;
  IF p_aprovar AND v_caso.tipo<>'pos_entrega' THEN
    UPDATE public.pedidos SET status='cancelado_admin',cancelado_em=v_agora,motivo_cancelamento=btrim(p_motivo) WHERE id=v_pedido.id;
    IF v_pedido.pago_em IS NOT NULL THEN
      INSERT INTO public.lancamentos_financeiros(estabelecimento_id,pedido_id,tipo,valor_centavos,status,ator_admin_id,detalhe)
      VALUES(v_pedido.estabelecimento_id,v_pedido.id,'refund',-round(v_pedido.total_pago_reais*100)::bigint,'pendente',v_uid,'Reembolso integral por decisão de atendimento');
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

CREATE OR REPLACE FUNCTION public.confirmar_pin_pedido(p_pedido_id uuid,p_pin text)
RETURNS TABLE(resultado text,tentativas_restantes integer,bloqueado_ate timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_pedido_id uuid; v_resultado text; v_restantes integer; v_bloqueado timestamptz;
BEGIN
  SELECT id INTO v_pedido_id FROM public.pedidos WHERE id=p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'; END IF;
  SELECT p.resultado,p.tentativas_restantes,p.bloqueado_ate INTO v_resultado,v_restantes,v_bloqueado FROM private.confirmar_pin_pedido(p_pedido_id,p_pin) p;
  IF v_resultado='entregue' THEN
    WITH encerradas AS (
      UPDATE public.solicitacoes_pedido SET estado='encerrada_por_pin',encerrada_em=now(),motivo_decisao='entrega confirmada'
      WHERE pedido_id=p_pedido_id AND estado='aberta' AND tipo='cancelamento' RETURNING id
    ) INSERT INTO public.decisoes_solicitacao(solicitacao_id,operacao_id,aprovar,motivo,ator_id,evento)
      SELECT id,gen_random_uuid(),false,'entrega confirmada',auth.uid(),'pin' FROM encerradas;
  END IF;
  RETURN QUERY SELECT v_resultado,v_restantes,v_bloqueado;
END;
$$;

CREATE OR REPLACE FUNCTION public.recusar_pedido(p_pedido_id uuid,p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.pedidos WHERE id=p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'; END IF;
  v_id:=private.recusar_pedido(p_pedido_id,p_motivo);
  WITH encerradas AS (
    UPDATE public.solicitacoes_pedido SET estado='negada',motivo_decisao='pedido recusado pela loja',encerrada_em=now()
    WHERE pedido_id=p_pedido_id AND estado='aberta' RETURNING id
  ) INSERT INTO public.decisoes_solicitacao(solicitacao_id,operacao_id,aprovar,motivo,ator_id,evento)
    SELECT id,gen_random_uuid(),false,'pedido recusado pela loja',auth.uid(),'recusa' FROM encerradas;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.forcar_cancelamento_pedido(p_pedido_id uuid,p_motivo text)
RETURNS TABLE(pedido_id uuid,status text,refund_id uuid,refund_centavos bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid; v_status text; v_refund uuid; v_cent bigint; v_pago timestamptz;
BEGIN
  SELECT p.id,p.status,p.pago_em INTO v_id,v_status,v_pago FROM public.pedidos p WHERE p.id=p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'; END IF;
  IF v_pago IS NULL THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'; END IF;
    IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'NAO_AUTORIZADO'; END IF;
    IF p_motivo IS NULL OR btrim(p_motivo)='' THEN RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'; END IF;
    IF v_status NOT IN ('aguardando_pagamento','aguardando_aceite','aceito','em_preparo','saindo_hub','no_hub') THEN RAISE EXCEPTION 'ESTADO_INVALIDO'; END IF;
    UPDATE public.pedidos SET status='cancelado_admin',cancelado_em=now(),motivo_cancelamento=btrim(p_motivo) WHERE id=p_pedido_id;
    v_status:='cancelado_admin'; v_refund:=NULL; v_cent:=0;
  ELSE
    SELECT f.pedido_id,f.status,f.refund_id,f.refund_centavos INTO v_id,v_status,v_refund,v_cent
      FROM private.forcar_cancelamento_pedido(p_pedido_id,p_motivo) f;
  END IF;
  WITH encerradas AS (
    UPDATE public.solicitacoes_pedido SET estado='negada',motivo_decisao='pedido cancelado pelo Admin',encerrada_em=now()
    WHERE solicitacoes_pedido.pedido_id=p_pedido_id AND estado='aberta' RETURNING id
  ) INSERT INTO public.decisoes_solicitacao(solicitacao_id,operacao_id,aprovar,motivo,ator_id,evento)
    SELECT id,gen_random_uuid(),false,'pedido cancelado pelo Admin',auth.uid(),'cancelamento_admin' FROM encerradas;
  RETURN QUERY SELECT v_id,v_status,v_refund,v_cent;
END;
$$;

COMMIT;
