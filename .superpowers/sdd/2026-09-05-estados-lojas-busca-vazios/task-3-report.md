# Task 3 report — matriz de busca, sugestões e seções sem espaço vazio

## Status

Implementado no worktree `story-12-1-mock-cliente`, sobre os contratos de descoberta da Task 2 (`0083b25`).

## Entregas

- `SearchViewInput`, `SearchViewState` e `resolveSearchViewState` centralizam a precedência de erro/loading, sugestões sem texto, vazios geral/lojas/categoria e combinações independentes de lojas/produtos.
- `SearchSuggestion` e `GENERAL_SEARCH_SUGGESTIONS` expõem Farmácias, Roupas e Conveniência como sugestões gerais identificadas em seção própria.
- `resolveSearchSuggestionSelection` separa o label apresentado/registrado da consulta canônica: o toque mantém `query` vazio e aplica somente o `category`, evitando o antigo predicado `label AND categoria`.
- `recordRecentQuery` normaliza o termo, ignora vazio, remove duplicatas sem diferenciar maiúsculas/minúsculas, move o termo ao início e limita a lista (cinco por padrão).
- `BuscaLoja` e `BuscaProduto` mantêm recentes somente em estado React da sessão. Sugestões/recentes e toques em resultados registram a consulta sem usar storage.
- Ambas as telas renderizam somente o ramo resolvido. Títulos e containers de lojas/produtos são montados apenas quando o booleano correspondente é verdadeiro, sem margem ou altura de seção vazia.
- Vazios geral, de lojas e de categoria recebem textos distintos; os chips continuam visíveis em todos os ramos normais da busca.

## Evidência TDD

- Baseline: `pnpm --filter @keepit/cliente test -- src/lib/storeDiscovery.test.ts src/hooks/useSearchProdutos.test.ts` passou 6/6 testes antes da alteração.
- RED: `pnpm --filter @keepit/cliente test -- src/lib/searchViewState.test.ts` falhou pelo motivo esperado, porque `./searchViewState` ainda não existia.
- GREEN inicial: o teste novo passou 12/12 casos, incluindo precedência, vazios por escopo, ausência independente de cada seção, sugestões/recentes, deduplicação case-insensitive, vazio e limite customizado.
- Correção pós-review: uma regressão pura adicional falhou primeiro com `resolveSearchSuggestionSelection` ausente; após separar `{ query: '', category, recentQuery: label }` e permitir resultados com categoria ativa/query vazia, o arquivo passou 13/13 casos.

## Verificação

- `pnpm --filter @keepit/cliente test -- src/lib/searchViewState.test.ts src/lib/storeDiscovery.test.ts src/hooks/useSearchProdutos.test.ts` — 19/19 testes passaram em 3 arquivos.
- `pnpm --filter @keepit/cliente test` — 308/308 testes passaram em 43 arquivos na verificação pós-review.
- `pnpm --filter @keepit/cliente typecheck` — passou.
- `git diff --check` — passou.
- `pnpm --filter @keepit/cliente lint` e `build` retornaram sucesso, mas ambos são scripts preexistentes `echo skipped`; não constituem validação real.
- O Vitest emitiu apenas o aviso preexistente de depreciação da API CJS do Vite.

## Escopo e limitações

- Nenhuma dependência, renderer ou persistência foi adicionada. O histórico desaparece quando a tela desmonta, conforme o escopo de sessão.
- `SearchBar` continua com busca viva e sem callback de submit no contrato atual; o histórico é registrado nas interações disponíveis dentro dos quatro arquivos autorizados (sugestões, recentes e resultados), sem ampliar o componente compartilhado.
- Não houve teste de renderer por decisão explícita do plano. A montagem condicional foi verificada por contrato puro, leitura estática e typecheck; layout/teclado seguem para o smoke final de APK registrado no ledger.
- CodeRabbit não está instalado em `/root/.local/bin/coderabbit`, então a revisão pre-commit automatizada foi indisponível; a revisão local não encontrou alteração fora do escopo.
