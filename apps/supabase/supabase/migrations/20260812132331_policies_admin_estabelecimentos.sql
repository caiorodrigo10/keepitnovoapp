-- =============================================================================
-- Story 3.7 — policies de ADMIN em `estabelecimentos` e `estabelecimentos_horarios`
-- Épico 3 (Lojista / Aprovação). Autor: @data-engineer (Dara). Data: 2026-08-12.
--
-- Reativa o "TODO STORY 3.7" deixado nas migrations 20260812123046 (estabelecimentos)
-- e 20260812123047 (horarios). Depende de is_admin() (migration 20260812132330).
--
-- Fontes normativas:
--   docs/architecture/05-security.md §3.4 (admin_gerencia_estab)
--   docs/architecture/05-security.md §3.5 (leitura admin de horarios via is_admin)
--   docs/stories/3.7.story.md        AC4 (só admin lê estabelecimentos de terceiros)
--
-- DECISÃO DE DESENHO (por que ADICIONAR e não reescrever as policies do lojista):
--   As policies RLS PERMISSIVAS são combinadas com OR. Basta ADICIONAR uma policy de
--   admin; ela amplia o acesso do admin sem tocar as policies de lojista/público.
--   • `admin_gerencia_estab` (FOR ALL USING is_admin()) já concede ao admin SELECT de
--     TODAS as linhas (inclusive `em_analise`) — porque FOR ALL cobre SELECT e é OR'd
--     com `publico_ve_ativos`. Logo NÃO precisamos reescrever `publico_ve_ativos` para
--     adicionar `OR is_admin()` (seria SELECT redundante). Mantemos as policies de
--     lojista/público INTOCADAS (instrução da missão: "NÃO remova as policies de
--     lojista existentes; ADICIONE as de admin").
--   • Em `estabelecimentos_horarios`, o admin só precisa LER (exibir os horários no
--     detalhe do lojista, Story 3.7 AC3). Adicionamos `admin_le_horarios` (FOR SELECT),
--     OR'd com `publico_ve_horarios`. Escrita de horário por admin não é requisito do
--     piloto (aprovação/rejeição não tocam horários) — por isso FOR SELECT, não FOR ALL.
--
-- INTERAÇÃO COM O TRIGGER DE IMUTABILIDADE (trg_estabelecimentos_imutaveis):
--   `admin_gerencia_estab` habilita, no nível RLS, UPDATE de estabelecimentos por admin.
--   PORÉM o trigger de imutabilidade BLOQUEIA mudança de status/cnpj/asaas_wallet_id/
--   dono_user_id quando current_user IN ('authenticated','anon') — e o admin logado É
--   `authenticated`. Isso é INTENCIONAL: a mudança de `status` (aprovar/rejeitar) NÃO
--   passa por UPDATE direto do admin; passa pelas RPCs SECURITY DEFINER (migrations
--   132332/132333) que rodam como owner (current_user = owner) e, portanto, o trigger
--   as libera. O admin pode, via esta policy, editar campos NÃO-imutáveis diretamente
--   se necessário — mas as transições de estado ficam canalizadas nas RPCs (defesa em
--   profundidade).
--
-- ATOMICIDADE: as duas policies numa transação. Idempotência forward-only:
-- DROP POLICY IF EXISTS antes de CREATE (permite reaplicar sem erro se parcialmente
-- aplicada). Não altera dados nem outras policies.
--
-- ROLLBACK (forward-only):
--     DROP POLICY IF EXISTS admin_gerencia_estab ON public.estabelecimentos;
--     DROP POLICY IF EXISTS admin_le_horarios ON public.estabelecimentos_horarios;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- estabelecimentos: admin faz tudo (05-security.md §3.4). Concede ao admin SELECT de
-- todos os estabelecimentos (inclusive em_analise, base da fila da Story 3.7) e as
-- demais operações no nível RLS. Combinada por OR com publico_ve_ativos/
-- lojista_atualiza_proprio/lojista_cria_proprio (não removidas).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS admin_gerencia_estab ON public.estabelecimentos;
CREATE POLICY admin_gerencia_estab ON public.estabelecimentos
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- estabelecimentos_horarios: leitura admin (05-security.md §3.5). OR'd com
-- publico_ve_horarios e lojista_gerencia_horarios (não removidas). Admin lê os
-- horários de qualquer estabelecimento para o detalhe da aprovação.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS admin_le_horarios ON public.estabelecimentos_horarios;
CREATE POLICY admin_le_horarios ON public.estabelecimentos_horarios
  FOR SELECT
  USING (public.is_admin());
