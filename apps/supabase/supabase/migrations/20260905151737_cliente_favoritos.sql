-- =============================================================================
-- Story 12.11 — favoritos de hubs/estabelecimentos isolados por cliente
--
-- Cria duas relações privadas do cliente, com PK composta para idempotência e
-- índices na direção reversa das FKs. A descoberta pública de hubs ativos
-- permanece disponível; usuários autenticados também podem reler hubs inativos
-- já favoritados e seus horários.
--
-- ROLLBACK (forward-only; executar em uma nova migration, nesta ordem):
--   DROP POLICY IF EXISTS autenticado_ve_hubs_horarios ON public.hubs_horarios;
--   DROP POLICY IF EXISTS publico_ve_hubs_horarios ON public.hubs_horarios;
--   CREATE POLICY publico_ve_hubs_horarios ON public.hubs_horarios
--     FOR SELECT USING (
--       EXISTS (
--         SELECT 1 FROM public.hubs h
--         WHERE h.id = hub_id
--           AND (h.ativo = true OR public.is_admin())
--       )
--     );
--   DROP POLICY IF EXISTS autenticado_ve_hubs ON public.hubs;
--   DROP POLICY IF EXISTS publico_ve_hubs ON public.hubs;
--   CREATE POLICY publico_ve_hubs ON public.hubs
--     FOR SELECT USING (ativo = true OR public.is_admin());
--   DROP TABLE IF EXISTS public.clientes_estabelecimentos_favoritos;
--   DROP TABLE IF EXISTS public.clientes_hubs_favoritos;
-- =============================================================================

CREATE TABLE public.clientes_hubs_favoritos (
  cliente_id uuid NOT NULL
    REFERENCES public.clientes(id) ON DELETE CASCADE,
  hub_id uuid NOT NULL
    REFERENCES public.hubs(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cliente_id, hub_id)
);

COMMENT ON TABLE public.clientes_hubs_favoritos IS
  'Hubs favoritados pelo cliente. Relação privada e isolada por auth.uid(); '
  'a PK composta torna INSERT ... ON CONFLICT DO NOTHING idempotente.';

CREATE INDEX idx_clientes_hubs_favoritos_hub
  ON public.clientes_hubs_favoritos(hub_id);

ALTER TABLE public.clientes_hubs_favoritos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes_hubs_favoritos FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.clientes_hubs_favoritos FROM anon;
REVOKE ALL ON TABLE public.clientes_hubs_favoritos FROM authenticated;
GRANT SELECT, INSERT, DELETE
  ON TABLE public.clientes_hubs_favoritos
  TO authenticated;

CREATE POLICY cliente_le_hubs_favoritos
  ON public.clientes_hubs_favoritos
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = cliente_id);

CREATE POLICY cliente_insere_hubs_favoritos
  ON public.clientes_hubs_favoritos
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = cliente_id);

CREATE POLICY cliente_remove_hubs_favoritos
  ON public.clientes_hubs_favoritos
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = cliente_id);

CREATE TABLE public.clientes_estabelecimentos_favoritos (
  cliente_id uuid NOT NULL
    REFERENCES public.clientes(id) ON DELETE CASCADE,
  estabelecimento_id uuid NOT NULL
    REFERENCES public.estabelecimentos(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cliente_id, estabelecimento_id)
);

COMMENT ON TABLE public.clientes_estabelecimentos_favoritos IS
  'Estabelecimentos favoritados pelo cliente. Relação privada e isolada por '
  'auth.uid(); a PK composta torna INSERT ... ON CONFLICT DO NOTHING idempotente.';

CREATE INDEX idx_clientes_estabelecimentos_favoritos_estabelecimento
  ON public.clientes_estabelecimentos_favoritos(estabelecimento_id);

ALTER TABLE public.clientes_estabelecimentos_favoritos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes_estabelecimentos_favoritos FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.clientes_estabelecimentos_favoritos FROM anon;
REVOKE ALL ON TABLE public.clientes_estabelecimentos_favoritos FROM authenticated;
GRANT SELECT, INSERT, DELETE
  ON TABLE public.clientes_estabelecimentos_favoritos
  TO authenticated;

CREATE POLICY cliente_le_estabelecimentos_favoritos
  ON public.clientes_estabelecimentos_favoritos
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = cliente_id);

CREATE POLICY cliente_insere_estabelecimentos_favoritos
  ON public.clientes_estabelecimentos_favoritos
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = cliente_id);

CREATE POLICY cliente_remove_estabelecimentos_favoritos
  ON public.clientes_estabelecimentos_favoritos
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = cliente_id);

-- Separa anon e authenticated para que o caminho público nunca precise de
-- privilégio na tabela privada de favoritos. Hubs ativos continuam públicos.
DROP POLICY IF EXISTS publico_ve_hubs ON public.hubs;

CREATE POLICY publico_ve_hubs
  ON public.hubs
  FOR SELECT
  TO anon
  USING (ativo = true);

CREATE POLICY autenticado_ve_hubs
  ON public.hubs
  FOR SELECT
  TO authenticated
  USING (
    ativo = true
    OR public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.clientes_hubs_favoritos favorito
      WHERE favorito.hub_id = hubs.id
        AND favorito.cliente_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS publico_ve_hubs_horarios ON public.hubs_horarios;

CREATE POLICY publico_ve_hubs_horarios
  ON public.hubs_horarios
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.hubs hub
      WHERE hub.id = hubs_horarios.hub_id
        AND hub.ativo = true
    )
  );

CREATE POLICY autenticado_ve_hubs_horarios
  ON public.hubs_horarios
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.hubs hub
      WHERE hub.id = hubs_horarios.hub_id
        AND hub.ativo = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.clientes_hubs_favoritos favorito
      WHERE favorito.hub_id = hubs_horarios.hub_id
        AND favorito.cliente_id = (SELECT auth.uid())
    )
  );
