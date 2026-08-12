-- =============================================================================
-- Story 3.9 (CORE) — RPC `rejeitar_lojista(p_estab_id uuid, p_motivo text)`
-- Épico 3 (Lojista / Aprovação). Autor: @data-engineer (Dara). Data: 2026-08-12.
--
-- Rejeição do piloto: muda status em_analise → rejeitado e grava motivo_rejeicao
-- (obrigatório, validado TAMBÉM server-side). SEM push, SEM e-mail (Story 2.11 LATER);
-- a exibição do motivo ao lojista é a Story 3.10 — aqui só persistimos o motivo,
-- íntegro e legível.
--
-- Fontes normativas:
--   docs/stories/3.9.story.md          AC2 (motivo trim, não vazio, validado server-side),
--                                      AC3 (falha honesta), AC4 (motivo íntegro, sem truncar)
--   docs/architecture/03-data-models.md §1.4 (status/motivo_rejeicao)
--   Depende de: 20260812132330 (is_admin), 20260812123046 (estabelecimentos + trigger).
--
-- MESMO PADRÃO da aprovar_lojista (SECURITY DEFINER + is_admin + trigger de
-- imutabilidade liberado por rodar como owner; auth.uid() = chamador). Ver comentário
-- extenso na migration 20260812132332.
--
-- VALIDAÇÃO SERVER-SIDE DO MOTIVO (AC2): a UI já valida motivo não vazio client-side,
-- mas a RPC NÃO confia nisso — btrim(p_motivo) e rejeita vazio com MOTIVO_OBRIGATORIO
-- (defesa contra bypass do client). Persistimos o motivo APÓS trim, preservando a
-- formatação interna (quebras de linha, espaços internos) — sem truncar (AC4).
--
-- ERROS NOMEADOS (mapeados pelo @dev): AUTENTICACAO_NECESSARIA, ACESSO_NEGADO,
-- MOTIVO_OBRIGATORIO, ESTABELECIMENTO_NAO_ENCONTRADO, ESTADO_INVALIDO.
--
-- ROLLBACK (forward-only):
--     DROP FUNCTION IF EXISTS public.rejeitar_lojista(uuid, text);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rejeitar_lojista(p_estab_id uuid, p_motivo text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_estab_id  uuid;
  v_motivo    text := btrim(COALESCE(p_motivo, ''));   -- trim; preserva formatação interna
BEGIN
  -- 1) Exige sessão autenticada.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de admin ausente ao chamar rejeitar_lojista';
  END IF;

  -- 2) Autorização: só admin.
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO'
      USING HINT = 'Apenas um admin (is_admin) pode rejeitar um lojista';
  END IF;

  -- 3) Motivo obrigatório — validado server-side (não confia no client). AC2.
  IF v_motivo = '' THEN
    RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'
      USING HINT = 'O motivo da rejeição é obrigatório (não pode ser vazio ou só espaços)';
  END IF;

  -- 4) Transição de estado: só rejeita quem está 'em_analise'. Grava o motivo íntegro.
  UPDATE public.estabelecimentos
  SET status          = 'rejeitado',
      motivo_rejeicao = v_motivo
  WHERE id = p_estab_id
    AND status = 'em_analise'
  RETURNING id INTO v_estab_id;

  -- 5) Nada atualizado: não existe ou não está em_analise. Erro honesto (AC3).
  IF v_estab_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.estabelecimentos WHERE id = p_estab_id) THEN
      RAISE EXCEPTION 'ESTABELECIMENTO_NAO_ENCONTRADO'
        USING HINT = 'Nenhum estabelecimento com o id informado';
    END IF;
    RAISE EXCEPTION 'ESTADO_INVALIDO'
      USING HINT = 'Só é possível rejeitar um lojista em status em_analise';
  END IF;

  RETURN v_estab_id;
END;
$$;

COMMENT ON FUNCTION public.rejeitar_lojista(uuid, text) IS
  'Story 3.9 (CORE). Admin rejeita lojista: status em_analise → rejeitado, grava '
  'motivo_rejeicao (trim, obrigatório, validado server-side, íntegro). SECURITY '
  'DEFINER guardada por is_admin(). SEM push/e-mail (piloto). Erros: '
  'AUTENTICACAO_NECESSARIA, ACESSO_NEGADO, MOTIVO_OBRIGATORIO, '
  'ESTABELECIMENTO_NAO_ENCONTRADO, ESTADO_INVALIDO.';

-- -----------------------------------------------------------------------------
-- Hardening de grants — idem aprovar_lojista. Verificar com get_advisors(security).
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rejeitar_lojista(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rejeitar_lojista(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rejeitar_lojista(uuid, text) TO authenticated;
