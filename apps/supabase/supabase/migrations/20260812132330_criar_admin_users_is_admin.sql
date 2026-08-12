-- =============================================================================
-- Story 3.7 — tabela `admin_users` + função `is_admin()` + RLS
-- Épico 3 (Lojista / Aprovação). Autor: @data-engineer (Dara). Data: 2026-08-12.
--
-- Esta é a PRIMEIRA migration que introduz o papel ADMIN no banco. `admin_users`
-- e `is_admin()` são a fundação de autorização de TODAS as policies/RPCs de admin
-- (3.7 leitura da fila de pendentes, 3.8 aprovar, 3.9 rejeitar). Até aqui, os
-- `OR is_admin()` do 05-security.md eram DÉBITO DE SEQUENCIAMENTO (falha fechada)
-- registrado nas migrations 20260812123046/47 — esta Story os habilita.
--
-- Fontes normativas (seguidas à risca):
--   docs/architecture/03-data-models.md §1.7  (DDL admin_users + is_admin)
--   docs/architecture/05-security.md   §1     (funções utilitárias, is_admin)
--   docs/architecture/05-security.md   §3.7   (RLS admin_le_admins / sem_insert_direto_admins)
--   docs/stories/3.7.story.md          AC4, AC5, AC7
--
-- ATOMICIDADE (obrigatório): tabela + função + RLS + policies neste ÚNICO arquivo,
-- em UMA transação. Estado parcial = falha de segurança (tabela de admins sem RLS
-- fica exposta). O applier (MCP `apply_migration` / `supabase db push`) envolve o
-- arquivo inteiro em transação. Ordem interna importa: (1) tabela; (2) is_admin()
-- — depende da tabela; (3) RLS/policies — dependem de is_admin().
--
-- ROLLBACK (forward-only; se necessário reverter, nesta ordem):
--     DROP FUNCTION IF EXISTS public.is_admin(uuid);   -- policies que a usam devem cair antes
--     DROP TABLE IF EXISTS public.admin_users CASCADE;  -- policies próprias caem junto
--   Atenção: policies em OUTRAS tabelas que referenciam is_admin() (estabelecimentos,
--   horarios — migration 20260812132331) precisam ser dropadas ANTES de DROP FUNCTION.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tabela `admin_users` (03-data-models.md §1.7)
-- Lista PLANA sem coluna de papel (decisão 10.6 RATIFICADA, Rodada 8, 2026-08-02):
-- se você existe aqui, é admin da Keepit e pode tudo. Provisionamento é manual via
-- SQL do owner (ver runbook / bloco de provisionamento fornecido à parte) — nunca
-- via API (policy sem_insert_direto_admins abaixo).
-- -----------------------------------------------------------------------------
CREATE TABLE public.admin_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.admin_users IS
  'Admins da Keepit (Story 3.7). Lista plana sem papel (decisão 10.6 ratificada). '
  'Provisionamento manual via SQL/service_role — INSERT via API é negado por RLS. '
  'Presença nesta tabela = is_admin() true.';

-- -----------------------------------------------------------------------------
-- 2) Função `is_admin(user_id uuid DEFAULT auth.uid())` (03-data-models.md §1.7)
-- SECURITY DEFINER + STABLE: roda com privilégios do owner (driblando RLS ao
-- consultar admin_users de DENTRO de policies de outras tabelas), resultado
-- consistente na mesma query.
--
-- POR QUE SECURITY DEFINER EVITA RECURSÃO DE RLS: as policies de `estabelecimentos`
-- e `estabelecimentos_horarios` chamam is_admin(); is_admin() consulta `admin_users`
-- (tabela DIFERENTE), então não há a auto-referência que o §3.4 tentou fazer com
-- subconsulta na própria tabela (aquela dava "infinite recursion detected in policy",
-- ver nota da migration 20260812123046). Consultar admin_users a partir de policies
-- de estabelecimentos é seguro. Dentro de admin_users, a policy admin_le_admins também
-- chama is_admin() → is_admin() consulta admin_users de novo, MAS por ser SECURITY
-- DEFINER a consulta interna roda como owner e NÃO reavalia RLS de admin_users → sem
-- recursão. (RLS não se aplica ao dono/definer dentro da função.)
--
-- SET search_path = '' + qualificação total (public.admin_users): fecha o lint 0011
-- (function_search_path_mutable). O DEFAULT `auth.uid()` já é schema-qualificado
-- (auth.uid), logo independe do search_path.
--
-- ADVISOR (aceito e intencional): `authenticated_security_definer_function_executable`
-- (lint 0016) VAI aparecer para is_admin() — é uma SECURITY DEFINER executável por
-- authenticated/anon. Isso é o PADRÃO Supabase para helpers de RLS: a função PRECISA
-- ser avaliável no contexto de qualquer role que consulte uma tabela cuja policy a
-- referencia (inclusive `anon`, que navega a descoberta de estabelecimentos). Ela
-- NÃO recebe parâmetro sensível, só resolve booleano de pertencimento; com uid NULL
-- (anon) retorna false. WARN documentado e aceito. Ver Story 3.7 (instrução da missão).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE id = user_id);
$$;

COMMENT ON FUNCTION public.is_admin(uuid) IS
  'Story 3.7. True se user_id (default auth.uid()) está em admin_users. '
  'SECURITY DEFINER/STABLE — usada nas policies e RPCs de admin sem recursão de RLS '
  '(consulta admin_users, tabela distinta das que a chamam). WARN lint 0016 é '
  'intencional (helper de RLS precisa ser executável por authenticated/anon).';

-- Grants: is_admin() é avaliada nas policies de `estabelecimentos`/`horarios`, que
-- são consultadas TANTO por `authenticated` QUANTO por `anon` (descoberta pública).
-- Portanto anon E authenticated precisam de EXECUTE, senão a query da descoberta
-- falharia com "permission denied for function is_admin". service_role bypassa RLS,
-- mas concedemos por completude. Revoke de PUBLIC para grant explícito/auditável.
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) RLS de `admin_users` (05-security.md §3.7). ENABLE + FORCE (§2).
-- -----------------------------------------------------------------------------
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users FORCE ROW LEVEL SECURITY;  -- vale até para o owner

-- SELECT: só admin lê a lista de admins (inclusive a própria entrada).
CREATE POLICY admin_le_admins ON public.admin_users
  FOR SELECT
  USING (public.is_admin());

-- INSERT via API é NEGADO (WITH CHECK false): provisionamento de admin é SOMENTE
-- por SQL do owner / service_role (que bypassam RLS). Sem tela de auto-cadastro nem
-- convite (Story 3.7 AC7). UPDATE/DELETE não têm policy → negados por padrão sob RLS.
-- Forma explícita FOR INSERT WITH CHECK(false) (o §3.7 escreve FOR ALL WITH CHECK
-- (false); preferimos FOR INSERT — intento idêntico "Ninguém insere via API", sem
-- ambiguidade de USING omitido num FOR ALL).
CREATE POLICY sem_insert_direto_admins ON public.admin_users
  FOR INSERT
  WITH CHECK (false);
