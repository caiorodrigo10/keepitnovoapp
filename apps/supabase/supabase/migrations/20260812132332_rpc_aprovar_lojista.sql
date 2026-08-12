-- =============================================================================
-- Story 3.8 (SIMPLE) — RPC `aprovar_lojista(p_estab_id uuid)`
-- Épico 3 (Lojista / Aprovação). Autor: @data-engineer (Dara). Data: 2026-08-12.
--
-- Aprovação STATUS-ONLY do piloto: muda status em_analise → ativo e grava
-- aprovado_em/aprovado_por. SEM Asaas, SEM hub, SEM push (ver escopo abaixo).
--
-- Fontes normativas:
--   docs/stories/3.8.story.md          AC2, AC3, AC4
--   docs/architecture/03-data-models.md §1.4 (colunas status/aprovado_em/aprovado_por;
--                                       asaas_wallet_id sempre NULL no piloto)
--   docs/architecture/07-mvp-pilot-backend.md §"Edge Functions mínimas" (RPC SECURITY
--                                       DEFINER + is_admin() como veículo padrão)
--   Depende de: 20260812132330 (is_admin), 20260812123046 (estabelecimentos + trigger).
--
-- ESCOPO SIMPLE — o que esta RPC NÃO faz (guardas de regressão do texto original):
--   * NÃO chama Asaas (POST /v3/accounts) nem grava asaas_wallet_id (fica NULL — conta
--     Asaas única da Keepit).
--   * NÃO escreve em estabelecimentos_hubs (BR-HUB pendente — associação loja↔hub fora
--     do piloto).
--   * NÃO envia push/e-mail (push nativo é LATER — Story 2.11).
--
-- POR QUE RPC SECURITY DEFINER:
--   * Autorização server-side: a função roda como owner (BYPASSRLS), então NÃO confia
--     em RLS — valida is_admin(auth.uid()) explicitamente (senão ACESSO_NEGADO). O
--     alvo (p_estab_id) é de terceiro; só admin pode.
--   * Passa pelo trigger de imutabilidade: dentro da SECURITY DEFINER, current_user =
--     owner (não 'authenticated'/'anon'), então trg_estabelecimentos_imutaveis LIBERA a
--     mudança de status — exatamente o caminho previsto na migration 20260812123046.
--   * auth.uid() continua sendo o do CHAMADOR (lê a claim do JWT via GUC), não o do
--     owner — logo is_admin(auth.uid()) e aprovado_por refletem o admin real.
--
-- ERROS NOMEADOS (mapeados pelo @dev para mensagens honestas na UI — sem simular
-- sucesso): AUTENTICACAO_NECESSARIA, ACESSO_NEGADO, ESTABELECIMENTO_NAO_ENCONTRADO,
-- ESTADO_INVALIDO.
--
-- ROLLBACK (forward-only):
--     DROP FUNCTION IF EXISTS public.aprovar_lojista(uuid);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.aprovar_lojista(p_estab_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_estab_id  uuid;
BEGIN
  -- 1) Exige sessão autenticada (a função ignora RLS; validamos aqui).
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de admin ausente ao chamar aprovar_lojista';
  END IF;

  -- 2) Autorização: só admin. A RPC não confia em RLS (roda como owner).
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO'
      USING HINT = 'Apenas um admin (is_admin) pode aprovar um lojista';
  END IF;

  -- 3) Transição de estado idempotente-segura: só aprova quem está 'em_analise'.
  --    aprovado_por = auth.uid() (o admin). asaas_wallet_id e hub NÃO são tocados.
  UPDATE public.estabelecimentos
  SET status       = 'ativo',
      aprovado_em  = NOW(),
      aprovado_por = v_uid
  WHERE id = p_estab_id
    AND status = 'em_analise'
  RETURNING id INTO v_estab_id;

  -- 4) Nada atualizado: ou não existe, ou não está em_analise. Erro honesto (AC3),
  --    sem sucesso silencioso. Distinguimos os dois casos (o admin já validado pode
  --    saber a diferença — RLS bypassada de forma legítima aqui).
  IF v_estab_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.estabelecimentos WHERE id = p_estab_id) THEN
      RAISE EXCEPTION 'ESTABELECIMENTO_NAO_ENCONTRADO'
        USING HINT = 'Nenhum estabelecimento com o id informado';
    END IF;
    RAISE EXCEPTION 'ESTADO_INVALIDO'
      USING HINT = 'Só é possível aprovar um lojista em status em_analise';
  END IF;

  RETURN v_estab_id;
END;
$$;

COMMENT ON FUNCTION public.aprovar_lojista(uuid) IS
  'Story 3.8 (SIMPLE). Admin aprova lojista: status em_analise → ativo, grava '
  'aprovado_em/aprovado_por. SECURITY DEFINER guardada por is_admin(). SEM Asaas, '
  'SEM hub, SEM push (piloto status-only). Erros: AUTENTICACAO_NECESSARIA, '
  'ACESSO_NEGADO, ESTABELECIMENTO_NAO_ENCONTRADO, ESTADO_INVALIDO.';

-- -----------------------------------------------------------------------------
-- Hardening de grants — só o admin autenticado invoca; anon/PUBLIC nunca.
-- A autorização real é is_admin() DENTRO da função; o grant a `authenticated` apenas
-- expõe a RPC ao PostgREST — um authenticated não-admin recebe ACESSO_NEGADO.
-- Verificar com get_advisors(type='security') após aplicar.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.aprovar_lojista(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aprovar_lojista(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.aprovar_lojista(uuid) TO authenticated;
