-- =============================================================================
-- Bloco 10 (Cancelamento & Exceções — Épico 6) — coluna `pedidos.cliente_chegou_em`
-- + RPC `marcar_cliente_chegou` (pré-requisito real da Story 6.20).
-- Autor: @dev (Dex), delegado de @data-engineer (Dara). Data: 2026-08-14.
--
-- ============================ [AUTO-DECISION] — LER ANTES DE APLICAR ==========
-- A Story 6.20 (`docs/stories/6.20.story.md`, Dependencies) afirma que
-- "`cliente_chegou_em` já é gravado por `markClienteChegou` (Story 6.14, Done) —
-- nenhuma mudança necessária nesse lado". **Essa afirmação está INCORRETA para o
-- backend REAL** (só é verdadeira no mock). Confirmado por leitura direta do
-- código nesta sessão:
--   1. `20260813004932_criar_pedidos.sql` (linhas 37-38) deixa
--      `cliente_chegou_em`/`lojista_chegou_em` EXPLICITAMENTE "FORA do piloto".
--   2. `20260813022930_pedidos_add_saiu_hub_em.sql` (linhas 19-31) DECIDE
--      deliberadamente NÃO criar essas 2 colunas: o piloto atinge `status='no_hub'`
--      com UM check-in operacional do lojista (`avancar_estado_pedido`), sem
--      exigir o check-in do cliente — `docs/architecture/07-mvp-pilot-backend.md`
--      §"Fluxo do pedido no piloto" (linha 119: "um check-in operacional do
--      lojista" é suficiente).
--   3. A Story 6.14 (Done) formalizou isso: `order.supabase.ts#markClienteChegou`
--      permanece `NotImplementedError` — DEFERIDO (LATER), débito técnico
--      registrado no próprio story file (linhas 217/279/344).
--
-- A Story 6.20 (AC1/AC2), porém, EXIGE literalmente `cliente_chegou_em` como
-- âncora de tempo para o botão "Lojista não veio" e para o reforço server-side
-- da RPC `reportar_lojista_nao_veio` — sem essa coluna, a RPC ficaria
-- permanentemente inalcançável em `DATA_SOURCE=supabase` (`cliente_chegou_em
-- IS NOT NULL` nunca seria verdadeiro), quebrando o próprio propósito da Story.
--
-- DECISÃO: fechar esse gap AGORA, como pré-requisito desta Story (não é uma
-- regra de negócio nova — `markClienteChegou` já existe na `OrderPort` desde a
-- Story 1.10, já tem UI real conectada (`ChegueiAoHub.tsx`, Story 0.7) e já é
-- usado pelo mock; só o adapter Supabase real nunca foi completado). Ver
-- também `docs/stories/6.20.story.md` Change Log/Dev Agent Record para o
-- registro completo desta decisão.
--
-- Fontes normativas:
--   docs/architecture/03-data-models.md §5.1 (coluna `cliente_chegou_em
--   timestamptz`, mesmo nome/tipo do modelo-alvo).
--   Precedente direto de ADD COLUMN forward-only:
--   20260813022930_pedidos_add_saiu_hub_em.sql.
--
-- NÃO adiciono `lojista_chegou_em` aqui — nenhuma Story deste Bloco precisa
-- dela (a Story 6.20 só depende do lado CLIENTE); mantém escopo mínimo.
--
-- ============================ RPC `marcar_cliente_chegou` =====================
-- Autoriza por SESSÃO do cliente (`pedidos.cliente_id = auth.uid()`) — nunca um
-- id cru vindo do client (mesmo padrão de `listMine`/`avancar_estado_pedido`).
-- Exige `status = 'no_hub'` (mesma pré-condição que `ChegueiAoHub.tsx`/o mock já
-- impõem). Grava `cliente_chegou_em = NOW()` sem checar idempotência adicional —
-- mesmo comportamento do mock (`order.mock.ts#markClienteChegou`, sobrescreve a
-- cada chamada; a UI real não permite reenviar depois de confirmado).
--
-- ERROS NOMEADOS: AUTENTICACAO_NECESSARIA, PEDIDO_NAO_ENCONTRADO, ACESSO_NEGADO,
-- ESTADO_INVALIDO (REUSE das mesmas classes já usadas por `aceitar_pedido`/
-- `recusar_pedido` no adapter — mesma causa raiz).
--
-- HARDENING: SECURITY DEFINER + search_path=''; REVOKE PUBLIC/anon; EXECUTE só
-- authenticated. Verificar get_advisors(type='security') após aplicar.
--
-- ROLLBACK (forward-only):
--     DROP FUNCTION IF EXISTS public.marcar_cliente_chegou(uuid);
--     ALTER TABLE public.pedidos DROP COLUMN IF EXISTS cliente_chegou_em;
-- =============================================================================

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS cliente_chegou_em timestamptz;

COMMENT ON COLUMN public.pedidos.cliente_chegou_em IS
  'Bloco 10 (Story 6.20, pré-requisito). Check-in do CLIENTE no hub — gravado por '
  'marcar_cliente_chegou (RPC SECURITY DEFINER). Âncora de tempo para a janela '
  'businessConfig.esperaLojistaMaxMin (botão "Lojista não veio"). NULL até o '
  'cliente confirmar chegada (ChegueiAoHub.tsx).';

CREATE OR REPLACE FUNCTION public.marcar_cliente_chegou(
  p_pedido_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de cliente ausente ao chamar marcar_cliente_chegou';
  END IF;

  UPDATE public.pedidos p
  SET cliente_chegou_em = NOW()
  WHERE p.id = p_pedido_id
    AND p.cliente_id = v_uid
    AND p.status = 'no_hub'
  RETURNING p.id INTO v_id;

  IF v_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id) THEN
      RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'
        USING HINT = 'Nenhum pedido com o id informado';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id AND cliente_id = v_uid) THEN
      RAISE EXCEPTION 'ACESSO_NEGADO'
        USING HINT = 'Apenas o cliente dono do pedido pode confirmar chegada';
    END IF;

    RAISE EXCEPTION 'ESTADO_INVALIDO'
      USING HINT = 'Só é possível confirmar chegada com o pedido em status no_hub';
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.marcar_cliente_chegou(uuid) IS
  'Bloco 10 (pré-requisito da Story 6.20). Cliente dono confirma chegada ao hub: '
  'grava cliente_chegou_em = NOW() a partir de status=no_hub. SECURITY DEFINER '
  'guardada por auth.uid() = pedidos.cliente_id. Erros: AUTENTICACAO_NECESSARIA, '
  'PEDIDO_NAO_ENCONTRADO, ACESSO_NEGADO, ESTADO_INVALIDO.';

REVOKE ALL ON FUNCTION public.marcar_cliente_chegou(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.marcar_cliente_chegou(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.marcar_cliente_chegou(uuid) TO authenticated;
