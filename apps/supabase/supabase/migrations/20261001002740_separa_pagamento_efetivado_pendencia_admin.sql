CREATE OR REPLACE FUNCTION public.inspecionar_pagamento_admin(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pedido public.pedidos%ROWTYPE;
  v_ultima public.tentativas_pagamento%ROWTYPE;
  v_efetivada public.tentativas_pagamento%ROWTYPE;
  v_principal public.tentativas_pagamento%ROWTYPE;
  v_pendencia public.tentativas_pagamento%ROWTYPE;
  v_tem_efetivada boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  SELECT tp.* INTO v_ultima
  FROM public.tentativas_pagamento tp
  WHERE tp.pedido_id = p_pedido_id
  ORDER BY (tp.encerrada_em IS NULL) DESC, tp.criado_em DESC, tp.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT p.* INTO STRICT v_pedido
  FROM public.pedidos p
  WHERE p.id = p_pedido_id;

  -- A cobrança registrada no ledger é canônica. O fallback cobre dados
  -- anteriores ao ledger escolhendo a confirmação mais recente.
  SELECT tp.* INTO v_efetivada
  FROM public.tentativas_pagamento tp
  LEFT JOIN public.lancamentos_financeiros lf
    ON lf.pedido_id = tp.pedido_id
   AND lf.tipo = 'charge'
   AND lf.status = 'concluido'
   AND lf.asaas_id_externo = tp.asaas_payment_id
  WHERE tp.pedido_id = p_pedido_id
    AND tp.estado IN ('confirmado', 'recebido')
  ORDER BY (lf.id IS NOT NULL) DESC, tp.criado_em DESC, tp.id DESC
  LIMIT 1;
  v_tem_efetivada := FOUND;

  IF v_tem_efetivada THEN
    v_principal := v_efetivada;
    SELECT tp.* INTO v_pendencia
    FROM public.tentativas_pagamento tp
    WHERE tp.pedido_id = p_pedido_id
      AND tp.estado NOT IN ('confirmado', 'recebido')
      AND (tp.criado_em, tp.id) > (v_efetivada.criado_em, v_efetivada.id)
    ORDER BY tp.criado_em DESC, tp.id DESC
    LIMIT 1;
  ELSE
    v_principal := v_ultima;
  END IF;

  RETURN jsonb_build_object(
    'tentativaId', v_principal.id,
    'pedidoId', v_principal.pedido_id,
    'forma', v_principal.forma,
    'estado', v_principal.estado,
    'asaasPaymentId', v_principal.asaas_payment_id,
    'criadoEm', v_principal.criado_em,
    'pagoEm', v_pedido.pago_em,
    'valorPrevistoReais', v_pedido.total_pago_reais,
    'valorRecebidoReais', CASE WHEN v_tem_efetivada THEN v_pedido.total_pago_reais ELSE NULL END,
    'pendencia', CASE WHEN v_pendencia.id IS NULL THEN NULL ELSE jsonb_build_object(
      'tentativaId', v_pendencia.id,
      'forma', v_pendencia.forma,
      'estado', v_pendencia.estado,
      'asaasPaymentId', v_pendencia.asaas_payment_id,
      'criadoEm', v_pendencia.criado_em
    ) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.inspecionar_pagamento_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inspecionar_pagamento_admin(uuid) TO authenticated;
