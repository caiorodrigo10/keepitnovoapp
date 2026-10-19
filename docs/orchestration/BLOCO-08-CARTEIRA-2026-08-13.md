# Bloco 08 — Carteira & Ledger interno (Épico 7 sem Asaas real)

**Data:** 2026-08-13 · **Worktree:** `.worktrees/block-08-carteira` · branch `feat/epic7-carteira` · base `feat/epic6-retirada` (4e787df, blocos 01–07).
**Modo:** fluxo AIOX `@sm → @po → @data-engineer(MCP) → @dev → @qa`. Parte de uma fila autônoma 08→12.

## Objetivo

Ledger financeiro interno + carteira do lojista, com **dinheiro SIMULADO em dev** (modelo homologado na Rodada 8: escrow D+7, taxa Keepit 10%, saque mín. R$200). Para exatamente no **PIX real do Asaas** (7.1/7.2/7.5 = precisa de credenciais, FORA).

## Escopo (Épico 7 interno)

| Story | O que |
|---|---|
| 7.6 | Ledger `lancamentos_financeiros` + saldo (disponível/bloqueado via D+7) |
| 7.7 | Tela da carteira do lojista (saldo, bloqueado, sacar) |
| 7.8 (SIMPLE) | Solicitação de saque (cria lançamento `payout` pendente; admin executa no Bloco 09) |
| 7.9 | Extrato (lista de lançamentos) |
| 7.10 | Dashboard do lojista (agregações SQL) |
| 7.12 | Taxa Keepit calculada/registrada no pedido/ledger |

## Backend (data-engineer + MCP)

- Migration `lancamentos_financeiros` (mudança 4): append-only; `tipo` ∈ charge/platform_fee/merchant_credit/refund/payout; `valor_centavos bigint` (sinal: crédito ao lojista +, débito/saque −); `status`; `disponivel_em` (D+7 p/ merchant_credit); `asaas_id_externo` NULL; `ator_admin_id`; trigger de imutabilidade.
- View `carteira_lojista` (SUM/CASE sobre o ledger): saldo_disponivel/bloqueado/sacado/debitado.
- Fiação: `criar_pedido` → lançar `charge` + `platform_fee`; `confirmar_pin_pedido` (entrega) → lançar `merchant_credit` (disponivel_em = entregue_em + 7d).
- RPC `solicitar_saque` (lojista; ≥ R$200; cria `payout` status pendente).
- RLS: lojista vê os próprios lançamentos; admin tudo. Escrita só via RPC/definer.

## Fronteira / FORA
- Asaas real (7.1/7.2/7.5), cartão (7.3/7.4), chargeback (7.11) — precisam de credenciais/LATER.
- Execução do saque/reembolso pelo admin — Bloco 09.
- Débito SEC-006 (recálculo autoritativo de totais) — fecha aqui ao registrar o ledger server-side a partir do pedido.

## Depende do Caio (não bloqueia este bloco)
Credenciais Asaas (PIX real), ratificar R$2,90. O ledger em dev funciona sem isso.
