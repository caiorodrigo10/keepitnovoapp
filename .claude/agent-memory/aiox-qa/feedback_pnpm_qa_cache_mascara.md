---
name: pnpm-qa-cache-mascara
description: Em gate QA independente, pnpm qa retorna FULL TURBO cacheado (paths de .worktrees); reexecutar vitest direto por pacote
metadata:
  type: feedback
---

Num gate QA independente, NÃO confiar no resultado de `pnpm qa`: ele volta
"FULL TURBO" (ex.: 27/27 cached) e os logs referenciam paths de worktree
divergente (`.worktrees/story-2.5.1/...`), ou seja, replay de cache, não
execução real. Reexecutar os testes afetados direto, sem cache:
`pnpm --filter @keepit/core-data test` e `pnpm --filter @keepit/cliente test`.

**Why:** o gate deve ser prova empírica do @qa, não confiança no @dev. O cache
do Turbo pode mascarar regressão e ainda aponta para árvores de trabalho não
mescladas a `main` (ver [[project_epico0_port_reconciliation]] e o débito de
worktrees divergentes, MNT-002 nos gates 2.6/2.7).

**How to apply:** em toda story com código, rodar o vitest do(s) pacote(s) do
File List diretamente e conferir a contagem real de testes antes de fechar o
gate. Contagens do @dev podem divergir (ex.: story 2.7 — @dev relatou "166
core-data", run direto deu 128; ambos verdes, mas só o run direto é autoridade).
Casa com [[project_prova_empirica_adapters]] (mockar SDK e contar chamadas).
