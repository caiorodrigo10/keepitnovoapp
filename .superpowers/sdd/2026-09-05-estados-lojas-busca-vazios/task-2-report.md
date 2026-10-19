# Task 2 report — seletores de superfície e resultados com disponibilidade

## Status

Implementado no worktree `story-12-1-mock-cliente`, sobre o contrato central da Task 1 (`9983afb`).

## Entregas

- `LojaComDisponibilidade` e `selectStoresForSurface` projetam cada loja com `resolveLojaDisponibilidade`, sem duplicar a regra de horário/status/exclusão.
- A superfície `purchase` conserva somente lojas disponíveis para compra; a superfície `search` conserva lojas públicas abertas, fechadas e pausadas com o estado associado.
- Home aplica `purchase` somente em “Lojas perto do hub” e agrupamentos por categoria; a coleção de Favoritos permanece fora desse filtro para a Story 12.11.
- Hub aplica `purchase` aos cards de lojas.
- `useSearchLojas` devolve `LojaComDisponibilidade[]` e mantém os filtros de texto/categoria.
- `joinSearchProducts` associa produto, loja e disponibilidade, omite lojas administrativas/excluídas e preserva o fluxo assíncrono do hook.
- `StoreCard` recebe a projeção `disponibilidade`; os dois consumidores de busca sempre a repassam e exibem `LojaEstadoBadge`. Home/Hub omitem o badge porque recebem somente lojas abertas.

## Evidência TDD

- RED: `pnpm --filter @keepit/cliente test -- src/lib/storeDiscovery.test.ts src/hooks/useSearchProdutos.test.ts` falhou como esperado: módulo `storeDiscovery` ausente e `joinSearchProducts is not a function`; os 4 testes legados do hook continuaram passando.
- GREEN: o mesmo comando passou 6/6 testes em 2 arquivos.
- As expectativas são literais e cobrem aberta/fechada/pausada, status administrativo, exclusão e associação produto–loja.

## Verificação

- `pnpm --filter @keepit/cliente test` — 277/277 testes passaram em 42 arquivos.
- `pnpm --filter @keepit/cliente typecheck` — passou.
- `pnpm --filter @keepit/core-data test -- src/ports/store.port.test.ts` — 20/20 testes passaram.
- `git diff --check` — passou.
- O Vitest emitiu apenas o aviso preexistente de depreciação da API CJS do Vite.

## Escopo e integração

- `BuscaLoja.tsx` e `BuscaProduto.tsx` não constavam da lista inicial de arquivos, mas receberam a adaptação mecânica aprovada necessária para consumir `{ loja, disponibilidade }` e mostrar o badge obrigatório; nenhum estado de view da Task 3 foi antecipado.
- Nenhuma dependência foi adicionada e nenhum renderer foi introduzido.
- Nenhuma chamada `store.getState` foi adicionada; a disponibilidade é derivada uma vez por loja a partir dos horários já carregados.
- As mudanças concorrentes de carrinho, pagamento e reset permaneceram fora do diff/staging desta task.
