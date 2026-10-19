-- =============================================================================
-- Story 4.1 — tabela `hubs` + índices + trigger + RLS
-- Épico 4 (Cadastros base / Hubs). Autor: @data-engineer (Dara). Data: 2026-08-12.
--
-- Fontes normativas (seguidas à risca):
--   docs/architecture/03-data-models.md §2.1  (DDL hubs + índices idx_hubs_ativo/idx_hubs_geo)
--   docs/architecture/03-data-models.md §"Trigger utilitário compartilhado"
--   docs/architecture/05-security.md   §3.8   (RLS publico_ve_hubs / admin_gerencia_hubs)
--   docs/stories/4.1.story.md          AC3, AC5; Dependencies itens 1, 3
--
-- PRIMEIRA migration que cria `hubs` — pré-condição bloqueante da Story 4.1 (CRUD
-- de hubs no Admin). Reutiliza a infraestrutura JÁ EXISTENTE do piloto:
--   * public.set_atualizado_em()  — trigger utilitário (criado na migration
--     20260812123046_criar_estabelecimentos.sql). NÃO recriado aqui: só ligamos o
--     trigger. (CREATE OR REPLACE seria redundante; a função já está no banco.)
--   * public.is_admin()           — SECURITY DEFINER (migration 20260812132330).
--     REUSADA nas policies. Por ser SECURITY DEFINER consulta admin_users (tabela
--     distinta de hubs) → sem recursão de RLS.
--
-- lat/lng SÃO NOT NULL (diferente de estabelecimentos.lat/lng, que ficaram NULLABLE
-- no piloto por causa da descoberta por lista). Aqui o admin informa manualmente as
-- coordenadas (sem mapa/geocoding nesta Story) e o índice geo idx_hubs_geo É criado
-- — serve ao mapa do cliente no Épico 5 (§2.1; Story 4.1 "MVP Pilot Classification").
--
-- ATOMICIDADE (obrigatório): tabela + índices + trigger + RLS + policies neste ÚNICO
-- arquivo, aplicados em UMA transação (regra §2 de 05-security.md — tabela sem RLS
-- ativada é falha de segurança). `apply_migration` (MCP) e `supabase db push`
-- envolvem o arquivo inteiro em transação. BEGIN/COMMIT explícitos omitidos de
-- propósito (não encerrar a transação externa do applier).
--
-- ROLLBACK (forward-only; se necessário reverter):
--     DROP TABLE IF EXISTS public.hubs CASCADE;  -- índices/trigger/policies caem junto
--     -- NÃO dropar public.set_atualizado_em() nem public.is_admin(): utilitários
--     -- compartilhados por outras tabelas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabela `hubs` (03-data-models.md §2.1) — lat/lng NOT NULL (input manual do admin).
-- -----------------------------------------------------------------------------
CREATE TABLE public.hubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  endereco text NOT NULL,
  lat numeric(9,6) NOT NULL,
  lng numeric(9,6) NOT NULL,
  ponto_referencia text,                             -- descrição operacional livre
  foto_url text,                                     -- URL pública do bucket `hubs` (migration 20260812164200)
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT NOW(),
  atualizado_em timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.hubs IS
  'Hubs Keepit (pontos de retirada). Story 4.1 (03-data-models.md §2.1). '
  'lat/lng NOT NULL — input manual do admin no piloto (sem mapa/geocoding); '
  'geo serve ao mapa do cliente no Épico 5. "Excluir" no Admin = ativo=false '
  '(soft-deactivate, decisão Story 0.12) — pedidos.hub_id é ON DELETE RESTRICT.';

-- Índices do §2.1. Ambos criados no piloto (diferente de idx_estab_geo, que foi
-- adiado): hubs mantém geo NOT NULL para o mapa de retirada do cliente (Épico 5).
CREATE INDEX idx_hubs_ativo ON public.hubs(ativo) WHERE ativo = true;
CREATE INDEX idx_hubs_geo ON public.hubs(lat, lng) WHERE ativo = true;

-- Trigger de atualização automática de `atualizado_em` (reutiliza o utilitário
-- compartilhado public.set_atualizado_em(), já existente — NÃO recriado aqui).
CREATE TRIGGER trg_hubs_atualizado
  BEFORE UPDATE ON public.hubs
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

-- -----------------------------------------------------------------------------
-- RLS (05-security.md §3.8). Regra absoluta do §2: ENABLE + FORCE logo após criar.
-- FORCE vale até para o owner — protege contra bugs em caminhos privilegiados.
-- -----------------------------------------------------------------------------
ALTER TABLE public.hubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hubs FORCE ROW LEVEL SECURITY;

-- SELECT: leitura pública de hubs ATIVOS (cliente/lojista escolhem o hub) OU
-- qualquer estado se is_admin() — o admin PRECISA ver hubs inativos para o CRUD
-- (reativar um hub desativado). Verbatim §3.8. Sem `TO` explícito (aplica a todos
-- os roles, inclusive anon), consistente com publico_ve_ativos de estabelecimentos.
-- is_admin() é SECURITY DEFINER e tem EXECUTE para anon/authenticated (migration
-- 20260812132330) — avaliável na policy sem "permission denied". Sem auth.uid()
-- direto aqui: pertencimento de admin resolve dentro de is_admin() (default auth.uid()).
CREATE POLICY publico_ve_hubs ON public.hubs
  FOR SELECT
  USING (ativo = true OR public.is_admin());

-- ALL: só admin cria/edita/desativa hubs. Um authenticated sem entrada em
-- admin_users é bloqueado pela RLS (não só escondido na UI) — AC5. Sendo policy
-- permissiva, ela se soma (OR) à publico_ve_hubs no SELECT: o admin também lê
-- inativos por esta policy (defesa em profundidade, além do OR is_admin() acima).
CREATE POLICY admin_gerencia_hubs ON public.hubs
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Sem policy de DELETE para não-admin: DELETE físico só via admin_gerencia_hubs
-- (is_admin()). Na prática a UI usa "excluir" = UPDATE ativo=false (Story 0.12),
-- porque pedidos.hub_id é ON DELETE RESTRICT (§5.1) — DELETE físico falha se houver
-- QUALQUER pedido histórico no hub. Ver Story 4.1 Dependencies / AC4.
