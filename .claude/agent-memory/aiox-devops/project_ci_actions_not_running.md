---
name: ci-actions-not-running
description: GitHub Actions não cria runs no repo keepitnovoapp mesmo público — causa é a nível de CONTA (billing/verificação), não do repo
metadata:
  type: project
---

Ao validar o workflow de CI (`.github/workflows/ci.yml`, Story 1.5) via PR #1 (`ci/smoke-test` → `main`), o GitHub **não cria nenhuma run** — `actions/runs total_count = 0` após múltiplos gatilhos distintos (abertura de PR, close/reopen, e `synchronize` via novos commits).

**Atualização 2026-07-29 (segunda rodada):** O repo foi tornado **PÚBLICO** (`isPrivate:false`) justamente para ter Actions grátis, e mesmo assim continua **0 runs**. Push novo em `ci/smoke-test` (commit `100a4f8`) atualizou o head do PR #1 (`mergeable_state: clean`, `head_sha` = commit novo) → o evento `synchronize` comprovadamente ocorreu, mas nenhuma run foi criada. Isso **refuta** a hipótese anterior de "billing de repo privado": o problema é a nível de CONTA.

Config verificada e 100% correta: Actions `enabled:true` + `allowed_actions:all`; workflow `state:active` (id 323096709, name "CI"); `ci.yml` válido (parseado); PR aberto/mergeável; autor = dono (caiorodrigo10, tipo User). YAML só tem trigger `pull_request: branches:[main]` (sem `workflow_dispatch`, então não dá pra forçar disparo manual). NÃO é problema de código nem do `pnpm install --frozen-lockfile` — nenhum step chega a rodar.

Não foi possível ler o billing da conta: `users/caiorodrigo10/settings/billing/actions` retorna 404 e o token do gh **não tem o escopo `user`** (`gh auth refresh -h github.com -s user` pra habilitar).

**Why:** Sintoma "workflow active + repo público + Actions enabled + 0 runs + zero erro" aponta para Actions bloqueado a nível de conta — causas típicas: e-mail da conta não verificado (GitHub exige e-mail verificado pra rodar Actions), spending limit/flag de billing na conta, ou Actions desabilitado nas configurações da conta. Não é resolvível via API com o token atual nem está no escopo do @devops.

**How to apply:** Antes de tentar de novo, o Caio precisa checar na UI do GitHub (conta caiorodrigo10): (1) e-mail verificado (Settings → Emails); (2) Settings → Billing → verificar se há restrição em Actions; (3) na aba Actions do repo, ver se aparece algum banner de bloqueio. Enquanto isso não for resolvido, qualquer smoke test de CI vai ficar sem run — NÃO perder tempo depurando o workflow, o lockfile ou os workspaces. AC3 da Story 1.5 (CI verde num PR) fica BLOQUEADO por essa pendência de conta. Relacionado a [[ci-smoke-test-branch-recreated]].
