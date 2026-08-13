# Bloco 06 — Pedido (fundação: criar → PIN → lojista aceita) — Épico 6 (6.6–6.9)

**Orquestrador:** `@aiox-master` via Claude Code.
**Data:** 2026-08-13
**Worktree:** `.worktrees/block-06-pedido` · branch `feat/epic6-pedido` · base `feat/epic6-cart-checkout` (7a5a070, blocos 01–05).
**Modo:** fluxo AIOX `@sm → @po → @data-engineer(MCP) → @dev → @qa` por story.

## Objetivo

Entregar o **caminho feliz** do pedido em ambiente de dev, conforme o **passo 4 do plano do piloto** ("entregar o pedido sem pagamento (6.x) usando ambiente de desenvolvimento"): `cliente cria pedido (pagamento simulado) → PIN gerado → lojista vê (polling) → aceita com tempo estimado`.

## Escopo — 6.6 a 6.9 (+ criação do pedido)

| Story | O que | Notas do piloto |
|---|---|---|
| Criação do pedido | RPC `criar_pedido` (dev): snapshot de itens/taxas do checkout → `pedidos` status `aguardando_aceite`, gera PIN | **Pagamento SIMULADO em dev** (PIX real = Épico 7, bloqueado por Asaas). Flag explícita. |
| 6.6 | Geração de PIN 4 dígitos (`pin_hash` + `pin_texto` protegido por RLS) | PIN server-side (mudança 3). Tentativas/lockout = **default de segurança** (flag Q2.2). |
| 6.7 | Tela "SEU CÓDIGO DE RETIRADA" (PIN grande) para o cliente | Sem mapa; "Como chegar" = endereço/WhatsApp (WA-001 seam). |
| 6.8 | Lojista: lista "Novos pedidos" | **Polling**, NÃO push (push = LATER; pilot 6.8 SIMPLE). Contador de timeout é **display** (sem job — 6.10 LATER). |
| 6.9 | Lojista aceita com tempo estimado | RPC `aceitar_pedido`: `aguardando_aceite → aceito`, `tempo_estimado_min`, `aceito_em`. |

**Migration necessária:** `pedidos` (§5.1, subset enxuto do piloto — CHECK de status permissivo, mudança 5) + `pedidos_itens` (§5.2, snapshot) + RPCs `criar_pedido`/`aceitar_pedido` (SECURITY DEFINER) + RLS (cliente vê o próprio; lojista vê os da própria loja; admin tudo).

## Fronteira / o que NÃO entra

- **PIX real (Asaas):** Épico 7 — pagamento é simulado em dev aqui.
- **Confirmação do PIN na entrega (6.15), avanço de estado (6.12/6.14), recibo (6.16), histórico (6.17):** próximo bloco.
- **Timeout automático (6.10):** LATER — Admin sinaliza vencidos por query.
- **Cancelamento/recusa/reembolso/no-show:** ocorrência manual (pilot SIMPLE) — não neste bloco; políticas Q2.3 pendentes.
- **Ledger financeiro (carteira):** Épico 7.

## Depende do Caio (para o final)

1. **Q2.1** — prazo de retirada e o que acontece com produto/dinheiro se não retirar. (Afeta telas de prazo; omitido/flag por ora.)
2. **Q2.2** — expiração/tentativas do PIN (usei default de segurança flagável).
3. **Q2.3** — janelas de cancelamento e política de reembolso.
4. **Ratificar R$2,90** (herdado) e **BR-HUB** (o pedido valida hub que a loja atende via `estabelecimentos_hubs`).
5. Nada disso bloqueia o caminho feliz deste bloco; só as bordas.
