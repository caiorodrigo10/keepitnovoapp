CREATE OR REPLACE FUNCTION public.inspecionar_pagamento_admin(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  SELECT jsonb_build_object(
    'tentativaId', t.id,
    'pedidoId', t.pedido_id,
    'forma', t.forma,
    'estado', t.estado,
    'asaasPaymentId', t.asaas_payment_id,
    'criadoEm', t.criado_em,
    'pagoEm', p.pago_em,
    'valorPrevistoReais', p.total_pago_reais,
    'valorRecebidoReais', CASE
      WHEN p.pago_em IS NOT NULL AND t.estado IN ('confirmado', 'recebido')
        THEN p.total_pago_reais
      ELSE NULL
    END
  )
  INTO v_resultado
  FROM public.tentativas_pagamento t
  JOIN public.pedidos p ON p.id = t.pedido_id
  WHERE t.pedido_id = p_pedido_id
  ORDER BY (t.encerrada_em IS NULL) DESC, t.criado_em DESC, t.id DESC
  LIMIT 1;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.inspecionar_pagamento_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inspecionar_pagamento_admin(uuid) TO authenticated;
