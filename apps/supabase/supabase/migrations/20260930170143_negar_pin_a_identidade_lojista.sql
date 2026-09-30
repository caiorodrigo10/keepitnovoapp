-- A posse de estabelecimento é papel lojista autoritativo, mesmo com perfil cliente.
-- Mantém a migration anterior intacta e aplica a negação também às identidades duais.
BEGIN;
CREATE OR REPLACE FUNCTION public.obter_pin_cliente(p_pedido_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_pin text;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.estabelecimentos e WHERE e.dono_user_id = auth.uid()
  ) OR NOT EXISTS (
    SELECT 1 FROM public.pedidos p JOIN public.clientes c ON c.id=p.cliente_id
    WHERE p.id=p_pedido_id AND p.cliente_id=auth.uid() AND p.pago_em IS NOT NULL
  ) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  SELECT s.pin_texto INTO STRICT v_pin FROM private.pedido_segredos s WHERE s.pedido_id=p_pedido_id;
  RETURN v_pin;
END;
$$;
REVOKE ALL ON FUNCTION public.obter_pin_cliente(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.obter_pin_cliente(uuid) TO authenticated;
COMMIT;
