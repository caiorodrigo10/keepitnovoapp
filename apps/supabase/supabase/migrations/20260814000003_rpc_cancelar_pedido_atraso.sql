-- =============================================================================
-- Bloco 10 (Cancelamento & Exceções — Épico 6) — RPC `cancelar_pedido_atraso`
-- (Story 6.21).
-- Autor: @dev (Dex), delegado de @data-engineer (Dara). Data: 2026-08-14.
--
-- O CLIENTE, avisado in-app (via polling client-side, Story 6.13, sem
-- `pg_cron`/push — ver `docs/stories/6.21.story.md` Classificação) de que o
-- pedido está muito atrasado, cancela com reembolso integral. Na MESMA
-- transação: transiciona 'aceito'/'em_preparo' -> 'cancelado_atraso', insere
-- refund TOTAL (100%) pendente e registra a falha de qualidade do lojista
-- (`tipo='atraso_grave'`).
--
-- Depende de: 20260813004932 (pedidos), 20260813050000 (lancamentos_financeiros),
--   20260813070005 (estabelecimentos_falhas).
--
-- Fontes normativas:
--   docs/stories/6.21.story.md AC2 (assinatura, validações, erros nomeados,
--       os 3 efeitos atômicos).
--   Mesmo padrão estrutural da RPC irmã desta Story:
--   20260814000002_rpc_reportar_lojista_nao_veio.sql (Story 6.20, mesmo Bloco).
--
-- ============================ POR QUE RPC SECURITY DEFINER =====================
-- Mesma dupla necessidade da RPC irmã (6.20): `pedidos` tem RLS fail-closed
-- para UPDATE direto; `estabelecimentos_falhas` tem RLS ADMIN-ONLY
-- (`05-security.md` §3.6) — o CLIENTE (não-admin) só insere ali porque a
-- função roda como o dono (BYPASSRLS). Autorização real (cliente dono do
-- pedido) validada DENTRO da função.
--
-- ============================ REFORÇO SERVER-SIDE DO ATRASO (AC1/AC2) =========
-- `NOW() > aceito_em + 2 * tempo_estimado_min` — mesmo multiplicador (2x)
-- literal do épico, avaliado no servidor. Mesma disciplina da RPC irmã
-- (Story 6.20): nunca confia só no client ter mostrado o prompt — um cliente
-- que chame a RPC direto (sem o prompt ter aparecido) é rejeitado.
--
-- ============================ ATOMICIDADE (3 efeitos) ==========================
-- UPDATE (status + cancelado_em) + INSERT (refund) + INSERT (falha) na MESMA
-- transação implícita da função — mesmo racional de
-- `reportar_lojista_nao_veio`/`forcar_cancelamento_pedido`/`recusar_pedido`.
--
-- ============================ ERROS NOMEADOS ===================================
--   * AUTENTICACAO_NECESSARIA — sem sessão.
--   * PEDIDO_NAO_ENCONTRADO   — id inexistente.
--   * ACESSO_NEGADO           — pedido não é do cliente chamador.
--   * ESTADO_INVALIDO         — status fora de ('aceito', 'em_preparo').
--   * ATRASO_NAO_CONFIRMADO   — chamada antes de aceito_em + 2*tempo_estimado_min.
--
-- HARDENING: SECURITY DEFINER + search_path=''; REVOKE PUBLIC/anon; EXECUTE só
-- authenticated. Verificar get_advisors(type='security') após aplicar.
--
-- ROLLBACK (forward-only):
--     DROP FUNCTION IF EXISTS public.cancelar_pedido_atraso(uuid);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cancelar_pedido_atraso(
  p_pedido_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Multiplicador literal do épico (Story 6.21 AC1/AC2) — "2x tempo_estimado_min".
  c_multiplicador_atraso constant int := 2;

  v_uid       uuid := auth.uid();
  v_id        uuid;
  v_estab     uuid;
  v_total     numeric(10,2);
  v_numero    int;
  v_status    text;
  v_aceito_em timestamptz;
  v_tempo_est int;
  v_cent      bigint;
BEGIN
  -- 1) Sessão autenticada.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de cliente ausente ao chamar cancelar_pedido_atraso';
  END IF;

  -- 2) Trava o pedido e lê estado/valores necessários às validações e ao efeito.
  SELECT p.estabelecimento_id, p.total_pago_reais, p.numero, p.status,
         p.aceito_em, p.tempo_estimado_min
    INTO v_estab, v_total, v_numero, v_status, v_aceito_em, v_tempo_est
  FROM public.pedidos p
  WHERE p.id = p_pedido_id
    AND p.cliente_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id) THEN
      RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'
        USING HINT = 'Nenhum pedido com o id informado';
    END IF;
    RAISE EXCEPTION 'ACESSO_NEGADO'
      USING HINT = 'Apenas o cliente dono do pedido pode cancelar por atraso';
  END IF;

  -- 3) Estado: só a partir de 'aceito'/'em_preparo' (mesmo conjunto do AC1/AC2).
  IF v_status NOT IN ('aceito', 'em_preparo') THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO'
      USING HINT = 'Só é possível cancelar por atraso a partir de aceito ou em_preparo';
  END IF;

  -- 4) Reforço SERVER-SIDE do atraso — nunca confia só no client ter mostrado o prompt.
  IF v_aceito_em IS NULL OR v_tempo_est IS NULL
     OR NOW() <= v_aceito_em + (c_multiplicador_atraso * v_tempo_est * interval '1 minute') THEN
    RAISE EXCEPTION 'ATRASO_NAO_CONFIRMADO'
      USING HINT = 'Atraso ainda não confirmado (NOW() <= aceito_em + 2 * tempo_estimado_min)';
  END IF;

  -- 5) Transição do pedido.
  UPDATE public.pedidos p
     SET status       = 'cancelado_atraso',
         cancelado_em = NOW()
   WHERE p.id = p_pedido_id
  RETURNING p.id INTO v_id;

  -- 6) Reembolso total (100%) pendente, mesma convenção de sinal do ledger.
  v_cent := -(ROUND(COALESCE(v_total, 0) * 100))::bigint;

  INSERT INTO public.lancamentos_financeiros (
    estabelecimento_id, pedido_id, tipo, valor_centavos, status, disponivel_em, detalhe
  )
  VALUES (
    v_estab, p_pedido_id, 'refund', v_cent, 'pendente', NULL,
    'Reembolso total (100%) — cancelado por atraso do lojista.'
  );

  -- 7) Falha de qualidade do lojista.
  INSERT INTO public.estabelecimentos_falhas (
    estabelecimento_id, pedido_id, tipo, detalhes
  )
  VALUES (
    v_estab, p_pedido_id, 'atraso_grave',
    'Pedido #' || v_numero || ' — cancelado pelo cliente por atraso além de 2x o tempo estimado.'
  );

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.cancelar_pedido_atraso(uuid) IS
  'Bloco 10 (Story 6.21). Cliente dono cancela por atraso grave do lojista: '
  'valida status IN (aceito, em_preparo) + reforço server-side de '
  'NOW() > aceito_em + 2*tempo_estimado_min; em sucesso, na MESMA transação: '
  'status -> cancelado_atraso (+cancelado_em), INSERT refund 100% pendente, '
  'INSERT falha (tipo=atraso_grave). SECURITY DEFINER (única forma de um '
  'cliente não-admin escrever em estabelecimentos_falhas, RLS admin-only). '
  'Erros: AUTENTICACAO_NECESSARIA, PEDIDO_NAO_ENCONTRADO, ACESSO_NEGADO, '
  'ESTADO_INVALIDO, ATRASO_NAO_CONFIRMADO.';

REVOKE ALL ON FUNCTION public.cancelar_pedido_atraso(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancelar_pedido_atraso(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido_atraso(uuid) TO authenticated;
