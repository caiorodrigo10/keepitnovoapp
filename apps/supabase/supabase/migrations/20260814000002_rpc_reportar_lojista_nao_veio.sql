-- =============================================================================
-- Bloco 10 (Cancelamento & Exceções — Épico 6) — RPC `reportar_lojista_nao_veio`
-- (Story 6.20).
-- Autor: @dev (Dex), delegado de @data-engineer (Dara). Data: 2026-08-14.
--
-- O CLIENTE, esperando no hub sem o lojista aparecer, reporta o no-show do
-- lojista. Na MESMA transação: transiciona 'no_hub' -> 'nao_entregue_lojista',
-- insere refund TOTAL (100%) pendente no ledger e registra a falha de qualidade
-- do lojista em `estabelecimentos_falhas` (tipo='lojista_nao_apareceu').
--
-- Depende de: 20260813004932 (pedidos), 20260813050000 (lancamentos_financeiros),
--   20260813070005 (estabelecimentos_falhas), 20260814000001 (cliente_chegou_em
--   — pré-requisito desta MESMA Story, ver comentário daquela migration).
--
-- Fontes normativas:
--   docs/stories/6.20.story.md AC2 (assinatura, validações, erros nomeados,
--       os 3 efeitos atômicos).
--   20260813070005_criar_estabelecimentos_falhas.sql (linhas 41-42: "Falhas
--       disparadas por cliente/lojista (não-admin) exigirão RPC SECURITY
--       DEFINER no Bloco 10" — decisão já antecipada, confirmada aqui).
--
-- ============================ POR QUE RPC SECURITY DEFINER =====================
-- Dupla necessidade: (1) `pedidos` tem RLS fail-closed para UPDATE direto; (2)
-- `estabelecimentos_falhas` tem RLS ADMIN-ONLY (`05-security.md` §3.6) — o
-- CLIENTE (não-admin) só consegue inserir ali porque a função roda como o dono
-- (BYPASSRLS). A autorização real (cliente dono do pedido) é validada DENTRO da
-- função, nunca delegada a uma policy.
--
-- ============================ REFORÇO SERVER-SIDE DO TEMPO (AC1/AC2) ==========
-- A constante `c_espera_lojista_max_min` abaixo espelha
-- `businessConfig.esperaLojistaMaxMin` (`packages/config/src/index.ts`) — MESMO
-- padrão já usado por `confirmar_pin_pedido` para `pinTentativasMax`/
-- `pinBloqueioMin` (constantes NO SQL; fonte-de-verdade da UI é `businessConfig`,
-- mantidas em sync manualmente). Nunca confia só na visibilidade do botão na UI:
-- um cliente que manipule o relógio local ou chame a RPC direto não dispara o
-- reembolso antes da hora.
--
-- ============================ ATOMICIDADE (3 efeitos) ==========================
-- UPDATE (status) + INSERT (refund) + INSERT (falha) na MESMA transação
-- implícita da função — nunca existe `nao_entregue_lojista` sem refund/falha, e
-- vice-versa. Mesmo racional de `forcar_cancelamento_pedido`/`recusar_pedido`.
--
-- ============================ ERROS NOMEADOS ===================================
--   * AUTENTICACAO_NECESSARIA    — sem sessão.
--   * PEDIDO_NAO_ENCONTRADO      — id inexistente.
--   * ACESSO_NEGADO              — pedido não é do cliente chamador.
--   * ESTADO_INVALIDO            — status != 'no_hub' OU cliente_chegou_em NULL.
--   * TEMPO_MINIMO_NAO_ATINGIDO  — chamada antes de cliente_chegou_em +
--                                   max(tempo_estimado_min, 20min).
--
-- HARDENING: SECURITY DEFINER + search_path=''; REVOKE PUBLIC/anon; EXECUTE só
-- authenticated. Verificar get_advisors(type='security') após aplicar.
--
-- ROLLBACK (forward-only):
--     DROP FUNCTION IF EXISTS public.reportar_lojista_nao_veio(uuid);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reportar_lojista_nao_veio(
  p_pedido_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Espelha businessConfig.esperaLojistaMaxMin (packages/config) — manter em
  -- sync manualmente se o valor de negócio mudar (mesmo padrão já usado por
  -- confirmar_pin_pedido para pinTentativasMax/pinBloqueioMin).
  c_espera_lojista_max_min constant int := 20;

  v_uid          uuid := auth.uid();
  v_id           uuid;
  v_estab        uuid;
  v_total        numeric(10,2);
  v_numero       int;
  v_status       text;
  v_chegou       timestamptz;
  v_tempo_est    int;
  v_cent         bigint;
BEGIN
  -- 1) Sessão autenticada.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de cliente ausente ao chamar reportar_lojista_nao_veio';
  END IF;

  -- 2) Trava o pedido e lê estado/valores necessários às validações e ao efeito.
  SELECT p.estabelecimento_id, p.total_pago_reais, p.numero, p.status,
         p.cliente_chegou_em, p.tempo_estimado_min
    INTO v_estab, v_total, v_numero, v_status, v_chegou, v_tempo_est
  FROM public.pedidos p
  WHERE p.id = p_pedido_id
    AND p.cliente_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Distingue "não existe" de "existe mas não é do chamador" — mensagem honesta.
    IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id) THEN
      RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'
        USING HINT = 'Nenhum pedido com o id informado';
    END IF;
    RAISE EXCEPTION 'ACESSO_NEGADO'
      USING HINT = 'Apenas o cliente dono do pedido pode reportar o no-show do lojista';
  END IF;

  -- 3) Estado: precisa estar em 'no_hub' e ter check-in do cliente registrado.
  IF v_status IS DISTINCT FROM 'no_hub' OR v_chegou IS NULL THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO'
      USING HINT = 'Só é possível reportar no-show do lojista com o pedido em no_hub e cliente_chegou_em preenchido';
  END IF;

  -- 4) Reforço SERVER-SIDE da condição de tempo do AC1 — nunca confia só na UI.
  IF NOW() <= v_chegou + (GREATEST(COALESCE(v_tempo_est, 0), c_espera_lojista_max_min) * interval '1 minute') THEN
    RAISE EXCEPTION 'TEMPO_MINIMO_NAO_ATINGIDO'
      USING HINT = 'Tempo mínimo de espera pelo lojista ainda não atingido';
  END IF;

  -- 5) Transição do pedido.
  UPDATE public.pedidos p
     SET status = 'nao_entregue_lojista'
   WHERE p.id = p_pedido_id
  RETURNING p.id INTO v_id;

  -- 6) Reembolso total (100%) pendente, mesma convenção de sinal do ledger.
  v_cent := -(ROUND(COALESCE(v_total, 0) * 100))::bigint;

  INSERT INTO public.lancamentos_financeiros (
    estabelecimento_id, pedido_id, tipo, valor_centavos, status, disponivel_em, detalhe
  )
  VALUES (
    v_estab, p_pedido_id, 'refund', v_cent, 'pendente', NULL,
    'Reembolso total (100%) — lojista não compareceu ao hub.'
  );

  -- 7) Falha de qualidade do lojista (único produtor não-admin desta migration).
  INSERT INTO public.estabelecimentos_falhas (
    estabelecimento_id, pedido_id, tipo, detalhes
  )
  VALUES (
    v_estab, p_pedido_id, 'lojista_nao_apareceu',
    'Pedido #' || v_numero || ' — lojista não compareceu ao hub dentro do prazo.'
  );

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.reportar_lojista_nao_veio(uuid) IS
  'Bloco 10 (Story 6.20). Cliente dono reporta que o lojista não apareceu no hub: '
  'valida status=no_hub + cliente_chegou_em preenchido + reforço server-side do '
  'tempo mínimo (max(tempo_estimado_min, 20min)); em sucesso, na MESMA transação: '
  'status -> nao_entregue_lojista, INSERT refund 100% pendente, INSERT falha '
  '(tipo=lojista_nao_apareceu). SECURITY DEFINER (única forma de um cliente '
  'não-admin escrever em estabelecimentos_falhas, RLS admin-only). Erros: '
  'AUTENTICACAO_NECESSARIA, PEDIDO_NAO_ENCONTRADO, ACESSO_NEGADO, ESTADO_INVALIDO, '
  'TEMPO_MINIMO_NAO_ATINGIDO.';

REVOKE ALL ON FUNCTION public.reportar_lojista_nao_veio(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reportar_lojista_nao_veio(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reportar_lojista_nao_veio(uuid) TO authenticated;
