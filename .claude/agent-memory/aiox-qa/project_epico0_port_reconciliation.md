---
name: epico0-port-reconciliation
description: RESOLVIDO pela Story 1.10 (Done/CONCERNS, 2026-07-29) — ports locais promovidas p/ core-data; histórico do débito abaixo
metadata:
  type: project
---

**RESOLVIDO — Story 1.10 (Done, gate CONCERNS, 2026-07-29).** A reconciliação foi executada: 8
mocks/contexts locais removidos (zero `*.mock.ts` de app), `OrderPort` (lados lojista+cliente),
`AuthPort` (`getById`/`updateCpf`), `AdminPort` (8+1 métodos admin-ops), `ProductPort`
(`delete`/`ativo`/`incluirInativos`), `StorePort` (`setPausadoManualmente`) estendidas; novo
`analytics.port.ts` ([AUTO-DECISION] CREATE vs estender WalletPort — justificado); `businessConfig`
ganhou os 6 percentuais da matriz de cancelamento; `refundQueue` populada organicamente via
`registrarReembolso`. Contrato verificado enum a enum vs schema (15/15+9/9+4/4, zero divergência).
Gap **10.4 (auth email/senha) segue pendência 🔴 do stakeholder** — NÃO tocado. CartContext:
decisão FINAL manter local (AC8). Follow-ups LOW abertos: DOC-001 (rodar CodeRabbit no push),
REL-001 (% de `cancelamento_atraso`/`chargeback` são default inline do @dev, registrar como
pendência), MNT-002 (4 TECH DEBT residuais fora-de-escopo: order.cancel motivo nomeado, WalletPort
PIX/agregação mensal, cartão mock). Épico 1 (Story 1.6 — Supabase) agora destravado.

---
_Histórico do débito (antes da 1.10):_

Várias stories da casca visual (Épico 0, trilha lojista/admin) implementam extensões de port
LOCAIS no app em vez de tocar `packages/core-data`, por restrição de escopo (execução limitada a
`apps/<app>/**`, sem `pnpm install`). Gates que já registraram esse gap: **0.9** (ProductPort sem
delete/reactivate, StorePort sem write), **0.10** (order.port só cobre lado Cliente — falta
`listByEstabelecimento`/`markReadyForHub`/`markArrivedAtHub`/`markCustomerNoShow` + `AuthPort.getById`),
os gaps já apontados nas **0.12/0.13**, e a **trilha Cliente (0.4-0.7, agora completa)**:
**0.7** confirmou o mesmo padrão do lado Cliente — `order.port` sem `getById` e sem os estados
`em_preparo`/`saindo_hub`/`no_hub`/`cliente_chegou_em` (dependem do app Lojista) → supridos por
`OrderStatusOverrideContext` + `usePedidoDetail` locais; e os **percentuais de reembolso da matriz de
cancelamento (100/90/10/80/20, decididos na Rodada 2) NÃO existem em `@keepit/config`** → centralizados
em `apps/cliente/src/lib/cancelamentoPolicy.ts`. Este último é valor de regra de negócio que deve migrar
para `businessConfig` na declaração central.

**0.11 (Lojista Financeiro — última story da trilha lojista, agora Done/CONCERNS)** confirmou o
mesmo padrão no domínio wallet: `wallet.port` cobre só `getBalance`/`requestWithdrawal`/`statement`
(reflexo de `carteira_lojista`+`saques`). NÃO cobre **vendas agregadas por período (7/30/90/1a)**,
**"Top produtos"** nem **extrato mensal com movimentações por venda** — todos supridos por
`apps/lojista/src/screens/financeiro/financeiro.mock.ts` (fixtures do protótipo P1/P4/P10). Esses
dados derivariam de `pedidos`/`pedidos_itens`, ainda não agregados no Épico 0 → candidatos a
`analytics.port.ts` nova (ou `WalletPort` ampliado) na reconciliação. Nota positiva: a 0.11 é a
PRIMEIRA da trilha lojista a linkar `@keepit/config` de verdade (dependency + symlink manual, sem
`pnpm install`) em vez de espelhar valores — então o débito aqui é só o `pnpm install` pendente
(REL-001), não valor de negócio duplicado. Chave PIX também não tem método no `WalletPort` (nem
leitura nem escrita) → estado local em `FinanceiroContext`.

Com a 0.11 Done, **a trilha Lojista e o Épico 0 inteiro estão concluídos** — a reconciliação de
ports é o gate técnico natural a rodar antes de abrir o Épico 1.

**Why:** casca UI-first do Épico 0 prioriza telas navegáveis com mock; a troca mock→Supabase é do
Épico 1. Extensões locais mantêm o app compilando sem alterar contratos de core-data ainda.

**How to apply:** ao revisar qualquer story da trilha lojista/admin do Épico 0, tratar
"port local no app" + "@keepit/config espelhado localmente" + "sem test runner no app" como débito
ACEITÁVEL (verdict CONCERNS, não FAIL) — desde que documentado. Cobrar sempre um follow-up ARCH
ÚNICO e consolidado (promover métodos para core-data + declarar @keepit/config + configurar
Jest/Vitest) ANTES do Épico 1. Delegar a @architect/@data-engineer.
