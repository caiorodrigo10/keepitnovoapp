# Épico 8 — Painel Admin — Operação

> **Plano vigente (2026-07-31):** manter as telas e ações reais, usando queries
> diretas e processos manuais auditáveis onde a automação foi adiada. Ver
> [`../07-plano-mvp-piloto.md`](../07-plano-mvp-piloto.md).

## Expanded Goal

Habilitar o admin da Keepit para operar o dia a dia: a **fila de reembolsos manuais** (regra explícita do MVP), cancelamento forçado de pedido, bloqueio de cliente, suspensão de lojista, e o **dashboard financeiro geral da Keepit** (GMV, receita, rankings). Este épico é o que permite a Keepit rodar o produto em produção sem apagar incêndio no banco.

## Prerequisites

- Épico 3 (admin logado, aprovar lojista).
- Épico 6 (pedidos com estados variados).
- Épico 7 (Asaas integrado, estornos possíveis via API).

## Stories

### Story 8.1 — Fila de reembolsos manuais

**As a** admin,
**I want** ver todos os pedidos que precisam de reembolso,
**so that** eu execute o estorno com um clique.

**Acceptance Criteria:**
1: Rota `/admin/reembolsos` no admin web.
2: Migration cria tabela `reembolsos_pendentes (id uuid PK, pedido_id uuid FK, motivo text, valor_a_estornar_reais numeric, valor_a_lojista_reais numeric, forma_pagamento text, status text default 'pendente_admin', criado_em, processado_em, admin_id)`.
3: Todos os épicos anteriores (6.10, 6.11, 6.18, 6.19, 6.20, 6.21, 7.11) inserem na tabela em vez de estornar direto.
4: Tabela na UI: colunas motivo, pedido #, cliente, lojista, valor total, valor a estornar, valor ao lojista, forma pagamento, criado em, ação.
5: Ordenação por `criado_em asc` (mais antigos primeiro).
6: Filtro por status: `pendente_admin`, `em_processamento`, `estornado`, `erro`.

---

### Story 8.2 — Executar reembolso

**As a** admin,
**I want** clicar "Executar reembolso" e o sistema estornar via Asaas,
**so that** eu não abra API na mão.

**Acceptance Criteria:**
1: Botão "Executar" no item da fila. Confirmação com modal ("Você vai estornar R$ {X} ao cliente. Confirma?").
2: Ao confirmar, Edge Function `executar-reembolso` (a) muda status para `em_processamento`, (b) chama Asaas `estornarCobranca` com valor parcial ou total conforme regra, (c) se sucesso muda para `estornado`, (d) se falha muda para `erro` com detalhe salvo.
3: Se reembolso parcial (ex.: 90%), o valor ao lojista fica na carteira dele (já refletido pela view).
4: Push ao cliente quando concluído: "Seu reembolso foi processado."
5: Logs de auditoria (`admin_id`, `pedido_id`, valor, timestamp).

---

### Story 8.3 — Lista de pedidos com filtros

**As a** admin,
**I want** ver todos os pedidos com filtros úteis,
**so that** eu investigue casos e tome decisões.

**Acceptance Criteria:**
1: Rota `/admin/pedidos` com tabela paginada.
2: Filtros: status, hub, estabelecimento, cliente (busca por nome/e-mail/telefone), intervalo de datas.
3: Colunas: número, cliente, loja, hub, status, valor, criado em, ações (ver detalhe).
4: Clique abre detalhe do pedido (Story 8.4).

---

### Story 8.4 — Detalhe do pedido + forçar cancelamento

**As a** admin,
**I want** ver todos os detalhes de um pedido e forçar cancelamento se necessário,
**so that** eu resolva casos travados.

**Acceptance Criteria:**
1: Página `/admin/pedidos/{id}`.
2: Exibe: dados completos, timeline de estados (criado, pago, aceito, saiu hub, etc.), itens, valores, cliente, lojista, hub.
3: Botão "Forçar cancelamento" disponível em qualquer estado exceto `entregue`. Modal exige motivo textarea obrigatório.
4: Ao confirmar: `UPDATE status = 'cancelado_admin', motivo_cancelamento`, cria `reembolsos_pendentes` com valor total.
5: Push ao cliente e lojista.

---

### Story 8.5 — Lista de clientes + bloquear

**As a** admin,
**I want** buscar clientes e bloquear os que estão dando problema,
**so that** eu proteja o negócio de fraude/abuso.

**Acceptance Criteria:**
1: Rota `/admin/clientes` com busca por nome/e-mail/CPF/telefone.
2: Colunas: nome, e-mail, telefone, CPF (parcial), pedidos totais, pedidos cancelados, status (ativo/bloqueado).
3: Botão "Bloquear" na linha; muda `clientes.bloqueado = true` + `motivo_bloqueio`.
4: Cliente bloqueado ao tentar criar pedido recebe erro.
5: Botão "Desbloquear" reverte.

---

### Story 8.6 — Suspender lojista

**As a** admin,
**I want** suspender um lojista temporariamente,
**so that** eu tire ele do ar em caso de problema sem excluir.

**Acceptance Criteria:**
1: Botão "Suspender" na lista/detalhe de lojistas (`/admin/lojistas`). Modal com motivo obrigatório.
2: `UPDATE estabelecimentos SET status = 'suspenso', suspenso_em, motivo_suspensao`.
3: Loja some do catálogo do cliente imediatamente. Pedidos em aberto continuam seu ciclo (não interrompe entrega em curso).
4: Botão "Reativar" no detalhe do lojista.
5: Push ao lojista com motivo.

---

### Story 8.7 — Dashboard financeiro geral

**As a** admin,
**I want** ver o macro do negócio,
**so that** eu tenha visão executiva.

**Acceptance Criteria:**
1: Rota `/admin/dashboard` com métricas do período selecionável (7 / 30 / 90 dias):
   - GMV (Gross Merchandise Value): soma de valor total de pedidos entregues.
   - Receita Keepit: soma de `taxa_keepit_reais` dos entregues.
   - Pedidos totais, entregues, cancelados, no-show.
   - Ranking top 10 lojas por GMV.
   - Ranking hubs por número de pedidos.
   - Métrica "Taxa de sucesso" = entregues / (entregues + cancelados + no-show).
2: Gráfico de linha simples (vendas por dia) — biblioteca leve tipo Recharts.
3: Query com uma view materializada se performance pedir; MVP começa com queries diretas.

---

### Story 8.8 — Vista de qualidade do lojista

**As a** admin,
**I want** ver o histórico de falhas de qualidade por lojista,
**so that** eu decida quando suspender.

**Acceptance Criteria:**
1: No detalhe do lojista (`/admin/lojistas/{id}`), aba "Qualidade" mostra:
   - Nº pedidos entregues, cancelados, no-show por parte do lojista.
   - Lista das falhas registradas (`estabelecimentos_falhas`).
   - Tempo médio real vs. prometido (se estimados_atrasos).
2: Alerta visual se > 3 falhas em 30 dias.

---

## Definition of Done

- [ ] Todas as 8 stories `Done`.
- [ ] Cada tipo de reembolso testado end-to-end (timeout, cancelamento, recusa, no-show cliente/lojista, chargeback).
- [ ] Admin consegue operar um dia inteiro sem acessar o banco de dados diretamente.
- [ ] RLS validada em cada rota admin — user não-admin recebe erro.
