# Story 12.10 — final fix report

Data: 2026-09-05
Base: `a12ca07 fix(cliente): serialize account deletion guard changes`
Finding corrigido: `.superpowers/sdd/2026-09-05-estados-lojas-busca-vazios/final-rereview.md` — 1 HIGH/P1

## Resultado

- `SearchRecentEntry` mantém strings de busca textual e adiciona somente a entrada categórica discriminada `{ kind: 'category', label, category }`.
- Sugestões novas são registradas com label visual e categoria canônica; deduplicação por label substitui uma string legada equivalente pela entrada estruturada.
- `resolveRecentSearchSelection` reaplica `query: ''` e a categoria canônica no replay categórico. Strings legadas que correspondem, sem diferenciar caixa ou espaços externos, às três sugestões conhecidas são migradas em leitura; demais strings continuam busca textual em `todos`.
- `BuscaLoja` e `BuscaProduto` usam o mesmo helper para label e replay, sem renderer, persistência nova ou mudança no `SearchBar`.
- `recordRecentQuery` foi preservado como wrapper retrocompatível para consumidores e testes de texto existentes.

## Evidência TDD

### RED

```text
pnpm --filter @keepit/cliente test -- src/lib/searchViewState.test.ts

Test Files  1 failed (1)
Tests       2 failed | 13 passed (15)
```

As falhas foram as esperadas: `Farmácias` ainda era persistida como string e `Roupas` era reaberta como `{ query: 'Roupas', category: 'todos' }`.

### GREEN focado

```text
pnpm --filter @keepit/cliente test -- src/lib/searchViewState.test.ts src/hooks/useSearchProdutos.test.ts

Test Files  2 passed (2)
Tests       20 passed (20)
Exit        0
```

O teste puro cobre sugestão → registro → replay, substituição da string legada pelo valor estruturado, label de apresentação, migração de label conhecido e fallback de termo textual comum.

## Verificação final

- `pnpm --filter @keepit/cliente test` — 46 arquivos, 356/356 testes passaram.
- `pnpm --filter @keepit/cliente typecheck` — `tsc --noEmit` sem erros.
- `git diff --check` e `git diff --cached --check` — sem erros.
- `pnpm --filter @keepit/cliente lint` e `build` — exit 0, mas ambos são scripts preexistentes `echo skipped` e não constituem gates reais.
- CodeRabbit CLI indisponível em `/root/.local/bin/coderabbit`; revisão local do diff usada como fallback.

Vitest emitiu somente o aviso preexistente de depreciação da API CJS do Vite.

## Arquivos da correção

- `apps/cliente/src/lib/searchViewState.ts`
- `apps/cliente/src/lib/searchViewState.test.ts`
- `apps/cliente/src/screens/home/BuscaLoja.tsx`
- `apps/cliente/src/screens/home/BuscaProduto.tsx`
- `.superpowers/sdd/2026-09-05-estados-lojas-busca-vazios/progress.md`
- `.superpowers/sdd/2026-09-05-estados-lojas-busca-vazios/final-fix-report.md`

## Limites

- O histórico continua intencionalmente restrito ao estado de sessão das telas; nenhuma persistência foi adicionada.
- A migração reconhece apenas labels das sugestões canônicas atuais. Uma string antiga que não corresponda a elas permanece busca textual, evitando inferência ampla.
- Não foi adicionado renderer ou matriz visual; a regressão é de estado puro e a montagem das duas telas é validada pelo typecheck.
- `apps/cliente/app.json` pertence ao build concorrente e foi preservado fora deste commit.
