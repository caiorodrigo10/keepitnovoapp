-- =============================================================================
-- Bloco 08 — Fiação do LEDGER na RPC `confirmar_pin_pedido` (CREATE OR REPLACE, forward-only).
-- Autor: @data-engineer (Dara). Data: 2026-08-13.
--
-- O QUE MUDA vs. 20260813022932: no ACERTO do PIN (pedido → 'entregue'), passa a
-- inserir no ledger, na MESMA transação, o CRÉDITO do lojista pela entrega:
--   * `merchant_credit` (+ LÍQUIDO = subtotal − taxa_keepit + deslocamento)
--     com disponivel_em = entregue_em + interval '7 days'  (escrow D+7, Rodada 8).
--
-- SEC-006 (fechado no lado do ledger): o valor do crédito vem do SNAPSHOT
-- server-side do pedido (colunas subtotal_produtos_reais / taxa_keepit_reais /
-- taxa_deslocamento_reais lidas SOB o lock FOR UPDATE), NÃO recalculado nem vindo
-- do client. Não se confia em nenhuma entrada do app para o dinheiro.
--
-- INTOCADO (os testes existentes continuam válidos): assinatura, contrato de
-- retorno (resultado, tentativas_restantes, bloqueado_ate), lockout 5/5min, reset
-- por timestamp, FOR UPDATE anti-race, exceções estruturais. Só (a) o SELECT ganha
-- 3 colunas de snapshot e (b) o branch de ACERTO ganha 1 INSERT no ledger antes do
-- RETURN. entregue_em e disponivel_em usam o MESMO instante (v_agora) para o D+7
-- casar exatamente com entregue_em.
--
-- Model B (ver ledger 20260813050000): merchant_credit carrega o LÍQUIDO; a carteira
-- (view) bloqueia esse crédito até disponivel_em. charge/platform_fee (na criação)
-- são auditoria e ficam fora da carteira.
--
-- Depende de: 20260813050000 (lancamentos_financeiros), 20260813022932 (versao anterior).
--
-- ROLLBACK (forward-only): reaplicar a migration 20260813022932 (versao sem ledger).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.confirmar_pin_pedido(
  p_pedido_id uuid,
  p_pin       text
)
RETURNS TABLE (resultado text, tentativas_restantes int, bloqueado_ate timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_tentativas   constant int      := 5;
  c_janela_bloqueio  constant interval := interval '5 minutes';
  c_escrow           constant interval := interval '7 days';   -- D+7 (Rodada 8)

  v_uid          uuid := auth.uid();
  v_status       text;
  v_pin_hash     text;
  v_tentativas   int;
  v_bloqueado    timestamptz;
  v_estab_id     uuid;
  v_efetivas     int;
  v_novas        int;
  v_ate          timestamptz;
  v_agora        timestamptz;
  -- Snapshot financeiro do pedido (server-side; base do crédito — SEC-006).
  v_subtotal     numeric(10,2);
  v_deslocamento numeric(10,2);
  v_taxa_keepit  numeric(10,2);
  v_liquido_cent bigint;
BEGIN
  -- 1) Exige sessão autenticada.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de lojista ausente ao chamar confirmar_pin_pedido';
  END IF;

  -- 2) Trava a linha do pedido e lê estado + SNAPSHOT financeiro (serializa concorrência).
  SELECT p.status, p.pin_hash, p.tentativas_pin, p.pin_bloqueado_ate, p.estabelecimento_id,
         p.subtotal_produtos_reais, p.taxa_deslocamento_reais, p.taxa_keepit_reais
    INTO v_status, v_pin_hash, v_tentativas, v_bloqueado, v_estab_id,
         v_subtotal, v_deslocamento, v_taxa_keepit
  FROM public.pedidos p
  WHERE p.id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'
      USING HINT = 'Nenhum pedido com o id informado';
  END IF;

  -- 3) Ownership/admin.
  IF NOT (
    public.is_admin(v_uid)
    OR EXISTS (
      SELECT 1 FROM public.estabelecimentos e
      WHERE e.id = v_estab_id
        AND e.dono_user_id = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO'
      USING HINT = 'Apenas o lojista dono do pedido (ou um admin) pode confirmar o PIN';
  END IF;

  -- 4) Bloqueio ATIVO? Devolve resultado (não consome tentativa).
  IF v_bloqueado IS NOT NULL AND v_bloqueado > NOW() THEN
    RETURN QUERY SELECT 'pin_bloqueado'::text, 0, v_bloqueado;
    RETURN;
  END IF;

  -- 5) Estado de entrada válido: SÓ 'no_hub'.
  IF v_status <> 'no_hub' THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO'
      USING HINT = 'Só é possível confirmar o PIN de um pedido em no_hub (no hub, pronto para retirada)';
  END IF;

  -- 6) Tentativas efetivas (reset por timestamp se o bloqueio expirou).
  IF v_bloqueado IS NOT NULL AND v_bloqueado <= NOW() THEN
    v_efetivas := 0;
  ELSE
    v_efetivas := COALESCE(v_tentativas, 0);
  END IF;

  -- 7) Compara o PIN (bcrypt). Nunca expõe hash/texto.
  IF extensions.crypt(p_pin, v_pin_hash) = v_pin_hash THEN
    -- ACERTO → entrega. Um único instante para entregue_em e o D+7.
    v_agora := NOW();

    UPDATE public.pedidos p
    SET status            = 'entregue',
        entregue_em       = v_agora,
        tentativas_pin    = 0,
        pin_bloqueado_ate = NULL
    WHERE p.id = p_pedido_id
      AND p.status = 'no_hub';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ESTADO_INVALIDO'
        USING HINT = 'O pedido deixou de estar em no_hub durante a confirmação';
    END IF;

    -- LEDGER (Bloco 08): crédito LÍQUIDO da entrega, do SNAPSHOT server-side (SEC-006).
    --   liquido = subtotal − taxa_keepit + deslocamento (reais) → centavos.
    --   disponivel_em = entregue_em + 7 dias (escrow D+7). status='concluido'.
    v_liquido_cent := (ROUND(
      (COALESCE(v_subtotal, 0) - COALESCE(v_taxa_keepit, 0) + COALESCE(v_deslocamento, 0)) * 100
    ))::bigint;

    INSERT INTO public.lancamentos_financeiros (
      estabelecimento_id, pedido_id, tipo, valor_centavos, status, disponivel_em, detalhe
    )
    VALUES (
      v_estab_id, p_pedido_id, 'merchant_credit', v_liquido_cent,
      'concluido', v_agora + c_escrow,
      'Credito liquido da entrega (subtotal - taxa_keepit + deslocamento); libera em D+7.'
    );

    RETURN QUERY SELECT 'entregue'::text, NULL::int, NULL::timestamptz;
    RETURN;
  END IF;

  -- 8) ERRO de PIN (persiste o incremento; por isso RETURN, nunca RAISE).
  v_novas := v_efetivas + 1;

  IF v_novas >= c_max_tentativas THEN
    v_ate := NOW() + c_janela_bloqueio;
    UPDATE public.pedidos p
    SET tentativas_pin    = 0,
        pin_bloqueado_ate = v_ate
    WHERE p.id = p_pedido_id;

    RETURN QUERY SELECT 'pin_bloqueado'::text, 0, v_ate;
    RETURN;
  ELSE
    UPDATE public.pedidos p
    SET tentativas_pin    = v_novas,
        pin_bloqueado_ate = NULL
    WHERE p.id = p_pedido_id;

    RETURN QUERY SELECT 'pin_incorreto'::text, (c_max_tentativas - v_novas), NULL::timestamptz;
    RETURN;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.confirmar_pin_pedido(uuid, text) IS
  'Bloco 07 + Bloco 08. Lojista dono (ou admin) confirma a ENTREGA validando o PIN (bcrypt). '
  'Unico caminho para ''entregue''. Bloco 08: no ACERTO grava no ledger merchant_credit LIQUIDO '
  '(subtotal - taxa_keepit + deslocamento) do SNAPSHOT server-side (SEC-006), disponivel_em = '
  'entregue_em + 7 dias (escrow D+7). Lockout 5/5min, reset por timestamp, FOR UPDATE anti-race. '
  'Retorna (resultado, tentativas_restantes, bloqueado_ate). Excecoes: AUTENTICACAO_NECESSARIA, '
  'PEDIDO_NAO_ENCONTRADO, ACESSO_NEGADO, ESTADO_INVALIDO.';

REVOKE ALL ON FUNCTION public.confirmar_pin_pedido(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirmar_pin_pedido(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirmar_pin_pedido(uuid, text) TO authenticated;
