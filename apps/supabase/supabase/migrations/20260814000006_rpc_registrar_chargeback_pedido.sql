-- =============================================================================
-- Story 7.11 — RPC `registrar_chargeback_pedido` (webhook Asaas
-- `PAYMENT_CHARGEBACK_REQUESTED`).
-- Autor: @dev (Dex). Data: 2026-08-27.
--
-- O QUE É: chamada exclusivamente pela Edge Function `asaas-payment-webhook`
-- (`service_role`, nunca sessão de usuário) — a MESMA função da Story 7.5,
-- estendida para tratar também o evento de chargeback. Localiza o pedido por
-- `asaas_payment_id` (preferencial) ou, defensivamente, por
-- `id::text = p_external_reference` (mesmo fallback da 7.5), trava a linha
-- (`FOR UPDATE`) e:
--   * não encontrou                          → 'pedido_nao_encontrado'
--   * status já = 'estornado_chargeback'     → 'ja_processado' (idempotência —
--     nenhum UPDATE/INSERT novo; sem duplicar débito nem falha)
--   * qualquer outro status                  → UPDATE pedidos
--     (status='estornado_chargeback') + INSERT em lancamentos_financeiros
--     (débito) + INSERT em estabelecimentos_falhas (tipo='chargeback') →
--     'confirmado'
--
-- DIFERENÇA vs. `confirmar_pagamento_pedido` (7.5): lá a idempotência é POR
-- INCLUSÃO (só age se status='aguardando_pagamento'); aqui é POR EXCLUSÃO
-- (age em qualquer status <> 'estornado_chargeback'), porque um chargeback
-- pode legitimamente chegar com o pedido em qualquer fase pós-pagamento
-- (aguardando_aceite, aceito, em_preparo, entregue, etc.), não só uma origem
-- única.
--
-- RECONCILIAÇÃO LEDGER ÚNICO vs. `debitos_lojista` (ver Story 7.11,
-- "Reconciliação com o épico" — LER): o texto do épico (AC3) descreve uma
-- tabela `debitos_lojista (estabelecimento_id, valor, motivo, criado_em)`
-- que NUNCA existiu no piloto (grep em todas as migrations aplicadas não
-- retorna nenhum arquivo). O piloto já reconciliou TODO o modelo financeiro
-- para 1 ledger único (`lancamentos_financeiros`, Bloco 08 — Story 7.6,
-- Done) desde a "mudança 4" de docs/architecture/03-data-models.md §6.
-- Criar `debitos_lojista` agora reabriria o problema de 2 fontes de verdade
-- financeiras que essa mudança fechou. Por isso o débito de R$ 40 é gravado
-- como 1 linha `merchant_credit` NEGATIVA (mesmo mecanismo já documentado no
-- comentário da coluna `valor_centavos` da migration 20260813050000 para
-- "ajuste manual que debita o lojista"), `disponivel_em = NULL` (efeito
-- imediato — débito não é sujeito a D+7). A view `carteira_lojista` já
-- agrega esse caso em `total_debitado_reais`/`saldo_disponivel_reais` sem
-- NENHUMA alteração nela (filtra `tipo='merchant_credit' AND
-- valor_centavos < 0`, confirmado por leitura de
-- 20260813050001_criar_view_carteira_lojista.sql).
--
-- VALOR: -4000 (centavos) = R$ 40,00 = businessConfig.taxaChargebackReais
-- (packages/config/src/index.ts, linha ~40) — fonte-de-verdade UI; mesmo
-- padrão de hardcode-com-comentário já usado por `v_taxa_keepit` em
-- 20260813060000_rpc_criar_pedido_taxa_keepit_server_side_sec006.sql. Valor
-- já fechado em docs/PERGUNTAS_REGRAS_NEGOCIO.md (linha 319) — nenhuma
-- pergunta de regra de negócio nova nesta Story.
--
-- `estabelecimentos_falhas` (tabela e CHECK já existentes — migration
-- 20260813070005): 1 linha `tipo='chargeback'` por chargeback confirmado,
-- alimentando a aba "Qualidade do lojista" do Admin (Story 8.8). RLS é
-- admin-only, mas a escrita aqui acontece via esta RPC `SECURITY DEFINER`
-- (roda como `postgres`, BYPASSRLS) — mesmo mecanismo já usado para gravar
-- em `lancamentos_financeiros` apesar de sua RLS também negar INSERT direto.
--
-- IDEMPOTÊNCIA (AC3): o `SELECT ... FOR UPDATE` + a checagem de status
-- acontecem DENTRO da mesma transação da RPC — 2 chamadas
-- concorrentes/reentregas para o mesmo evento de chargeback ("at least
-- once" do Asaas, mesmo contrato da 7.5) serializam: a 1ª grava (débito +
-- falha + UPDATE) e retorna 'confirmado'; a 2ª (bloqueada até a 1ª
-- commitar) vê status já 'estornado_chargeback' e retorna 'ja_processado'
-- sem duplicar o débito de R$ 40 nem a linha de `estabelecimentos_falhas`.
--
-- GRANT: 2ª RPC do projeto restrita a `service_role` (a 1ª foi
-- `confirmar_pagamento_pedido`, 7.5) — nunca `authenticated`/`anon`/
-- `PUBLIC`. Só a Edge Function `asaas-payment-webhook` chama, autenticada
-- pelo header `asaas-access-token` (AUTHZ-001, já fechado pela 7.5), nunca
-- por sessão de usuário logado. NÃO "corrigir" este GRANT numa Story futura
-- para incluir `authenticated` — seria uma regressão de segurança.
--
-- `p.id::text = p_external_reference` — comparação de TEXTO, nunca `::uuid`
-- no parâmetro: mesma disciplina defensiva da 7.5.
--
-- Duas INSERT na mesma transação da RPC (ledger + falha) — se qualquer uma
-- falhar (ex.: violação de CHECK), a transação inteira reverte (nenhum
-- UPDATE/INSERT parcial), e a Edge Function recebe o erro, retornando 502
-- (Asaas re-tenta).
--
-- Depende de: 20260813004932 (pedidos, coluna status já inclui
-- 'estornado_chargeback' no CHECK), 20260813050000 (lancamentos_financeiros),
-- 20260813070005 (estabelecimentos_falhas).
--
-- ROLLBACK (forward-only; se necessário reverter):
--     DROP FUNCTION IF EXISTS public.registrar_chargeback_pedido(text, text);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.registrar_chargeback_pedido(
  p_asaas_payment_id   text,
  p_external_reference text DEFAULT NULL
)
RETURNS TABLE (resultado text, pedido_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pedido_id uuid;
  v_status    text;
  v_estab_id  uuid;
BEGIN
  SELECT p.id, p.status, p.estabelecimento_id
    INTO v_pedido_id, v_status, v_estab_id
  FROM public.pedidos p
  WHERE p.asaas_payment_id = p_asaas_payment_id
     OR (p_external_reference IS NOT NULL AND p.id::text = p_external_reference)
  FOR UPDATE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'pedido_nao_encontrado'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_status = 'estornado_chargeback' THEN
    RETURN QUERY SELECT 'ja_processado'::text, v_pedido_id;
    RETURN;
  END IF;

  UPDATE public.pedidos
  SET status = 'estornado_chargeback',
      asaas_payment_id = COALESCE(asaas_payment_id, p_asaas_payment_id)
  WHERE id = v_pedido_id;

  -- Débito de R$ 40,00 (4000 centavos) do lojista — merchant_credit NEGATIVO,
  -- disponivel_em NULL (efeito imediato). Ver reconciliação ledger único no
  -- cabeçalho desta migration. 4000 = businessConfig.taxaChargebackReais=40
  -- (packages/config/src/index.ts).
  INSERT INTO public.lancamentos_financeiros (
    estabelecimento_id, pedido_id, tipo, valor_centavos, status, disponivel_em, asaas_id_externo, detalhe
  )
  VALUES (
    v_estab_id, v_pedido_id, 'merchant_credit', -4000,
    'concluido', NULL, p_asaas_payment_id,
    'Debito de chargeback (R$ 40,00) — pedido estornado via webhook Asaas PAYMENT_CHARGEBACK_REQUESTED.'
  );

  INSERT INTO public.estabelecimentos_falhas (
    estabelecimento_id, pedido_id, tipo, detalhes
  )
  VALUES (
    v_estab_id, v_pedido_id, 'chargeback',
    'Chargeback registrado via webhook Asaas (asaas_payment_id=' || p_asaas_payment_id || ').'
  );

  RETURN QUERY SELECT 'confirmado'::text, v_pedido_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_chargeback_pedido(text, text) IS
  'Story 7.11. Chamada SO pela Edge Function asaas-payment-webhook (service_role), '
  'evento PAYMENT_CHARGEBACK_REQUESTED. Localiza o pedido por asaas_payment_id ou '
  '(fallback) id::text=external_reference, FOR UPDATE. status=estornado_chargeback -> '
  'ja_processado (idempotencia, sem novo UPDATE/INSERT). Qualquer outro status -> '
  'UPDATE pedidos (estornado_chargeback) + INSERT merchant_credit NEGATIVO '
  '(-4000 centavos, disponivel_em NULL) em lancamentos_financeiros + INSERT '
  'tipo=chargeback em estabelecimentos_falhas -> confirmado. NAO cria tabela '
  'debitos_lojista (nunca existiu no piloto) — ver comentario no topo da migration.';

-- 2ª RPC do projeto restrita a service_role (a 1ª foi confirmar_pagamento_pedido,
-- 7.5) — nunca authenticated/anon/PUBLIC. Só a Edge Function
-- asaas-payment-webhook chama, autenticada pelo token do Asaas (AUTHZ-001).
REVOKE ALL ON FUNCTION public.registrar_chargeback_pedido(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_chargeback_pedido(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.registrar_chargeback_pedido(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_chargeback_pedido(text, text) TO service_role;
