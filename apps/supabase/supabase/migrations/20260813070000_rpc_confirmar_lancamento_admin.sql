-- =============================================================================
-- Bloco 09 (Operação Admin — Épico 8) — RPC `confirmar_lancamento_admin`.
-- Atende Story 8.2 (executar reembolso) E Story 8.9 (marcar saque executado).
-- Autor: @data-engineer (Dara). Data: 2026-08-13.
--
-- Fontes normativas:
--   docs/stories/8.2.story.md AC2/AC5 (marca 'pendente'→'concluido'|'erro', auditoria
--       nativa do ledger — ator_admin_id/concluido_em; SEM chamada Asaas; sem estado
--       'em_processamento' persistido).
--   docs/stories/8.9.story.md AC3/AC4/AC5 (mesma mecânica para payout do lojista).
--   docs/architecture/03-data-models.md §6.1 (campos mutáveis do ledger:
--       status/asaas_id_externo/ator_admin_id/detalhe/concluido_em).
--   Precedente de estilo/hardening: 20260813050004_rpc_solicitar_saque.sql
--       (SECURITY DEFINER + search_path='' + validação server-side + retorno tipado).
--
-- ============================ DECISÃO: RPC COMPARTILHADO (8.2 + 8.9) ===========
-- A missão e a Story 8.2 (Dependencies item 2) delegaram a @architect/@data-engineer
-- a escolha entre um RPC genérico único ou dois RPCs por domínio. ESCOLHA: UM RPC
-- genérico `confirmar_lancamento_admin(p_lancamento_id, p_resultado, p_detalhe,
-- p_asaas_id_externo)`, aceitando lançamentos `tipo IN ('refund','payout')`.
--   RAZÃO (KISS/DRY — princípio do MVP, CLAUDE.md §"Backend simples"): reembolso e
--   saque têm a MESMA forma estrutural — "confirmar a execução manual de um lançamento
--   pendente, com auditoria" (status: pendente → concluido|erro; grava ator_admin_id,
--   concluido_em; opcionalmente detalhe/asaas_id_externo). Um único RPC evita duplicar
--   código e diverge de comportamento entre as duas filas. O `tipo` do lançamento já
--   distingue reembolso (refund) de saque (payout) — o front chama o mesmo RPC nas duas
--   telas (/reembolsos e /saques).
--
-- ============================ MODELO-ALVO (seam honesta) ======================
-- ESTA RPC NÃO CHAMA ASAAS. É o passo manual auditável: o admin confirma que já fez (ou
-- vai fazer) o PIX/estorno de fato FORA do sistema; a RPC só registra a confirmação.
-- Nenhum sucesso externo é simulado. Quando o Bloco 08-PIX ligar a Edge Function real,
-- o mesmo botão passa a refletir o resultado real da chamada Asaas, sem mudar a UI.
--
-- ============================ ESCRITA = SÓ CAMPOS MUTÁVEIS ====================
-- O UPDATE toca APENAS status/ator_admin_id/concluido_em/detalhe/asaas_id_externo — a
-- allow-list do trigger `trg_lancamento_imutavel` (20260813050000). NUNCA tenta alterar
-- valor_centavos/tipo/estabelecimento_id/pedido_id/criado_em/disponivel_em (o trigger
-- bloquearia; a RPC nem tenta). detalhe/asaas_id_externo usam COALESCE(novo, atual) para
-- não apagar dados já gravados quando o parâmetro vier NULL.
--
-- ============================ VALIDAÇÕES / ERROS ==============================
--   * AUTENTICACAO_NECESSARIA   — sem sessão (auth.uid() NULL).
--   * NAO_AUTORIZADO            — autor não é admin (is_admin() false).
--   * RESULTADO_INVALIDO        — p_resultado fora de {'concluido','erro'}.
--   * LANCAMENTO_NAO_ENCONTRADO — id inexistente.
--   * TIPO_INVALIDO             — lançamento não é refund nem payout (ex.: charge,
--       platform_fee, merchant_credit não são confirmáveis por esta fila). ADIÇÃO
--       necessária ao vocabulário da missão para o RPC genérico ser fail-closed:
--       impede confirmar/alterar por engano um lançamento de auditoria/carteira.
--   * ESTADO_INVALIDO           — lançamento não está 'pendente' (já concluido/erro:
--       idempotência fechada — não reconfirma, não re-transiciona).
--
-- CONCORRÊNCIA: SELECT ... FOR UPDATE na linha do lançamento serializa dois admins
-- confirmando o mesmo item (o 2º relê status já <>'pendente' → ESTADO_INVALIDO).
--
-- HARDENING: SECURITY DEFINER + search_path=''; REVOKE PUBLIC/anon; EXECUTE só
-- authenticated (a RLS/guard is_admin() decide quem de fato pode). Verificar
-- get_advisors(type='security') após aplicar.
--
-- ROLLBACK (forward-only):
--     DROP FUNCTION IF EXISTS public.confirmar_lancamento_admin(uuid, text, text, text);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.confirmar_lancamento_admin(
  p_lancamento_id     uuid,
  p_resultado         text,                 -- 'concluido' (sucesso) | 'erro' (falha)
  p_detalhe           text DEFAULT NULL,    -- nota opcional (motivo do erro, referência, etc.)
  p_asaas_id_externo  text DEFAULT NULL     -- referência do PIX/estorno manual, se houver
)
RETURNS TABLE (
  lancamento_id  uuid,
  tipo           text,
  status         text,
  ator_admin_id  uuid,
  concluido_em   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_tipo   text;
  v_status text;
BEGIN
  -- 1) Sessão autenticada.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão ausente ao chamar confirmar_lancamento_admin';
  END IF;

  -- 2) Só admin (lista plana — is_admin() autoriza tudo).
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO'
      USING HINT = 'Apenas administradores confirmam lançamentos financeiros';
  END IF;

  -- 3) Resultado válido.
  IF p_resultado IS NULL OR p_resultado NOT IN ('concluido', 'erro') THEN
    RAISE EXCEPTION 'RESULTADO_INVALIDO'
      USING HINT = 'p_resultado deve ser ''concluido'' ou ''erro''';
  END IF;

  -- 4) Trava a linha e lê o estado atual.
  SELECT l.tipo, l.status
    INTO v_tipo, v_status
  FROM public.lancamentos_financeiros l
  WHERE l.id = p_lancamento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LANCAMENTO_NAO_ENCONTRADO'
      USING HINT = 'Nenhum lançamento com o id informado';
  END IF;

  -- 5) Só refund (reembolso) ou payout (saque) são confirmáveis por esta fila.
  IF v_tipo NOT IN ('refund', 'payout') THEN
    RAISE EXCEPTION 'TIPO_INVALIDO'
      USING HINT = 'Só lançamentos refund (reembolso) ou payout (saque) podem ser confirmados';
  END IF;

  -- 6) Só transiciona a partir de 'pendente' (idempotência fechada).
  IF v_status <> 'pendente' THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO'
      USING HINT = 'O lançamento não está pendente (já concluido/erro)';
  END IF;

  -- 7) UPDATE só dos campos mutáveis (allow-list do trg_lancamento_imutavel).
  --    detalhe/asaas_id_externo: preserva o valor atual se o parâmetro vier NULL.
  UPDATE public.lancamentos_financeiros l
     SET status           = p_resultado,
         ator_admin_id    = v_uid,
         concluido_em     = NOW(),
         detalhe          = COALESCE(p_detalhe, l.detalhe),
         asaas_id_externo = COALESCE(p_asaas_id_externo, l.asaas_id_externo)
   WHERE l.id = p_lancamento_id
  RETURNING l.id, l.tipo, l.status, l.ator_admin_id, l.concluido_em
       INTO lancamento_id, tipo, status, ator_admin_id, concluido_em;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.confirmar_lancamento_admin(uuid, text, text, text) IS
  'Bloco 09 (Stories 8.2 e 8.9). Admin confirma a execução MANUAL de um lançamento '
  'pendente (refund=reembolso ao cliente | payout=saque ao lojista): status ''pendente'' '
  '-> ''concluido''|''erro'', grava ator_admin_id=auth.uid() e concluido_em=NOW(), '
  'opcionalmente detalhe/asaas_id_externo. SEM chamada Asaas (seam honesta). SECURITY '
  'DEFINER + search_path='''' + guard is_admin(). Só altera campos mutáveis (allow-list do '
  'trigger de imutabilidade). Erros: AUTENTICACAO_NECESSARIA, NAO_AUTORIZADO, '
  'RESULTADO_INVALIDO, LANCAMENTO_NAO_ENCONTRADO, TIPO_INVALIDO, ESTADO_INVALIDO.';

REVOKE ALL ON FUNCTION public.confirmar_lancamento_admin(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirmar_lancamento_admin(uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirmar_lancamento_admin(uuid, text, text, text) TO authenticated;
