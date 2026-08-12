-- =============================================================================
-- Story 4.1 — tabela `hubs_horarios` (7 linhas/dia) + RLS
-- Épico 4 (Cadastros base / Hubs). Autor: @data-engineer (Dara). Data: 2026-08-12.
--
-- Fontes normativas (seguidas à risca):
--   docs/architecture/03-data-models.md §2.2  (DDL — PK composta, CHECK aberto/horas)
--   docs/architecture/05-security.md   §3.8   (RLS publico_ve_hubs_horarios /
--                                               admin_gerencia_hubs_horarios)
--   docs/stories/4.1.story.md          AC3, AC5; Dependencies itens 2, 3
--
-- Depende de: 20260812164000_criar_hubs.sql (FK hub_id → hubs.id).
-- Reutiliza public.is_admin() (SECURITY DEFINER, migration 20260812132330) — sem
-- recursão (consulta admin_users, tabela distinta).
--
-- Mesmo padrão de `estabelecimentos_horarios` (§1.5 / migration 20260812123047):
-- PK composta (hub_id, dia_semana), FK ON DELETE CASCADE, CHECK aberto/horas,
-- sem criado_em/atualizado_em (as 7 linhas são reescritas pela rotina de CRUD).
--
-- ATOMICIDADE (obrigatório): tabela + RLS + policies em UMA transação (regra §2 de
-- 05-security.md). BEGIN/COMMIT explícitos omitidos (não encerrar a transação do
-- applier).
--
-- ROLLBACK (forward-only):
--     DROP TABLE IF EXISTS public.hubs_horarios CASCADE;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabela `hubs_horarios` (03-data-models.md §2.2) — 7 linhas por hub, PK composta.
-- -----------------------------------------------------------------------------
CREATE TABLE public.hubs_horarios (
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),  -- 0=domingo, 6=sábado
  aberto boolean NOT NULL DEFAULT false,
  hora_abre time,                                    -- NULL se aberto = false
  hora_fecha time,                                   -- NULL se aberto = false
  PRIMARY KEY (hub_id, dia_semana),
  CHECK (aberto = false OR (hora_abre IS NOT NULL AND hora_fecha IS NOT NULL AND hora_abre < hora_fecha))
);

COMMENT ON TABLE public.hubs_horarios IS
  'Horário de funcionamento do hub por dia da semana (7 linhas por hub). '
  '03-data-models.md §2.2. Escrito no CRUD de hubs do Admin (Story 4.1). '
  'FK ON DELETE CASCADE: cai junto se o hub for apagado fisicamente.';

-- -----------------------------------------------------------------------------
-- RLS (05-security.md §3.8). ENABLE + FORCE logo após criar (§2).
-- -----------------------------------------------------------------------------
ALTER TABLE public.hubs_horarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hubs_horarios FORCE ROW LEVEL SECURITY;

-- SELECT: público lê o horário de um hub visível (ativo) OU se is_admin().
--
-- DIVERGÊNCIA INTENCIONAL do §3.8 (falha FECHADA — endurece, NÃO relaxa): o §3.8
-- escreve `publico_ve_hubs_horarios FOR SELECT USING (true)`, que exporia o horário
-- de TODO hub — inclusive hubs inativos/despublicados — a qualquer role (anon). Aqui
-- espelhamos o padrão de estabelecimentos_horarios (§3.5): a visibilidade do horário
-- SEGUE a visibilidade do hub pai (via EXISTS em hubs). O horário de um hub inativo
-- fica visível só para o admin — coerente com publico_ve_hubs (hub inativo some do
-- público). Diretriz explícita da missão ("SELECT via hub ativo") + regra "não
-- relaxar RLS". RECOMENDA-SE atualizar o §3.8 (`USING (true)` → EXISTS via hub ativo).
-- Sem recursão: hubs_horarios referencia hubs; hubs NÃO referencia hubs_horarios.
CREATE POLICY publico_ve_hubs_horarios ON public.hubs_horarios
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.hubs h
      WHERE h.id = hub_id
        AND (h.ativo = true OR public.is_admin())
    )
  );

-- ALL: só admin gerencia horários de hub (AC5). Um authenticated sem entrada em
-- admin_users é bloqueado pela RLS.
CREATE POLICY admin_gerencia_hubs_horarios ON public.hubs_horarios
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
