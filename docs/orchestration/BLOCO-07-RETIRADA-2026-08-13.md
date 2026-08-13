# Bloco 07 — Retirada com PIN (continuação do caminho feliz) — Épico 6 (6.12–6.17)

**Orquestrador:** `@aiox-master` via Claude Code.
**Data:** 2026-08-13
**Worktree:** `.worktrees/block-07-retirada` · branch `feat/epic6-retirada` · base `feat/epic6-pedido` (0f3ef17, blocos 01–06).
**Modo:** fluxo AIOX `@sm → @po → @data-engineer(MCP) → @dev → @qa` por story.

## Objetivo

Fechar o observável **`comprar → separar → retirar com PIN`**: do pedido `aceito` até `entregue` via confirmação de PIN, mais recibo e histórico. Continua o Bloco 06 (que parou em `aceito`).

## Escopo — 6.12 a 6.17

| Story | O que | Notas do piloto |
|---|---|---|
| 6.12 | Lojista "Saindo pro hub" (`em_preparo/aceito → saindo_hub`, `saiu_hub_em`) | RPC `avancar_estado_pedido`. Push→polling. |
| 6.13 | Cliente percebe a mudança | **Polling/refresh**, sem push (LATER). Pode reusar `listMine`/detalhe. |
| 6.14 | Check-in no hub | **Pilot SIMPLE: UM check-in operacional** (não exige sincronizar 2 devices) → `no_hub`. |
| 6.15 | **Lojista digita PIN → entregue** | RPC `confirmar_pin_pedido`: compara `pin_hash` (bcrypt); acerto → `entregue`+`entregue_em`; erro → `tentativas_pin++`; **≥5 → `pin_bloqueado_ate = now()+5min`**; reset por timestamp (sem cron). Constantes **5/5min** em `packages/config` (Q2.2 DECIDIDA). |
| 6.16 | Recibo (entrega confirmada) | Tela "Recibo · pedido concluído". A entrada na **carteira virtual (D+7) é Épico 7** — aqui só marca `entregue_em` e mostra o recibo. |
| 6.17 | Cliente "Meus pedidos" | Abas Em andamento / Concluídos; card + detalhe; dado real (`listMine`, já existe). |

**Migration:** RPCs `avancar_estado_pedido` (lojista dono/admin; transições do piloto) + `confirmar_pin_pedido` (lojista dono/admin; valida PIN com lockout 5/5min server-side). Sem tabela nova.

## Fronteira / o que NÃO entra

- **6.11 recusar** — cria reembolso (Q2.3 política). FORA (ocorrência manual, próximo bloco/Épico 8).
- **6.18–6.21 cancelamento/no-show/reembolso** — Q2.3, ocorrência manual. FORA.
- **Carteira/ledger (D+7)** — Épico 7.
- **PIX real / recálculo autoritativo** — Épico 7 (débito SEC-006).
- **Push** — LATER (tudo por polling).

## Depende do Caio (para o final)

1. **Q2.3** (reembolso/cancelamento) → 6.11 e 6.18–6.21.
2. **Épico 7** (PIX/Asaas, carteira D+7, SEC-006).
3. Herdadas: BR-HUB, ratificar R$2,90, CFG-001, WhatsApp, Vercel, autorizar @devops (reconciliar worktrees + push).
4. Nada deste bloco (6.12–6.17) depende de você — Q2.2 (PIN 5/5min) já está decidida.
