-- Repair the saved-card invariant after a confirmed gateway token invalidation.
-- Keep this incremental: 20261015111000_cartoes_operacoes.sql may already be
-- applied outside a disposable local stack.
CREATE OR REPLACE FUNCTION private.invalidar_cartao_operacao(
  p_cliente_id uuid,
  p_cartao_id uuid,
  p_operacao_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_op private.cartoes_operacoes%ROWTYPE;
  v_attempt public.tentativas_pagamento%ROWTYPE;
  v_was_principal boolean;
BEGIN
  PERFORM private.exigir_cliente_cartao_ativo(p_cliente_id);

  -- Management RPCs and this service-only invalidation serialize all
  -- principal-card changes through the same client row.
  PERFORM 1 FROM public.clientes WHERE id=p_cliente_id FOR UPDATE;

  SELECT * INTO v_op
  FROM private.cartoes_operacoes
  WHERE cliente_id=p_cliente_id AND operacao_id=p_operacao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPERACAO_INDISPONIVEL'; END IF;
  IF p_cartao_id IS NULL THEN RAISE EXCEPTION 'OPERACAO_DIVERGENTE'; END IF;

  -- A completed invalidation remains replayable after its attempt was closed.
  IF v_op.estado='invalidada' THEN
    RETURN private.projetar_operacao_cartao(v_op);
  END IF;

  -- Keep the attempt → operation lock order used by the payment finalizer.
  -- A confirmed invalid token has no external payment reference, so closing
  -- this linked attempt is safe and must commit with the card deletion.
  IF v_op.tentativa_id IS NOT NULL THEN
    PERFORM 1 FROM public.pedidos p
    JOIN public.tentativas_pagamento t ON t.pedido_id=p.id
    WHERE t.id=v_op.tentativa_id
    FOR UPDATE OF p;
    SELECT * INTO v_attempt FROM public.tentativas_pagamento
    WHERE id=v_op.tentativa_id FOR UPDATE;
    IF NOT FOUND OR v_attempt.asaas_payment_id IS NOT NULL
      OR v_attempt.estado NOT IN ('criando','pendente','reconciliacao') THEN
      RAISE EXCEPTION 'TENTATIVA_DIVERGENTE';
    END IF;
  END IF;

  SELECT * INTO v_op
  FROM private.cartoes_operacoes
  WHERE id=v_op.id
  FOR UPDATE;
  IF v_op.cartao_salvo_id IS DISTINCT FROM p_cartao_id THEN
    RAISE EXCEPTION 'OPERACAO_DIVERGENTE';
  END IF;

  SELECT principal INTO v_was_principal
  FROM public.clientes_cartoes
  WHERE id=p_cartao_id AND cliente_id=p_cliente_id AND ambiente=v_op.ambiente
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CARTAO_INDISPONIVEL'; END IF;

  DELETE FROM public.clientes_cartoes
  WHERE id=p_cartao_id AND cliente_id=p_cliente_id AND ambiente=v_op.ambiente;

  IF v_was_principal AND NOT EXISTS (
    SELECT 1 FROM public.clientes_cartoes c
    WHERE c.cliente_id=p_cliente_id AND c.principal
  ) THEN
    UPDATE public.clientes_cartoes c
    SET principal=true
    WHERE c.id=(
      SELECT s.id FROM public.clientes_cartoes s
      WHERE s.cliente_id=p_cliente_id
      ORDER BY s.created_at,s.id
      LIMIT 1
    );
  END IF;

  UPDATE private.cartoes_operacoes
  SET estado='invalidada',aviso_codigo='CARTAO_INVALIDADO',updated_at=now()
  WHERE id=v_op.id
  RETURNING * INTO v_op;
  IF v_op.tentativa_id IS NOT NULL THEN
    UPDATE public.tentativas_pagamento
    SET estado='recusado',encerrada_em=now(),claim_token=NULL,claim_expira_em=NULL
    WHERE id=v_op.tentativa_id;
  END IF;
  RETURN private.projetar_operacao_cartao(v_op);
END;
$$;

-- Persisting authorization before an external POST makes the ordering with a
-- customer removal explicit: removal first makes lookup fail; authorization
-- first leaves a durable in-progress operation that removal cannot cancel.
CREATE OR REPLACE FUNCTION private.obter_cartao_operacao(
  p_cliente_id uuid,
  p_cartao_id uuid,
  p_ambiente text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.clientes_cartoes%ROWTYPE;
BEGIN
  PERFORM private.exigir_cliente_cartao_ativo(p_cliente_id);
  PERFORM 1 FROM public.clientes WHERE id=p_cliente_id FOR UPDATE;
  SELECT * INTO c FROM public.clientes_cartoes
  WHERE id=p_cartao_id AND cliente_id=p_cliente_id AND ambiente=p_ambiente
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CARTAO_INDISPONIVEL'; END IF;
  UPDATE private.cartoes_operacoes
  SET estado='processando',updated_at=now()
  WHERE cliente_id=p_cliente_id AND cartao_salvo_id=p_cartao_id
    AND ambiente=p_ambiente AND estado='preparada';
  RETURN jsonb_build_object('id',c.id,'customerId',c.asaas_customer_id,'token',c.asaas_credit_card_token,'bandeira',c.bandeira,'ultimo4',c.ultimo4);
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_cartao_cliente(p_cartao_id uuid, p_operacao_id uuid)
RETURNS TABLE(id uuid, bandeira text, ultimo4 text, principal boolean, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := private.cliente_gestao_cartoes();
BEGIN
  PERFORM 1 FROM public.clientes WHERE clientes.id=v_uid FOR UPDATE;
  IF private.registrar_gestao_cartao(v_uid,p_cartao_id,p_operacao_id,'remover') THEN
    IF EXISTS (
      SELECT 1 FROM private.cartoes_operacoes o
      WHERE o.cliente_id=v_uid AND o.cartao_salvo_id=p_cartao_id
        AND o.estado='processando'
    ) THEN RAISE EXCEPTION 'CARTAO_EM_USO'; END IF;
    DELETE FROM public.clientes_cartoes c WHERE c.cliente_id=v_uid AND c.id=p_cartao_id;
    IF NOT EXISTS (SELECT 1 FROM public.clientes_cartoes c WHERE c.cliente_id=v_uid AND c.principal) THEN
      UPDATE public.clientes_cartoes c SET principal=true WHERE c.id=(
        SELECT s.id FROM public.clientes_cartoes s WHERE s.cliente_id=v_uid
        ORDER BY s.created_at,s.id LIMIT 1
      );
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.listar_cartoes_cliente();
END;
$$;

-- Saved-card uses do not persist token metadata, but they still need to leave
-- `processando` when the authoritative payment result arrives; otherwise a
-- completed use would block a later customer-requested removal forever.
CREATE OR REPLACE FUNCTION private.finalizar_compra_cartao(p_operacao_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op private.cartoes_operacoes%ROWTYPE; v_attempt public.tentativas_pagamento%ROWTYPE; v_tentativa_id uuid;
BEGIN
  SELECT tentativa_id INTO v_tentativa_id FROM private.cartoes_operacoes WHERE operacao_id=p_operacao_id;
  IF v_tentativa_id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_attempt FROM public.tentativas_pagamento WHERE id=v_tentativa_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_op FROM private.cartoes_operacoes WHERE operacao_id=p_operacao_id FOR UPDATE;
  IF NOT FOUND OR v_op.contexto<>'compra' OR v_op.estado IN ('concluida','recusada','invalidada') THEN RETURN; END IF;
  IF v_attempt.estado IN ('recusado','expirado') THEN
    UPDATE private.cartoes_operacoes SET estado='recusada',token_temporario=NULL,bandeira_temporaria=NULL,ultimo4_temporario=NULL,updated_at=now() WHERE id=v_op.id;
    RETURN;
  END IF;
  IF v_attempt.estado NOT IN ('confirmado','recebido') THEN RETURN; END IF;
  IF NOT v_op.salvar_cartao THEN
    UPDATE private.cartoes_operacoes SET estado='concluida',updated_at=now() WHERE id=v_op.id;
    RETURN;
  END IF;
  IF v_op.token_temporario IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM public.clientes WHERE id=v_op.cliente_id FOR UPDATE;
  INSERT INTO public.clientes_cartoes(cliente_id,ambiente,asaas_customer_id,asaas_credit_card_token,bandeira,ultimo4)
  VALUES(v_op.cliente_id,v_op.ambiente,v_op.asaas_customer_id,v_op.token_temporario,v_op.bandeira_temporaria,v_op.ultimo4_temporario)
  ON CONFLICT (cliente_id,ambiente,asaas_customer_id,asaas_credit_card_token) DO NOTHING;
  UPDATE private.cartoes_operacoes SET estado='concluida',token_temporario=NULL,bandeira_temporaria=NULL,ultimo4_temporario=NULL,updated_at=now() WHERE id=v_op.id;
END;
$$;

REVOKE ALL ON FUNCTION private.invalidar_cartao_operacao(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.invalidar_cartao_operacao_service(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invalidar_cartao_operacao_service(uuid,uuid,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION private.obter_cartao_operacao(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.finalizar_compra_cartao(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.remover_cartao_cliente(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remover_cartao_cliente(uuid,uuid) TO authenticated;
