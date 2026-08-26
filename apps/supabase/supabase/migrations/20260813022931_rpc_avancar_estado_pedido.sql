-- =============================================================================
-- Bloco 07 (Retirada com PIN) — RPC `avancar_estado_pedido(p_pedido_id, p_novo_status)`
-- Autor: @data-engineer (Dara). Data: 2026-08-13.
--
-- O lojista DONO do estabelecimento (ou um admin) avança o estado operacional do
-- pedido no piloto, respeitando as transições permitidas. NÃO entrega (transição para
-- 'entregue' é EXCLUSIVA de confirmar_pin_pedido) e NÃO cancela/recusa (fora do bloco).
--
-- Fontes normativas:
--   docs/architecture/07-mvp-pilot-backend.md §"Fluxo do pedido no piloto"
--       (mapa de estados; at_hub='no_hub' via 1 check-in do lojista; delivered só via PIN)
--   docs/prd/epics/6-pedido-pin.md Story 6.12 (saindo_hub + saiu_hub_em) e 6.14 (no_hub)
--   docs/architecture/05-security.md §3.11 ("Convencao critica": transição via RPC
--       server-side, não UPDATE direto do app)
--   docs/architecture/03-data-models.md §5.1 (status/saiu_hub_em)
--
-- Depende de: 20260813004932 (pedidos + is_admin dep), 20260813004935 (padrão da RPC
--             aceitar_pedido — mesmo estilo de autorização/erros), 20260813022930
--             (coluna saiu_hub_em).
--
-- ============================ TRANSIÇÕES PERMITIDAS (piloto) ===================
--   aceito       → em_preparo
--   aceito       → saindo_hub   (grava saiu_hub_em = NOW())
--   em_preparo   → saindo_hub   (grava saiu_hub_em = NOW())
--   saindo_hub   → no_hub       (o "check-in operacional" único do lojista — o piloto
--                                não exige o check-in bilateral da Story 6.14)
-- QUALQUER outro alvo (entregue / cancelado* / recusado / nao_* / estornado / aguardando*)
--   ou qualquer par (origem→alvo) fora da lista acima → TRANSICAO_INVALIDA. Em especial:
--   'entregue' NUNCA é alcançável por esta RPC (só por confirmar_pin_pedido).
--
-- ============================ POR QUE RPC SECURITY DEFINER =====================
--   * Autorização server-side por OWNERSHIP (lojista dono do estabelecimento do pedido)
--     OU is_admin(). A RPC roda como owner (BYPASSRLS) → não confia em RLS; valida
--     ownership/admin explicitamente. auth.uid() é o do CHAMADOR (claim do JWT).
--   * Escreve mesmo com o RLS fail-closed de pedidos (UPDATE direto do app é NEGADO).
--   * Transição atômica: origem esperada + ownership + alvo TODOS na cláusula WHERE de
--     um único UPDATE → sem race (a segunda chamada concorrente não casa a origem e cai
--     em TRANSICAO_INVALIDA; nunca há duplo-avanço).
--
-- ERROS NOMEADOS (honestos — sem sucesso simulado): AUTENTICACAO_NECESSARIA,
--   TRANSICAO_INVALIDA (alvo fora do conjunto OU par origem→alvo inválido),
--   PEDIDO_NAO_ENCONTRADO, ACESSO_NEGADO. Distinção honesta dos 3 casos de UPDATE vazio:
--   não existe → PEDIDO_NAO_ENCONTRADO; existe mas não é do lojista → ACESSO_NEGADO;
--   é do lojista mas a origem não bate o alvo pedido → TRANSICAO_INVALIDA.
--
-- HARDENING (grants): REVOKE PUBLIC/anon; EXECUTE só para `authenticated` (a autorização
--   REAL é ownership/is_admin DENTRO da função). SET search_path = ''.
--   Verificar com get_advisors(type='security') após aplicar.
--
-- ROLLBACK (forward-only):
--     DROP FUNCTION IF EXISTS public.avancar_estado_pedido(uuid, text);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.avancar_estado_pedido(
  p_pedido_id   uuid,
  p_novo_status text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_new  text;
BEGIN
  -- 1) Exige sessão autenticada (a função ignora RLS; validamos aqui).
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de lojista ausente ao chamar avancar_estado_pedido';
  END IF;

  -- 2) Alvo tem de estar no conjunto de estados operacionais que ESTA RPC pode produzir.
  --    'entregue' e estados de cancelamento/recusa/timeout NÃO entram aqui (barra cedo,
  --    antes de tocar a tabela). 'entregue' é exclusivo de confirmar_pin_pedido.
  IF p_novo_status IS NULL
     OR p_novo_status NOT IN ('em_preparo', 'saindo_hub', 'no_hub') THEN
    RAISE EXCEPTION 'TRANSICAO_INVALIDA'
      USING HINT = 'Alvo permitido: em_preparo, saindo_hub ou no_hub '
                   '(entregue é exclusivo da confirmação de PIN; cancelamentos fora do bloco)';
  END IF;

  -- 3) Transição atômica: origem esperada (por alvo) + ownership/admin + alvo, tudo na
  --    cláusula WHERE de UM único UPDATE. Grava saiu_hub_em só quando o alvo é saindo_hub.
  UPDATE public.pedidos p
  SET status      = p_novo_status,
      saiu_hub_em = CASE WHEN p_novo_status = 'saindo_hub' THEN NOW() ELSE p.saiu_hub_em END
  WHERE p.id = p_pedido_id
    AND (
      (p_novo_status = 'em_preparo' AND p.status = 'aceito')
      OR (p_novo_status = 'saindo_hub' AND p.status IN ('aceito', 'em_preparo'))
      OR (p_novo_status = 'no_hub'    AND p.status = 'saindo_hub')
    )
    AND (
      public.is_admin(v_uid)
      OR EXISTS (
        SELECT 1 FROM public.estabelecimentos e
        WHERE e.id = p.estabelecimento_id
          AND e.dono_user_id = v_uid
      )
    )
  RETURNING p.status INTO v_new;

  -- 4) UPDATE vazio: distinguir os 3 casos com mensagem honesta.
  IF v_new IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id) THEN
      RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'
        USING HINT = 'Nenhum pedido com o id informado';
    END IF;

    IF NOT (
      public.is_admin(v_uid)
      OR EXISTS (
        SELECT 1 FROM public.pedidos p
        JOIN public.estabelecimentos e ON e.id = p.estabelecimento_id
        WHERE p.id = p_pedido_id
          AND e.dono_user_id = v_uid
      )
    ) THEN
      RAISE EXCEPTION 'ACESSO_NEGADO'
        USING HINT = 'Apenas o lojista dono do pedido (ou um admin) pode avançar o estado';
    END IF;

    -- É do lojista, alvo válido, mas a origem não permite a transição pedida.
    RAISE EXCEPTION 'TRANSICAO_INVALIDA'
      USING HINT = 'O estado atual do pedido não permite avançar para o alvo informado';
  END IF;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.avancar_estado_pedido(uuid, text) IS
  'Bloco 07. Lojista dono (ou admin) avança o estado operacional do pedido no piloto: '
  'aceito→em_preparo, aceito/em_preparo→saindo_hub (grava saiu_hub_em), saindo_hub→no_hub. '
  'NUNCA produz ''entregue'' (exclusivo de confirmar_pin_pedido) nem cancela/recusa. '
  'SECURITY DEFINER guardada por ownership/is_admin(); transição atômica no WHERE do UPDATE. '
  'Erros: AUTENTICACAO_NECESSARIA, TRANSICAO_INVALIDA, PEDIDO_NAO_ENCONTRADO, ACESSO_NEGADO.';

-- -----------------------------------------------------------------------------
-- Hardening de grants — só o lojista/admin autenticado invoca; anon/PUBLIC nunca.
-- A autorização real é ownership/is_admin() DENTRO da função.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.avancar_estado_pedido(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.avancar_estado_pedido(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.avancar_estado_pedido(uuid, text) TO authenticated;
