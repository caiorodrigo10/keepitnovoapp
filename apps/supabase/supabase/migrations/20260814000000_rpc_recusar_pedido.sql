-- =============================================================================
-- Bloco 10 (Cancelamento & Exceções — Épico 6) — RPC `recusar_pedido` (Story 6.11).
-- Autor: @dev (Dex), delegado de @data-engineer (Dara). Data: 2026-08-14.
--
-- O lojista DONO do estabelecimento (ou um admin) recusa um pedido ANTES do
-- aceite, informando um motivo: transição 'aguardando_aceite' -> 'recusado' +
-- reembolso TOTAL (100%) pendente no ledger, na MESMA transação.
--
-- Fontes normativas:
--   docs/stories/6.11.story.md AC2 (assinatura, validações, erros nomeados,
--       efeito atômico UPDATE+INSERT).
--   Precedente de ownership/status: 20260813004935_rpc_aceitar_pedido.sql
--       (mesmo padrão WHERE combinado ownership+status, mesma distinção honesta
--       de PEDIDO_NAO_ENCONTRADO / ACESSO_NEGADO / ESTADO_INVALIDO).
--   Precedente de atomicidade UPDATE+INSERT no ledger:
--       20260813070001_rpc_forcar_cancelamento_pedido.sql (refund 100%,
--       valor_centavos negativo, status='pendente', disponivel_em=NULL).
--
-- Depende de: 20260813004932 (pedidos), 20260812132330 (is_admin),
--             20260813050000 (lancamentos_financeiros).
--
-- ============================ POR QUE RPC SECURITY DEFINER =====================
-- Mesmo racional de aceitar_pedido: autorização por OWNERSHIP (lojista dono do
-- estabelecimento do pedido) OU is_admin(), avaliada DENTRO da função (nunca um
-- estabelecimento_id cru vindo do client). Escreve em `pedidos` (RLS fail-closed
-- para UPDATE direto) e em `lancamentos_financeiros` (RLS nega INSERT direto).
--
-- ============================ ATOMICIDADE (UPDATE + INSERT) ====================
-- Recusa e refund nascem na MESMA transação implícita da função: uma falha em
-- qualquer passo desfaz os dois — nunca existe um pedido 'recusado' sem o refund
-- correspondente, nem um refund órfão. Motivo obrigatório é checado ANTES de
-- qualquer mutação (mesmo padrão de forcar_cancelamento_pedido).
--
-- ============================ VALOR DO REEMBOLSO (100%, sem cálculo) ==========
-- valor_centavos = -ROUND(total_pago_reais * 100)::bigint. 100% = reembolso
-- integral, sem desconto (recusa é responsabilidade do lojista, não do cliente).
-- status='pendente', disponivel_em=NULL (efeito imediato — fila do Admin, 8.1/8.2).
--
-- ============================ ERROS NOMEADOS ===================================
--   * AUTENTICACAO_NECESSARIA — sem sessão.
--   * MOTIVO_OBRIGATORIO      — p_motivo nulo/vazio (server-side, não só UI).
--   * PEDIDO_NAO_ENCONTRADO   — id inexistente.
--   * ACESSO_NEGADO           — pedido existe mas não é do lojista chamador (nem admin).
--   * ESTADO_INVALIDO         — pedido não está mais em 'aguardando_aceite' (já
--                                aceito/recusado/etc — recusa só é possível ANTES
--                                do aceite, mesma janela que aceitar_pedido protege).
--
-- HARDENING: SECURITY DEFINER + search_path=''; REVOKE PUBLIC/anon; EXECUTE só
-- authenticated (a autorização real é ownership/is_admin() DENTRO da função).
-- Verificar get_advisors(type='security') após aplicar.
--
-- ROLLBACK (forward-only):
--     DROP FUNCTION IF EXISTS public.recusar_pedido(uuid, text);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recusar_pedido(
  p_pedido_id uuid,
  p_motivo    text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_id    uuid;
  v_estab uuid;
  v_total numeric(10,2);
  v_cent  bigint;
BEGIN
  -- 1) Exige sessão autenticada (a função ignora RLS; validamos aqui).
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de lojista ausente ao chamar recusar_pedido';
  END IF;

  -- 2) Motivo obrigatório (server-side; TRIM evita string só de espaços).
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'
      USING HINT = 'Informe o motivo da recusa';
  END IF;

  -- 3) Transição idempotente-segura: só recusa 'aguardando_aceite' E só se o
  --    pedido for da loja do chamador (dono) OU o chamador for admin. Ownership +
  --    estado juntos no WHERE do UPDATE — mesmo padrão de aceitar_pedido.
  UPDATE public.pedidos p
  SET status        = 'recusado',
      motivo_recusa = p_motivo
  WHERE p.id = p_pedido_id
    AND p.status = 'aguardando_aceite'
    AND (
      public.is_admin(v_uid)
      OR EXISTS (
        SELECT 1 FROM public.estabelecimentos e
        WHERE e.id = p.estabelecimento_id
          AND e.dono_user_id = v_uid
      )
    )
  RETURNING p.id, p.estabelecimento_id, p.total_pago_reais INTO v_id, v_estab, v_total;

  -- 4) Nada atualizado: distinguir os 3 casos com mensagem honesta (sem sucesso
  --    silencioso) — mesmo padrão de aceitar_pedido.
  IF v_id IS NULL THEN
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
        USING HINT = 'Apenas o lojista dono do pedido (ou um admin) pode recusá-lo';
    END IF;

    RAISE EXCEPTION 'ESTADO_INVALIDO'
      USING HINT = 'Só é possível recusar um pedido em status aguardando_aceite';
  END IF;

  -- 5) Reembolso total (100%) em centavos, NEGATIVO (convenção do ledger),
  --    mesma transação implícita do UPDATE acima.
  v_cent := -(ROUND(COALESCE(v_total, 0) * 100))::bigint;

  INSERT INTO public.lancamentos_financeiros (
    estabelecimento_id, pedido_id, tipo, valor_centavos, status, disponivel_em, detalhe
  )
  VALUES (
    v_estab, p_pedido_id, 'refund', v_cent, 'pendente', NULL,
    'Reembolso total (100%) por recusa do lojista. Motivo: ' || p_motivo
  );

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.recusar_pedido(uuid, text) IS
  'Bloco 10 (Story 6.11). Lojista dono (ou admin) recusa o pedido ANTES do aceite: '
  'aguardando_aceite -> recusado (+ motivo_recusa) E INSERE refund 100% pendente em '
  'lancamentos_financeiros, na MESMA transação. SECURITY DEFINER guardada por '
  'ownership/is_admin(). Erros: AUTENTICACAO_NECESSARIA, MOTIVO_OBRIGATORIO, '
  'PEDIDO_NAO_ENCONTRADO, ACESSO_NEGADO, ESTADO_INVALIDO.';

-- -----------------------------------------------------------------------------
-- Hardening de grants — só o lojista/admin autenticado invoca; anon/PUBLIC nunca.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.recusar_pedido(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recusar_pedido(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.recusar_pedido(uuid, text) TO authenticated;
