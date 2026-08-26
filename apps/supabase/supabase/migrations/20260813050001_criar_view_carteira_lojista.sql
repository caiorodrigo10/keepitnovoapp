-- =============================================================================
-- Bloco 08 — View `carteira_lojista`: agregação do ledger único.
-- Autor: @data-engineer (Dara). Data: 2026-08-13.
--
-- Fontes normativas:
--   docs/architecture/03-data-models.md §6.2  (view = SUM/FILTER sobre o ledger;
--                                              preserva os campos de saída da UI)
--   packages/core-data/src/ports/wallet.port.ts (CarteiraLojista: estabelecimento_id,
--       saldo_disponivel_reais, saldo_bloqueado_reais, total_sacado_reais,
--       total_debitado_reais) — CONTRATO DE SAÍDA que esta view DEVE honrar.
--   docs/PERGUNTAS_REGRAS_NEGOCIO.md Rodada 8 (escrow D+7).
--
-- Depende de: 20260813050000 (lancamentos_financeiros), estabelecimentos,
--             is_admin(), meu_estabelecimento_id().
--
-- ========================= CAMPOS DE SAÍDA (contrato UI) =======================
-- estabelecimento_id, saldo_disponivel_reais, saldo_bloqueado_reais,
-- total_sacado_reais, total_debitado_reais. O ledger é em CENTAVOS; a view divide
-- por 100.0 para manter a interface em REAIS (a UI não reconverte).
--
-- ============================ SEMÂNTICA (Model B) ==============================
-- Ver NOTA MODEL B na migration do ledger (20260813050000). Resumo:
--   * merchant_credit carrega o LÍQUIDO do lojista (subtotal − taxa_keepit +
--     deslocamento) na entrega, com disponivel_em = entregue_em + 7 dias (escrow).
--   * charge e platform_fee são AUDITORIA e NÃO entram na carteira (senão a comissão
--     seria descontada duas vezes). ÚNICA divergência vs. §6.2 literal, que somava
--     platform_fee — aqui removido dos 2 primeiros filtros. Números de saída
--     idênticos ao Model A do §6.1/§6.2.
--
-- D+7 / sinais:
--   saldo_disponivel_reais = (merchant_credit liberado: disponivel_em NULL ou <= now)
--                            + (payout, negativo, status <> 'erro') ... tudo /100.
--       → inclui os ajustes negativos imediatos do Admin (merchant_credit− com
--         disponivel_em NULL) e SUBTRAI saques (payout−). Inclui payout 'pendente'
--         (só exclui 'erro') para EVITAR overdraw entre solicitar e executar o saque.
--   saldo_bloqueado_reais  = merchant_credit POSITIVO ainda em D+7 (disponivel_em > now).
--   total_sacado_reais     = −SUM(payout status<>'erro').
--   total_debitado_reais   = −SUM(merchant_credit negativo) (ajustes do Admin).
--
-- ============================ SEGURANÇA (RLS) =================================
-- WITH (security_invoker = true): a view aplica a RLS do CHAMADOR sobre as tabelas
-- de base (não a do dono da view) — sem isso, uma view "security definer" vazaria
-- TODAS as carteiras (get_advisors marcaria "Security Definer View"). Belt-and-
-- suspenders: o WHERE também restringe as linhas a admin OU dono do estabelecimento.
-- Assim: lojista vê só a PRÓPRIA carteira (RLS do ledger + WHERE); admin vê todas;
-- anon não casa nada → zero linhas. Verificar get_advisors(type='security') após aplicar.
--
-- ROLLBACK (forward-only):
--     DROP VIEW IF EXISTS public.carteira_lojista;
-- =============================================================================

CREATE OR REPLACE VIEW public.carteira_lojista
WITH (security_invoker = true) AS
SELECT
  e.id AS estabelecimento_id,

  -- Disponível: créditos líquidos liberados (D+7) + ajustes/débitos imediatos − saques.
  COALESCE(SUM(l.valor_centavos) FILTER (
    WHERE (l.tipo = 'merchant_credit'
            AND (l.disponivel_em IS NULL OR l.disponivel_em <= NOW()))
       OR (l.tipo = 'payout' AND l.status <> 'erro')
  ), 0) / 100.0 AS saldo_disponivel_reais,

  -- Bloqueado: crédito líquido positivo ainda dentro da janela D+7.
  COALESCE(SUM(l.valor_centavos) FILTER (
    WHERE l.tipo = 'merchant_credit'
      AND l.valor_centavos > 0
      AND l.disponivel_em IS NOT NULL AND l.disponivel_em > NOW()
  ), 0) / 100.0 AS saldo_bloqueado_reais,

  -- Total sacado (payout é negativo; excluir 'erro').
  COALESCE(-SUM(l.valor_centavos) FILTER (
    WHERE l.tipo = 'payout' AND l.status <> 'erro'
  ), 0) / 100.0 AS total_sacado_reais,

  -- Total debitado: ajustes manuais do Admin que reduzem a carteira (merchant_credit negativo).
  COALESCE(-SUM(l.valor_centavos) FILTER (
    WHERE l.tipo = 'merchant_credit' AND l.valor_centavos < 0
  ), 0) / 100.0 AS total_debitado_reais
FROM public.estabelecimentos e
LEFT JOIN public.lancamentos_financeiros l ON l.estabelecimento_id = e.id
WHERE e.status = 'ativo'
  AND (public.is_admin() OR e.dono_user_id = (SELECT auth.uid()))
GROUP BY e.id;

COMMENT ON VIEW public.carteira_lojista IS
  'Bloco 08 (03-data-models.md §6.2). Carteira do lojista = agregacao SUM/FILTER sobre '
  'lancamentos_financeiros, em REAIS (centavos/100). Campos: saldo_disponivel_reais, '
  'saldo_bloqueado_reais (D+7), total_sacado_reais, total_debitado_reais. Model B: '
  'merchant_credit carrega o liquido; charge/platform_fee sao auditoria (fora da carteira). '
  'security_invoker=true + WHERE dono/admin (sem vazamento; RLS do chamador).';

-- Grants: authenticated (o lojista/admin logado lê); anon nao casa o WHERE → 0 linhas.
GRANT SELECT ON public.carteira_lojista TO authenticated, anon;
