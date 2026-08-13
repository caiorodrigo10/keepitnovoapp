---
name: project-bloco08-carteira
description: Bloco 08 (Carteira/Ledger, Épico 7 stories 7.6-7.10/7.12) — what @dev implemented, what remains open (SEC-006)
metadata:
  type: project
---

Bloco 08 "Carteira" (2026-08-13, worktree `block-08-carteira`) closed the
app-side wiring for `WalletPort` (Stories 7.7/7.8) and `AnalyticsPort`
(Stories 7.9/7.10) against a backend that was already applied via MCP before
the @dev session started: table `lancamentos_financeiros` (append-only
ledger, Model B — `merchant_credit` carries the NET amount;
`charge`/`platform_fee` are audit-only, outside the wallet), view
`carteira_lojista` (`security_invoker`), and RPC `solicitar_saque`.

**Why:** close the pilot's wallet/statement/dashboard screens (already built
UI since Stories 0.11/1.10) against real Supabase data instead of
`NotImplementedError` stubs.

**What shipped:**
- `packages/core-data/src/supabase/wallet.supabase.ts` — `getBalance`
  (reads `carteira_lojista` view), `statement` (reads
  `lancamentos_financeiros WHERE tipo='payout'`), `requestWithdrawal`
  (calls RPC `solicitar_saque(p_valor_centavos)`, reais→centavos via
  `Math.round`).
- `packages/core-data/src/supabase/wallet-errors.ts` — 4 named-error
  classes for `solicitar_saque` (`AUTENTICACAO_NECESSARIA`,
  `ESTABELECIMENTO_NAO_ENCONTRADO`, `VALOR_MINIMO_SAQUE`,
  `SALDO_INSUFICIENTE`).
- `packages/core-data/src/supabase/analytics.supabase.ts` —
  `salesSummary`/`topProducts` (aggregate `pedidos`/`pedidos_itens`
  directly, NOT the ledger — deliberate [IDS] separation, see
  `analytics.port.ts` header), `monthlyStatement` (unions `pedidos`
  entregues do mês + `lancamentos_financeiros` tipo=payout do mês).
- `packages/shared-types/src/supabase.ts` — manual reconciliation adding
  `lancamentos_financeiros` (Tables), `carteira_lojista` (Views),
  `solicitar_saque` (Functions) — see [[feedback-shared-types-manual-reconciliation]].

**What remains OPEN (SEC-006, Story 7.12):** the RPC `criar_pedido` in
production still computes `pedidos.taxa_keepit_reais` from the
client-supplied `p_taxa_keepit_reais` — it does NOT recalculate
server-side yet. The forward-only migration that fixes this
(`ROUND(p_subtotal_produtos_reais * 10/100, 2)`, ignoring the client param)
is `@data-engineer` scope (touches `apps/supabase/supabase/migrations/`)
and was explicitly out of the Bloco 08 "lado APP" mission — Story 7.12 was
left at Status `InProgress` (not `InReview`) specifically because of this
gap. Whoever picks this up next should apply that migration before
re-running `@qa` on 7.12.

**How to apply:** if asked about wallet/carteira/extrato/dashboard real-data
wiring in the lojista app, this is the reference implementation. If asked
why `taxa_keepit_reais` isn't authoritative yet, point to this open SEC-006
gap rather than re-investigating from scratch.
