-- Task 9 — historical projections remain visible only to their existing
-- participants, after account deletion has detached personal identities.

CREATE OR REPLACE FUNCTION public.pedido_cliente_nome(pedido public.pedidos)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pedido public.pedidos%ROWTYPE;
  v_nome text;
BEGIN
  -- Never authorize from the caller-supplied composite.  The persisted row is
  -- loaded first, and the existing participant/admin rule is evaluated before
  -- reading either the remaining profile or its anonymous fallback.
  SELECT p.* INTO v_pedido
  FROM public.pedidos p
  WHERE p.id = pedido.id;

  IF NOT FOUND OR auth.uid() IS NULL
    OR public.pode_ver_pedido(v_pedido) IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT c.nome INTO v_nome
  FROM public.clientes c
  WHERE c.id = v_pedido.cliente_id;

  RETURN coalesce(v_nome, 'Cliente excluído');
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_cliente_nome(public.pedidos)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_cliente_nome(public.pedidos)
  TO authenticated;

COMMENT ON FUNCTION public.pedido_cliente_nome(public.pedidos) IS
  'Authorized historical order projection: returns Cliente excluído after a detached customer identity, never grants access from NULL cliente_id or a forged composite.';
