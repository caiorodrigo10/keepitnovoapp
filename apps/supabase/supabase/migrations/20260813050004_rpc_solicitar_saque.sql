-- =============================================================================
-- Bloco 08 — RPC `solicitar_saque(p_valor_centavos bigint)` SECURITY DEFINER (lojista).
-- Autor: @data-engineer (Dara). Data: 2026-08-13.
--
-- O lojista logado solicita um saque do saldo DISPONÍVEL da sua carteira. Cria um
-- lançamento `payout` (− valor) com status 'pendente' (o Admin executa o PIX real
-- no Bloco 09, promovendo para 'concluido' + asaas_id_externo). NÃO move dinheiro
-- aqui — só registra a intenção, já reservando o saldo (o payout 'pendente' entra
-- no cálculo do disponível → previne overdraw / dois saques do mesmo saldo).
--
-- Fontes normativas:
--   docs/architecture/03-data-models.md §6.1/§6.2 (payout negativo; 'pendente'→'concluido';
--       nota: mínimo de saque NÃO vive no schema — é businessConfig.saqueMinimoReais)
--   docs/PERGUNTAS_REGRAS_NEGOCIO.md Rodada 8 (saque sob demanda, mínimo R$200)
--   packages/config/src/index.ts (businessConfig.saqueMinimoReais = 200) — FONTE-DE-VERDADE
--       da UI. Aqui replico como GUARDA server-side inegociável (constante c_min_centavos).
--   packages/core-data/src/ports/wallet.port.ts (WalletPort.requestWithdrawal → Saque)
--
-- Depende de: 20260813050000 (lancamentos_financeiros), 20260813050001 (view — mesma
--             fórmula de saldo disponível), meu_estabelecimento_id(), estabelecimentos.
--
-- ============================ VALIDAÇÕES / ERROS ==============================
--   * AUTENTICACAO_NECESSARIA        — sem sessão.
--   * ESTABELECIMENTO_NAO_ENCONTRADO — autor não é dono de nenhum estabelecimento
--       (guarda estrutural adicionada além dos 3 erros nomeados da missão: um não-
--       lojista precisa de erro honesto, não de null-deref). [AUTO-DECISION]
--   * VALOR_MINIMO_SAQUE             — valor NULL ou < R$200 (20000 centavos).
--   * SALDO_INSUFICIENTE             — saldo_disponivel < valor solicitado.
--
-- SALDO em CENTAVOS: calculado DIRETO do ledger (bigint, sem float) com o MESMO
-- filtro da view carteira_lojista.saldo_disponivel (Model B): merchant_credit
-- liberado/imediato + payouts (status<>'erro', que inclui pendentes). Manter os dois
-- em sincronia se a regra mudar. Uso centavos (não a view em reais) para evitar
-- comparação de dinheiro em ponto flutuante.
--
-- CONCORRÊNCIA: SELECT ... FOR UPDATE na linha do estabelecimento serializa saques
-- simultâneos do mesmo lojista (o 2º relê o saldo já reduzido pelo payout pendente
-- do 1º) — sem overdraw.
--
-- HARDENING: SECURITY DEFINER + search_path=''; REVOKE PUBLIC/anon; EXECUTE só
-- authenticated. Verificar get_advisors(type='security') após aplicar.
--
-- ROLLBACK (forward-only):
--     DROP FUNCTION IF EXISTS public.solicitar_saque(bigint);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.solicitar_saque(
  p_valor_centavos bigint
)
RETURNS TABLE (
  lancamento_id      uuid,
  estabelecimento_id uuid,
  valor_centavos     bigint,   -- assinado (negativo, como gravado no ledger)
  status             text,
  solicitado_em      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Guarda server-side do mínimo. FONTE-DE-VERDADE da UI: packages/config
  -- (businessConfig.saqueMinimoReais = 200). Se mudar lá, alinhar aqui (mudança consciente).
  c_min_centavos constant bigint := 20000;   -- R$ 200,00

  v_uid           uuid := auth.uid();
  v_estab         uuid;
  v_saldo_cent    bigint;
  v_new_id        uuid;
  v_criado        timestamptz;
BEGIN
  -- 1) Exige sessão autenticada.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de lojista ausente ao chamar solicitar_saque';
  END IF;

  -- 2) O autor tem de ser dono de um estabelecimento.
  v_estab := public.meu_estabelecimento_id();
  IF v_estab IS NULL THEN
    RAISE EXCEPTION 'ESTABELECIMENTO_NAO_ENCONTRADO'
      USING HINT = 'O usuário autenticado não é dono de nenhum estabelecimento';
  END IF;

  -- 3) Mínimo de saque (guarda server-side; NULL cai aqui também).
  IF p_valor_centavos IS NULL OR p_valor_centavos < c_min_centavos THEN
    RAISE EXCEPTION 'VALOR_MINIMO_SAQUE'
      USING HINT = 'Valor abaixo do mínimo de saque (businessConfig.saqueMinimoReais = R$200,00)';
  END IF;

  -- 4) Serializa saques simultâneos do mesmo lojista.
  PERFORM 1 FROM public.estabelecimentos e WHERE e.id = v_estab FOR UPDATE;

  -- 5) Saldo DISPONÍVEL em centavos (mesma fórmula da view carteira_lojista — Model B).
  SELECT COALESCE(SUM(l.valor_centavos) FILTER (
    WHERE (l.tipo = 'merchant_credit'
            AND (l.disponivel_em IS NULL OR l.disponivel_em <= NOW()))
       OR (l.tipo = 'payout' AND l.status <> 'erro')
  ), 0)
  INTO v_saldo_cent
  FROM public.lancamentos_financeiros l
  WHERE l.estabelecimento_id = v_estab;

  -- 6) Saldo insuficiente (o payout pendente do 1º saque já reduziu o disponível).
  IF v_saldo_cent < p_valor_centavos THEN
    RAISE EXCEPTION 'SALDO_INSUFICIENTE'
      USING HINT = 'Saldo disponível menor que o valor solicitado para saque';
  END IF;

  -- 7) Cria o payout (negativo), 'pendente', disponivel_em NULL (efeito imediato no
  --    disponível). O Admin executa o PIX no Bloco 09 (→ 'concluido' + asaas_id_externo).
  INSERT INTO public.lancamentos_financeiros (
    estabelecimento_id, pedido_id, tipo, valor_centavos, status, disponivel_em, detalhe
  )
  VALUES (
    v_estab, NULL, 'payout', -p_valor_centavos, 'pendente', NULL,
    'Solicitacao de saque do lojista (aguarda execucao manual do Admin — Bloco 09).'
  )
  RETURNING id, criado_em INTO v_new_id, v_criado;

  RETURN QUERY
    SELECT v_new_id, v_estab, (-p_valor_centavos)::bigint, 'pendente'::text, v_criado;
END;
$$;

COMMENT ON FUNCTION public.solicitar_saque(bigint) IS
  'Bloco 08. Lojista logado solicita saque: valida sessao, ownership, minimo (R$200 = '
  '20000 centavos; fonte-de-verdade UI em packages/config) e saldo disponivel (calculado '
  'do ledger em centavos, mesma formula da view). Cria payout negativo status ''pendente'' '
  '(Admin executa no Bloco 09). FOR UPDATE no estabelecimento evita overdraw. Erros: '
  'AUTENTICACAO_NECESSARIA, ESTABELECIMENTO_NAO_ENCONTRADO, VALOR_MINIMO_SAQUE, SALDO_INSUFICIENTE.';

REVOKE ALL ON FUNCTION public.solicitar_saque(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.solicitar_saque(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.solicitar_saque(bigint) TO authenticated;
