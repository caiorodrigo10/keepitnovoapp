-- Hardening retroativo do catálogo efetivo: toda função SECURITY DEFINER da
-- aplicação recebe um search_path imutável e deixa de herdar EXECUTE de PUBLIC.
-- As grants explícitas já declaradas pelas migrations produtoras (authenticated
-- para RPCs do app e service_role para operações de servidor) são preservadas.
DO $$
DECLARE
  v_function regprocedure;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname IN ('public', 'private')
  LOOP
    -- Com search_path vazio, pg_catalog continua implícito e todos os nomes da
    -- aplicação usados pelos corpos devem estar qualificados pelo schema.
    EXECUTE format('ALTER FUNCTION %s SET search_path TO ''''', v_function);

    -- NULL proacl equivale a EXECUTE para PUBLIC. Revogar PUBLIC também remove
    -- esse default e as funções privadas deixam de ser invocáveis por papéis da
    -- API. anon é revogado de forma explícita para funções que o listavam.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_function);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', v_function);
  END LOOP;
END;
$$;

-- These two predicate helpers are evaluated by anon RLS policies. Their bodies
-- derive authorization from auth.uid()/the row and return false for anonymous
-- callers; granting them is necessary for policy evaluation, not public RPC use.
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.pode_ver_pedido(public.pedidos) TO anon;
GRANT EXECUTE ON FUNCTION public.estabelecimento_pertence_ao_usuario(uuid) TO anon;
