# Bloco 09 — Painel Admin: Operação (Épico 8, 8.1–8.8)

**Data:** 2026-08-13 · **Worktree:** `.worktrees/block-09-admin-ops` · branch `feat/epic8-admin-ops` · base `feat/epic7-carteira` (71af8ec, blocos 01–08).
**Modo:** fluxo AIOX `@sm → @po → @data-engineer(MCP) → @dev → @qa`. Parte da fila autônoma 08→12 (Caio dormindo).

## Objetivo

Habilitar o admin a operar o dia a dia **sem tocar no banco**: fila de reembolsos manuais, cancelamento forçado, bloqueio de cliente, suspensão de lojista, dashboard financeiro geral e qualidade do lojista. **Fecha também o loop do saque do Bloco 08** (admin marca o payout pendente como executado — mesmo padrão manual auditável do reembolso).

## Regra de negócio — TODA DECIDIDA (Rodada 2), nada a inventar

Matriz de reembolso (fonte: `docs/PERGUNTAS_REGRAS_NEGOCIO.md` → Decisões → Rodada 2 → Cancelamento e exceções):
- Cliente cancela antes do aceite → **100%**.
- Timeout de aceite (10 min) → auto-cancelamento + **100%**.
- Cliente cancela após aceite, antes de "Saindo pro hub" → **90% cliente / 10% lojista**.
- Após "Saindo pro hub" → **não pode cancelar**.
- Cliente não apareceu (no-show cliente) → **20% cliente / 80% lojista**.
- Lojista não apareceu → **100% cliente** + falha de qualidade.
- **Execução SEMPRE manual**: todo caso vira item na fila do admin; estados `pendente_admin → em_processamento → estornado | erro`. O sistema NÃO estorna sozinho.
- **Forçar cancelamento pelo admin (8.4)** = reembolso **total (100%)** — sem ambiguidade.
- Admin = **lista plana** (todo admin pode tudo). Sem coluna de papel no MVP.

## Escopo — 8.1 a 8.8 (admin web, Next.js)

| Story | O que | Nota do piloto |
|---|---|---|
| 8.1 | Fila de reembolsos (`/admin/reembolsos`): tabela `reembolsos_pendentes` + lista/filtros/ordenação | Sink dos reembolsos. Produtores: 8.4 agora; 6.11/6.18–6.21 no Bloco 10. |
| 8.2 | Executar reembolso | **Modo MANUAL auditável** (plano vigente do épico): admin marca `em_processamento`→`estornado`/`erro` com auditoria. **Asaas real (Edge Function) fica para o 08-PIX** quando a conta for aprovada. Push→polling. |
| 8.3 | Lista de pedidos (`/admin/pedidos`) com filtros (status/hub/estab/cliente/datas) paginada | Leitura real. |
| 8.4 | Detalhe do pedido + **forçar cancelamento** (`cancelado_admin` + insere reembolso total) | Botão em qualquer estado exceto `entregue`. Motivo obrigatório. |
| 8.5 | Lista de clientes + **bloquear/desbloquear** (`clientes.bloqueado`+motivo); pedido barra cliente bloqueado | RPC `criar_pedido` passa a rejeitar bloqueado. |
| 8.6 | **Suspender/reativar lojista** (`estabelecimentos.status='suspenso'`); some do catálogo | Pedidos em curso continuam. |
| 8.7 | Dashboard financeiro geral (`/admin/dashboard`): GMV, receita Keepit, contagens, rankings, taxa de sucesso, gráfico por dia | Queries diretas (view materializada só se performance pedir). Recharts. |
| 8.8 | Qualidade do lojista (aba no detalhe): entregues/cancelados/no-show, `estabelecimentos_falhas`, alerta >3/30d | Falhas já existem do fluxo de ocorrências; se tabela não existir, criar. |
| +saque | **Fila de saques + marcar executado** (fecha Bloco 08): admin vê `payout` pendente e marca `concluido`/`erro`, auditável | Mesmo padrão manual do reembolso. @sm decide se vira story própria (8.9) ou entra na tela de reembolsos. |

## Backend (data-engineer + MCP)
- Migration `reembolsos_pendentes` (schema exato da AC 8.1.2) + RPC de inserção (SECURITY DEFINER) e RPC admin `executar_reembolso` (marca estado, auditoria) — SEM chamada externa.
- `clientes.bloqueado boolean` + `motivo_bloqueio` + RPCs admin bloquear/desbloquear; `criar_pedido` rejeita bloqueado (`CLIENTE_BLOQUEADO`).
- `estabelecimentos.status='suspenso'` + `suspenso_em`/`motivo_suspensao` + RPCs admin suspender/reativar; catálogo já filtra por status ativo.
- `estabelecimentos_falhas` (se ainda não existir) para 8.8; RPC admin marcar saque executado.
- RLS: toda rota admin exige `is_admin()`; não-admin recebe erro. Escrita só via RPC/definer.

## Fronteira / FORA
- **Asaas real / Edge Function `executar-reembolso`** → Bloco 08-PIX (precisa conta aprovada + secrets). Aqui é manual.
- **Push** (8.2.4, 8.4.5, 8.6.5) → LATER (polling).
- **Produtores de reembolso 6.11/6.18–6.21** → Bloco 10 (Q2.3 já decidida; inserem em `reembolsos_pendentes`).
- **Épico 11 (experiência/estética do painel)** → Bloco 11.

## Depende do Caio (não bloqueia este bloco)
- Aprovar conta Asaas + setar secrets (liga o estorno/saque REAL no lugar do manual). Doc: `ASAAS-SETUP-CAIO.md`.
- BUILD-001 `/_global-error` (bug upstream Next 16) — admin roda em dev; build de produção do admin fica para @devops/@architect.
- Nada da regra de negócio deste bloco depende do Caio — Q2.3 e admin-lista-plana já decididas.
