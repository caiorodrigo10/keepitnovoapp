# Task 4 report — catálogo consultável e bloqueio uniforme de compra

## Status

Implementado no worktree `story-12-1-mock-cliente`.

## Entregas

- `canCheckoutStore(loja, now?)` falha fechado para dado ausente e delega integralmente a decisão de compra a `resolveLojaDisponibilidade`.
- `Loja` removeu a consulta redundante de estado, deriva a projeção do estabelecimento já carregado e mantém abas/produtos navegáveis para lojas fechadas ou pausadas.
- `DetalheProduto` bloqueia em profundidade a transação de carrinho e desabilita o CTA quando a loja não está aberta, exibindo o motivo textual correspondente.
- `Checkout` bloqueia loja indisponível antes de CPF/pagamento tanto no handler quanto no estado do botão, protege também a linha de forma de pagamento e usa a mesma mensagem visível/em alerta.
- `Pagamento` falha fechado no handler e no CTA, preserva o retry de limpeza de pedido já criado e relê a loja por `StorePort.getById` imediatamente antes de `order.create`.
- `LojaEstadoBadge` preserva texto/cores existentes e expõe `accessibilityRole="text"` com `Loja aberta`, `Loja fechada` ou `Loja pausada`.
- O catálogo e o CTA de detalhe não usam opacidade como sinal isolado; o CTA indisponível usa fundo/borda, semântica disabled e motivo textual.

## Evidência TDD

- RED: `pnpm --filter @keepit/cliente test -- src/lib/checkoutValidation.test.ts` falhou nos 6 casos novos com `canCheckoutStore is not a function`; os 18 testes preexistentes passaram.
- GREEN focado: o mesmo comando passou 24/24 testes depois da implementação mínima do helper.
- A tabela protege contra retorno constante, inversão de estado e bypass da projeção central para loja fechada, pausada, suspensa, excluída ou ausente.
- Correção pós-review: o primeiro RED falhou em 6 casos com `getCheckoutStoreBlockMessage is not a function`; após o GREEN, um segundo RED falhou em 6 casos com `loadCheckoutStoreForSubmission is not a function`.
- GREEN pós-review: 36/36 testes focados passaram. A nova tabela cobre o boundary final com releitura de loja aberta, fechada, pausada, suspensa, excluída e ausente; somente a aberta é devolvida para a criação do pedido.

## Verificação

- `pnpm --filter @keepit/core-data test -- src/ports/store.port.test.ts src/mock/store.mock.test.ts src/supabase/store.supabase.test.ts` — 61/61 passaram.
- `pnpm --filter @keepit/cliente test -- src/lib/storeDiscovery.test.ts src/lib/searchViewState.test.ts src/hooks/useSearchProdutos.test.ts src/lib/checkoutValidation.test.ts` — 54/54 passaram após a correção.
- `pnpm --filter @keepit/cliente test` — 43 arquivos e 307/307 testes passaram após a correção.
- `pnpm --filter @keepit/core-data typecheck && pnpm --filter @keepit/cliente typecheck` — passou.
- CodeRabbit CLI não está instalado; revisão automatizada foi ignorada conforme `graceful_degradation` do projeto.
- O Vitest emitiu apenas o aviso preexistente de depreciação da API CJS do Vite.

## Limites e riscos residuais

- Conforme o brief, nenhum renderer/dependência, APK ou checklist visual foi criado. Contraste, toque/navegação, teclado e semântica em device permanecem para o QA Android consolidado da Story 12.14.
- O bloqueio client-side é defesa de UX; a barreira autoritativa de criação de pedido continua nas regras/RPCs existentes, fora do escopo desta task.
