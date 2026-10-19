-- Story 12.10 — clientes continuam vendo lojas públicas pausadas ou fechadas,
-- mas nunca linhas administrativas ou excluídas. As policies privadas de
-- dono/admin permanecem separadas e permissivas (OR) com estas policies.

DROP POLICY IF EXISTS publico_ve_ativos ON public.estabelecimentos;
CREATE POLICY publico_ve_ativos ON public.estabelecimentos
  FOR SELECT
  TO anon, authenticated
  USING (
    (status = 'ativo' AND excluido_em IS NULL)
    OR dono_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS publico_ve_estab_hubs ON public.estabelecimentos_hubs;
CREATE POLICY publico_ve_estab_hubs ON public.estabelecimentos_hubs
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hubs h
      WHERE h.id = hub_id
        AND h.ativo = true
    )
    AND EXISTS (
      SELECT 1 FROM public.estabelecimentos e
      WHERE e.id = estabelecimento_id
        AND e.status = 'ativo'
        AND e.excluido_em IS NULL
    )
  );

DROP POLICY IF EXISTS publico_ve_produtos ON public.produtos;
CREATE POLICY publico_ve_produtos ON public.produtos
  FOR SELECT
  TO anon, authenticated
  USING (
    ativo = true
    AND excluido_em IS NULL
    AND EXISTS (
      SELECT 1 FROM public.estabelecimentos e
      WHERE e.id = estabelecimento_id
        AND e.status = 'ativo'
        AND e.excluido_em IS NULL
    )
  );
