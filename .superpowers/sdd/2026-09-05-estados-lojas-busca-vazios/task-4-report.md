# Task 4 report — catálogo consultável e bloqueio uniforme de compra

## Status

Implementado no worktree `story-12-1-mock-cliente`.

## Entregas

- `canCheckoutStore(loja, now?)` falha fechado para dado ausente e delega integralmente a decisão de compra a `resolveLojaDisponibilidade`.
- `Loja` removeu a consulta redundante de estado, deriva a projeção do estabelecimento já carregado e mantém abas/produtos navegáveis para lojas fechadas ou pausadas.
- `DetalheProduto` bloqueia em profundidade a transação de carrinho e desabilita o CTA quando a loja não está aberta, exibindo o motivo textual correspondente.
- `Checkout` bloqueia loja indisponível antes de CPF/pagamento tanto no handler quanto no estado do botão, com a mesma mensagem visível e em alerta.
- `LojaEstadoBadge` preserva texto/cores existentes e expõe `accessibilityRole="text"` com `Loja aberta`, `Loja fechada` ou `Loja pausada`.
- O catálogo e o CTA de detalhe não usam opacidade como sinal isolado; o CTA indisponível usa fundo/borda, semântica disabled e motivo textual.

## Evidência TDD

- RED: `pnpm --filter @keepit/cliente test -- src/lib/checkoutValidation.test.ts` falhou nos 6 casos novos com `canCheckoutStore is not a function`; os 18 testes preexistentes passaram.
- GREEN focado: o mesmo comando passou 24/24 testes depois da implementação mínima do helper.
- A tabela protege contra retorno constante, inversão de estado e bypass da projeção central para loja fechada, pausada, suspensa, excluída ou ausente.

## Verificação

- `pnpm --filter @keepit/core-data test -- src/ports/store.port.test.ts src/mock/store.mock.test.ts src/supabase/store.supabase.test.ts` — 61/61 passaram.
- `pnpm --filter @keepit/cliente test -- src/lib/storeDiscovery.test.ts src/lib/searchViewState.test.ts src/hooks/useSearchProdutos.test.ts src/lib/checkoutValidation.test.ts` — 42/42 passaram.
- `pnpm --filter @keepit/core-data typecheck && pnpm --filter @keepit/cliente typecheck` — passou.
- CodeRabbit CLI não está instalado; revisão automatizada foi ignorada conforme `graceful_degradation` do projeto.
- O Vitest emitiu apenas o aviso preexistente de depreciação da API CJS do Vite.

## Limites e riscos residuais

- Conforme o brief, nenhum renderer/dependência, APK ou checklist visual foi criado. Contraste, toque/navegação, teclado e semântica em device permanecem para o QA Android consolidado da Story 12.14.
- O bloqueio client-side é defesa de UX; a barreira autoritativa de criação de pedido continua nas regras/RPCs existentes, fora do escopo desta task.
