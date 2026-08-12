-- =============================================================================
-- Story 3.5 — tabela `estabelecimentos_horarios` (7 linhas/dia) e RLS
-- Épico 3 (Lojista / Aprovação). Autor: @data-engineer (Dara). Data: 2026-08-12.
--
-- Fontes normativas (seguidas à risca):
--   docs/architecture/03-data-models.md §1.5  (DDL)
--   docs/architecture/05-security.md   §3.5   (RLS + policies)
--   docs/stories/3.5.story.md          AC3; Dependencies item 3
--
-- Depende de: 20260812123046_criar_estabelecimentos.sql (FK estabelecimento_id).
--
-- ATOMICIDADE: tabela + RLS + policies em UMA transação (mesma regra do §2 de
-- 05-security.md — tabela sem RLS ativada é falha de segurança).
--
-- ROLLBACK (forward-only):
--     DROP TABLE IF EXISTS public.estabelecimentos_horarios CASCADE;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabela (03-data-models.md §1.5) — 7 linhas por estabelecimento, PK composta.
-- Sem criado_em/atualizado_em por design (§1.5): linhas são reescritas pela RPC.
-- -----------------------------------------------------------------------------
CREATE TABLE public.estabelecimentos_horarios (
  estabelecimento_id uuid NOT NULL
    REFERENCES public.estabelecimentos(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),  -- 0=domingo, 6=sábado
  aberto boolean NOT NULL DEFAULT false,
  hora_abre time,                                    -- NULL se aberto = false
  hora_fecha time,                                   -- NULL se aberto = false
  PRIMARY KEY (estabelecimento_id, dia_semana),
  CHECK (aberto = false OR (hora_abre IS NOT NULL AND hora_fecha IS NOT NULL AND hora_abre < hora_fecha))
);

COMMENT ON TABLE public.estabelecimentos_horarios IS
  'Horário de funcionamento por dia da semana (7 linhas por estabelecimento). '
  '03-data-models.md §1.5. Escrito pela RPC criar_estabelecimento_completo (3.5).';

-- -----------------------------------------------------------------------------
-- RLS (05-security.md §3.5). ENABLE + FORCE logo após criar (§2).
-- Ownership derivado do estabelecimento pai via EXISTS.
-- -----------------------------------------------------------------------------
ALTER TABLE public.estabelecimentos_horarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estabelecimentos_horarios FORCE ROW LEVEL SECURITY;

-- SELECT: público vê horários de estabelecimento ativo; dono vê os próprios.
-- DÉBITO DE SEQUENCIAMENTO (falha FECHADA — só restringe): o §3.5 tem
-- `OR is_admin()` no EXISTS. is_admin()/admin_users são da Story 3.7 e ainda não
-- existem; omitir só restringe. QUEM CRIAR is_admin() NA 3.7 DEVE recriar esta
-- policy adicionando `OR is_admin()` no ramo do EXISTS (ver §3.5).
CREATE POLICY publico_ve_horarios ON public.estabelecimentos_horarios
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.estabelecimentos e
      WHERE e.id = estabelecimento_id
        AND (
          (e.status = 'ativo' AND e.excluido_em IS NULL)
          OR e.dono_user_id = (SELECT auth.uid())
        )
    )
  );

-- ALL: lojista gerencia os horários do próprio estabelecimento.
-- DÉBITO DE SEQUENCIAMENTO (falha FECHADA): o §3.5 tem `OR is_admin()` nas duas
-- cláusulas. Omitido até a 3.7 (só restringe). QUEM CRIAR is_admin() NA 3.7 DEVE
-- recriar esta policy adicionando `OR is_admin()` em USING e WITH CHECK (§3.5).
CREATE POLICY lojista_gerencia_horarios ON public.estabelecimentos_horarios
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.estabelecimentos
      WHERE id = estabelecimento_id AND dono_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.estabelecimentos
      WHERE id = estabelecimento_id AND dono_user_id = (SELECT auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- TODO STORY 3.7 (admin) — recriar publico_ve_horarios e lojista_gerencia_horarios
-- adicionando `OR is_admin()` conforme §3.5. NÃO criar admin_users/is_admin() aqui.
-- -----------------------------------------------------------------------------
