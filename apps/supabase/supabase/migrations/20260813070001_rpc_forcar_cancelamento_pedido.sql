-- =============================================================================
-- Bloco 09 (Operação Admin — Épico 8) — RPC `forcar_cancelamento_pedido` (Story 8.4).
-- Autor: @data-engineer (Dara). Data: 2026-08-13.
--
-- Admin força o cancelamento de um pedido e gera, na MESMA transação, um reembolso
-- TOTAL (100%) pendente no ledger. Único produtor de `tipo='refund'` do Bloco 09
-- (os demais produtores — 6.11/6.18–6.21 — ficam para o Bloco 10).
--
-- Fontes normativas:
--   docs/stories/8.4.story.md AC3/AC4 (transição + refund 100% atômicos; motivo
--       obrigatório; bloqueio em estado terminal).
--   docs/PERGUNTAS_REGRAS_NEGOCIO.md → Decisões → Rodada 2 → "Cancelamento e exceções"
--       + "Painel admin Keepit" (forçar cancelamento com estorno = 100%, ratificado no
--       plano do Bloco 09).
--   docs/architecture/03-data-models.md §5.1 (status 'cancelado_admin' já no CHECK) / §6.1.
--   Precedente de estilo: 20260813060000_rpc_criar_pedido_..._sec006.sql (INSERT no ledger).
--
-- ============================ ATOMICIDADE (crítico — AC4) =====================
-- A transição do pedido e o INSERT do refund vão numa ÚNICA função plpgsql = UMA
-- transação (o applier envolve a migration inteira; a chamada em runtime é uma
-- transação implícita). Uma falha em qualquer passo aborta os DOIS — NUNCA um pedido
-- 'cancelado_admin' sem refund correspondente, nem um refund órfão sem o pedido
-- cancelado.
--
-- ============================ VALOR DO REEMBOLSO (100%, sem cálculo) ==========
-- valor_centavos = -ROUND(total_pago_reais * 100)::bigint (NEGATIVO — convenção do
-- ledger: refund reduz / é dinheiro que SAI ao cliente; ver 20260813050000, sinal).
-- 100% = total pago do pedido, sem desconto — regra fechada (Rodada 2 + plano Bloco 09).
-- O refund nasce status='pendente', disponivel_em=NULL (efeito imediato, não escrow):
-- entra na fila de reembolsos (8.1) e o admin o confirma depois via
-- confirmar_lancamento_admin (8.2). estabelecimento_id copiado do pedido (auditoria).
--
-- ============================ ESTADOS QUE BLOQUEIAM (AC3) =====================
-- [AUTO-DECISION] A missão manda bloquear só 'entregue'. ESTENDO para TODOS os estados
-- TERMINAIS (reason: (1) reforçar cancelamento sobre um pedido JÁ cancelado/recusado/
-- estornado geraria um SEGUNDO refund 100% = DOUBLE-REFUND, bug financeiro; (2) a Story
-- 8.4 (Dependencies + AC3) recomenda explicitamente preservar o conjunto conservador
-- TERMINAL_PEDIDO_STATUSES já usado na UI mock — "preservar o comportamento mais
-- conservador salvo decisão em contrário"). Ativos (podem forçar cancelamento):
-- aguardando_pagamento, aguardando_aceite, aceito, em_preparo, saindo_hub, no_hub.
-- Terminais (→ ESTADO_INVALIDO): entregue, cancelado, cancelado_timeout, cancelado_atraso,
-- cancelado_admin, recusado, nao_retirado, nao_entregue_lojista, estornado_chargeback.
--
-- ============================ VALIDAÇÕES / ERROS ==============================
--   * AUTENTICACAO_NECESSARIA — sem sessão.
--   * NAO_AUTORIZADO          — autor não é admin.
--   * MOTIVO_OBRIGATORIO      — p_motivo nulo/vazio (validação server-side, não só UI).
--   * PEDIDO_NAO_ENCONTRADO   — id inexistente.
--   * ESTADO_INVALIDO         — pedido em estado terminal (ver acima).
--
-- HARDENING: SECURITY DEFINER + search_path=''; REVOKE PUBLIC/anon; EXECUTE só
-- authenticated (guard is_admin() decide quem de fato pode). Verificar
-- get_advisors(type='security') após aplicar.
--
-- NOTA (fora do escopo desta RPC): "Lojista não apareceu → 100% cliente + FALHA de
-- qualidade" (matriz Rodada 2) é um fluxo de NO-SHOW distinto (Bloco 10) — forçar
-- cancelamento pelo admin NÃO insere `estabelecimentos_falhas` aqui (apenas o refund).
--
-- ROLLBACK (forward-only):
--     DROP FUNCTION IF EXISTS public.forcar_cancelamento_pedido(uuid, text);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.forcar_cancelamento_pedido(
  p_pedido_id uuid,
  p_motivo    text
)
RETURNS TABLE (
  pedido_id       uuid,
  status          text,
  refund_id       uuid,
  refund_centavos bigint            -- assinado (negativo, como gravado no ledger)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_estab    uuid;
  v_total    numeric(10,2);
  v_status   text;
  v_refund   uuid;
  v_cent     bigint;
BEGIN
  -- 1) Sessão autenticada.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão ausente ao chamar forcar_cancelamento_pedido';
  END IF;

  -- 2) Só admin.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO'
      USING HINT = 'Apenas administradores forçam cancelamento de pedido';
  END IF;

  -- 3) Motivo obrigatório (server-side; TRIM evita string só de espaços).
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'
      USING HINT = 'Informe o motivo do cancelamento forçado';
  END IF;

  -- 4) Trava o pedido e lê estado/valores.
  SELECT p.estabelecimento_id, p.total_pago_reais, p.status
    INTO v_estab, v_total, v_status
  FROM public.pedidos p
  WHERE p.id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'
      USING HINT = 'Nenhum pedido com o id informado';
  END IF;

  -- 5) Bloqueia estados terminais (evita double-refund; ver AUTO-DECISION no cabeçalho).
  IF v_status IN (
    'entregue', 'cancelado', 'cancelado_timeout', 'cancelado_atraso', 'cancelado_admin',
    'recusado', 'nao_retirado', 'nao_entregue_lojista', 'estornado_chargeback'
  ) THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO'
      USING HINT = 'Pedido em estado terminal não pode ser cancelado à força';
  END IF;

  -- 6) Reembolso total (100%) em centavos, NEGATIVO (convenção do ledger).
  v_cent := -(ROUND(COALESCE(v_total, 0) * 100))::bigint;

  -- 7) Transiciona o pedido → 'cancelado_admin' + motivo + cancelado_em.
  UPDATE public.pedidos p
     SET status              = 'cancelado_admin',
         motivo_cancelamento = p_motivo,
         cancelado_em        = NOW()
   WHERE p.id = p_pedido_id;

  -- 8) INSERT do refund 100% pendente (mesma transação). Vai à fila da 8.1; o admin o
  --    confirma depois via confirmar_lancamento_admin (8.2). disponivel_em=NULL (imediato).
  INSERT INTO public.lancamentos_financeiros (
    estabelecimento_id, pedido_id, tipo, valor_centavos, status, ator_admin_id,
    disponivel_em, detalhe
  )
  VALUES (
    v_estab, p_pedido_id, 'refund', v_cent, 'pendente', v_uid,
    NULL, 'Reembolso total (100%) por cancelamento forçado do admin. Motivo: ' || p_motivo
  )
  RETURNING id INTO v_refund;

  RETURN QUERY SELECT p_pedido_id, 'cancelado_admin'::text, v_refund, v_cent;
END;
$$;

COMMENT ON FUNCTION public.forcar_cancelamento_pedido(uuid, text) IS
  'Bloco 09 (Story 8.4). Admin força cancelamento: valida sessão/admin/motivo, bloqueia '
  'estados terminais (anti double-refund), transiciona pedidos.status -> ''cancelado_admin'' '
  '(+ motivo_cancelamento + cancelado_em) e INSERE refund 100% (valor_centavos = '
  '-total_pago_reais*100, status ''pendente'', ator_admin_id) na MESMA transação. Único '
  'produtor de refund do Bloco 09. SECURITY DEFINER + search_path='''' + guard is_admin(). '
  'Erros: AUTENTICACAO_NECESSARIA, NAO_AUTORIZADO, MOTIVO_OBRIGATORIO, '
  'PEDIDO_NAO_ENCONTRADO, ESTADO_INVALIDO.';

REVOKE ALL ON FUNCTION public.forcar_cancelamento_pedido(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.forcar_cancelamento_pedido(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.forcar_cancelamento_pedido(uuid, text) TO authenticated;
