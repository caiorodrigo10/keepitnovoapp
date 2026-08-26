-- =============================================================================
-- Bloco 09 (Operação Admin — Épico 8) — suspender/reativar lojista (Story 8.6).
-- Autor: @data-engineer (Dara). Data: 2026-08-13.
--
-- Fontes normativas:
--   docs/stories/8.6.story.md (suspender/reativar; some do catálogo; pedidos em curso
--       continuam).
--   docs/orchestration/BLOCO-09-ADMIN-OPS-2026-08-13.md ("estabelecimentos.status=
--       'suspenso' + suspenso_em/motivo_suspensao + RPCs admin suspender/reativar").
--   docs/architecture/03-data-models.md §1.4 (status CHECK inclui 'suspenso';
--       motivo_suspensao/suspenso_em).
--
-- ============================ NENHUMA COLUNA NOVA ============================
-- Confirmado por leitura de 20260812123046_criar_estabelecimentos.sql: `status` (CHECK
-- IN 'em_analise','ativo','rejeitado','suspenso'), `motivo_suspensao` e `suspenso_em`
-- JÁ EXISTEM. Este arquivo NÃO altera schema — só adiciona os dois RPCs.
--
-- ============================ CATÁLOGO JÁ FILTRA =============================
-- A leitura pública do cliente já exclui não-ativos: policy `publico_ve_ativos`
-- (status='ativo' AND ...) e a RPC criar_pedido exige e.status='ativo' — um lojista
-- 'suspenso' some da descoberta e não recebe novos pedidos automaticamente. Nenhum
-- ajuste de leitura necessário aqui (isso seria trabalho do @dev, e já está coberto).
-- "Pedidos em curso continuam": suspender só muda o status do estabelecimento; não
-- toca `pedidos` — pedidos já aceitos seguem seu fluxo normal.
--
-- ============================ POR QUE RPC (e não UPDATE direto) ==============
-- O trigger `trg_estabelecimentos_imutaveis` (20260812123046) BLOQUEIA mudança de
-- `status` quando current_user IN ('authenticated','anon') — inclusive o admin logado.
-- A transição de estado é, por design do repo, canalizada em RPC SECURITY DEFINER
-- (roda como owner → trigger libera), igual a aprovar_lojista/rejeitar_lojista
-- (20260812132332/33). Estes dois RPCs completam esse conjunto para suspenso↔ativo.
--
-- ============================ GUARDAS DE ESTADO (fail-closed) ================
-- [AUTO-DECISION] suspender exige status='ativo'; reativar exige status='suspenso'
-- (senão ESTADO_INVALIDO). RAZÃO: impedir corrupção de estado — reativar um lojista
-- 'em_analise'/'rejeitado' o promoveria a 'ativo' PULANDO a aprovação (aprovar_lojista);
-- suspender um 'em_analise' não faz sentido operacional (rejeita-se, não suspende-se).
-- O par suspender/reativar é estritamente ativo↔suspenso.
--
-- VALIDAÇÕES / ERROS (ambos): AUTENTICACAO_NECESSARIA, NAO_AUTORIZADO,
--   ESTABELECIMENTO_NAO_ENCONTRADO, ESTADO_INVALIDO; suspender: + MOTIVO_OBRIGATORIO.
--
-- HARDENING: SECURITY DEFINER + search_path=''; REVOKE PUBLIC/anon; EXECUTE só
-- authenticated (guard is_admin()). Verificar get_advisors(type='security') após aplicar.
--
-- ROLLBACK (forward-only):
--     DROP FUNCTION IF EXISTS public.reativar_lojista(uuid);
--     DROP FUNCTION IF EXISTS public.suspender_lojista(uuid, text);
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) suspender_lojista — status 'ativo' → 'suspenso' + motivo + timestamp.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.suspender_lojista(
  p_estabelecimento_id uuid,
  p_motivo             text
)
RETURNS TABLE (estabelecimento_id uuid, status text, suspenso_em timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA' USING HINT = 'Sessão ausente';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING HINT = 'Apenas administradores suspendem lojistas';
  END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'MOTIVO_OBRIGATORIO' USING HINT = 'Informe o motivo da suspensão';
  END IF;

  SELECT e.status INTO v_status
  FROM public.estabelecimentos e
  WHERE e.id = p_estabelecimento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ESTABELECIMENTO_NAO_ENCONTRADO' USING HINT = 'Nenhum estabelecimento com o id informado';
  END IF;
  IF v_status <> 'ativo' THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO' USING HINT = 'Só um lojista ativo pode ser suspenso';
  END IF;

  UPDATE public.estabelecimentos e
     SET status           = 'suspenso',
         motivo_suspensao = p_motivo,
         suspenso_em      = NOW()
   WHERE e.id = p_estabelecimento_id
  RETURNING e.id, e.status, e.suspenso_em
       INTO estabelecimento_id, status, suspenso_em;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.suspender_lojista(uuid, text) IS
  'Story 8.6. Admin suspende um lojista ATIVO (status->''suspenso'', motivo_suspensao, '
  'suspenso_em=NOW). Some do catálogo (publico_ve_ativos já filtra). SECURITY DEFINER + '
  'search_path='''' + guard is_admin() (contorna o trigger de imutabilidade de status). '
  'Erros: AUTENTICACAO_NECESSARIA, NAO_AUTORIZADO, MOTIVO_OBRIGATORIO, '
  'ESTABELECIMENTO_NAO_ENCONTRADO, ESTADO_INVALIDO.';

REVOKE ALL ON FUNCTION public.suspender_lojista(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.suspender_lojista(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.suspender_lojista(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2) reativar_lojista — status 'suspenso' → 'ativo' + limpa motivo/timestamp.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reativar_lojista(
  p_estabelecimento_id uuid
)
RETURNS TABLE (estabelecimento_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA' USING HINT = 'Sessão ausente';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING HINT = 'Apenas administradores reativam lojistas';
  END IF;

  SELECT e.status INTO v_status
  FROM public.estabelecimentos e
  WHERE e.id = p_estabelecimento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ESTABELECIMENTO_NAO_ENCONTRADO' USING HINT = 'Nenhum estabelecimento com o id informado';
  END IF;
  IF v_status <> 'suspenso' THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO' USING HINT = 'Só um lojista suspenso pode ser reativado';
  END IF;

  UPDATE public.estabelecimentos e
     SET status           = 'ativo',
         motivo_suspensao = NULL,
         suspenso_em      = NULL
   WHERE e.id = p_estabelecimento_id
  RETURNING e.id, e.status
       INTO estabelecimento_id, status;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.reativar_lojista(uuid) IS
  'Story 8.6. Admin reativa um lojista SUSPENSO (status->''ativo'', limpa '
  'motivo_suspensao/suspenso_em). Guard de estado impede promover em_analise/rejeitado '
  'pulando a aprovação. SECURITY DEFINER + search_path='''' + guard is_admin(). Erros: '
  'AUTENTICACAO_NECESSARIA, NAO_AUTORIZADO, ESTABELECIMENTO_NAO_ENCONTRADO, ESTADO_INVALIDO.';

REVOKE ALL ON FUNCTION public.reativar_lojista(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reativar_lojista(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reativar_lojista(uuid) TO authenticated;
