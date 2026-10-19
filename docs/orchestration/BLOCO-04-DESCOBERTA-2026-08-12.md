# Bloco 04 — Descoberta & Busca (Épico 5)

**Orquestrador:** `@aiox-master` via Claude Code.
**Data:** 2026-08-12
**Worktree:** `.worktrees/block-04-descoberta` · branch `feat/epic5-descoberta` · base `feat/keepit-real-backend` (commit `3af1c37`, blocos 01–03).
**Modo:** execução contínua no worktree; fluxo AIOX `@sm → @po → @data-engineer(MCP) → @dev → @qa` por story.

## Objetivo

Entregar a **descoberta do cliente** com backend real: percorrer hub → lojas → catálogo → produto, mais busca simples. É o passo 3 do plano do piloto e o pré-requisito do Épico 6 (pedido).

## Escopo — Épico 5 (8 stories)

| Story | Classe | Backend | Bloqueio |
|---|---|---|---|
| 5.1 | SIMPLE | Lista de hubs ativos (sem GPS/mapa/Haversine) | — desbloqueado |
| 5.2 | CORE | Lojas de um hub (join `estabelecimentos_hubs`) | leitura desbloqueada; **população da associação = BR-HUB (Caio)** |
| 5.3 | CORE | Estado da loja (aberta/fechada/pausada) via horários + `pausado_manualmente` | — desbloqueado |
| 5.4 | CORE | Catálogo da loja (`publico_ve_produtos`) | — desbloqueado |
| 5.5 | CORE | Detalhe do produto | — desbloqueado |
| 5.6 | SIMPLE | Busca de loja/produto (ILIKE case-insensitive) | — desbloqueado |
| 5.7 | SIMPLE | Busca — resultados/ordenação simples | — desbloqueado |
| 5.8 | UI_ONLY | Estrela decorativa (sem sistema de avaliações) | — desbloqueado (sem backend) |

## Pré-condição de banco (desbloqueada — schema já decidido)

- **Migration `estabelecimentos_hubs`** (relação loja↔hub, definida na mudança 6 de arquitetura, `03-data-models.md §2.3`): chave composta `(estabelecimento_id, hub_id)`, FKs CASCADE, RLS (leitura pública para descoberta; escrita só admin). @data-engineer autora, orquestrador aplica via MCP + advisors.
- Tabelas `hubs`, `estabelecimentos`, `produtos` e suas RLS **já existem** (blocos 02/03).

## Recorte honesto do 5.2 (loja↔hub)

A **leitura** "lojas de um hub" (join em `estabelecimentos_hubs`) é construída e testada agora — funciona assim que a associação for populada. A **população** (quem associa loja↔hub) é a decisão **BR-HUB** do Caio (auto na aprovação / admin seleciona / lojista escolhe). Até lá, a lista de lojas do hub retorna vazia de forma honesta (estado vazio, sem simular). NÃO inventamos a regra.

## Fluxo por story

`@sm` cria Draft → `@po` valida/Ready → `@data-engineer` (só 5.2, migration via MCP) → `@dev` implementa no worktree → `pnpm qa` + typechecks → `@qa` gate PASS/CONCERNS/FAIL → próxima. `DATA_SOURCE=mock` continua o default; leitura real só com `DATA_SOURCE=supabase`. Sem push (aguarda @devops + autorização do Caio).

## Depende do Caio (fazer depois — ver `PENDENCIAS-CAIO.md`)

1. **BR-HUB** — mecanismo de associação loja↔hub → destrava a POPULAÇÃO do 5.2 (a leitura já fica pronta).
2. **Q2.1 / Q2.2 / Q2.3** (ciclo do pedido, PIN, cancelamento) → Épico 6.
3. **Taxa ao comprador R$2,90** (ratificação stakeholder) → fechar Épico 6.
4. Nada disso bloqueia este Bloco 04 (descoberta read-side).
