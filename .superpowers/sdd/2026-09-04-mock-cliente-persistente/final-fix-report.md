# Story 12.1 — Final Fix Report

**Data:** 2026-09-04

**Worktree:** `/projects/keepitnovoapp/.worktrees/story-12-1-mock-cliente`

**Escopo:** única onda de correção dos cinco findings `Important` e do minor de sequenciamento do reset; sem UI/Painel QA.

## Resultado

Os cinco findings foram tratados com contratos locais e sem dependência ou framework novo:

1. mutações de auth/order agora aguardam a tentativa de persistência correspondente;
2. reset de snapshot e limpeza persistida do carrinho retornam degradação observável;
3. reset notifica logout, invalida recovery mock e aceita callback para limpar o CartProvider vivo;
4. snapshots semanticamente inconsistentes caem integralmente no baseline;
5. singleton com hidratação rejeitada é descartado, o fallback recebe instância nova e o bootstrap tem timeout configurável de 5 s por padrão;
6. o carrinho persistido/vivo só é limpo depois de `demoScenario.reset()` concluir.

## RED

### Core-data

Comando:

```bash
pnpm --filter @keepit/core-data test -- src/mock/cliente-state.test.ts src/mock/cliente-state-store.test.ts src/index.test.ts
```

Saída observada antes da implementação:

- exit `1`;
- 3 arquivos falharam;
- 9 testes falharam e 26 passaram;
- falhas esperadas: cinco invariantes semânticas aceitas, auth concluindo antes de `setItem`, reset retornando `undefined`, ausência de logout no reset e singleton rejeitado reutilizado.

### App Cliente

Comando:

```bash
pnpm --filter @keepit/cliente test -- src/lib/cartStorage.test.ts src/lib/resetDemoScenario.test.ts src/lib/dataClientBootstrap.test.ts
```

Saída observada antes da implementação:

- exit `1`;
- 3 arquivos falharam;
- 6 testes falharam e 19 passaram;
- falhas esperadas: `clearCartState()` sem resultado observável, reset reportando sucesso falso, callback vivo ausente e bootstrap sem função/timeout configurável.

## GREEN focado

```bash
pnpm --filter @keepit/core-data test -- src/mock/cliente-state.test.ts src/mock/cliente-state-store.test.ts src/index.test.ts
```

- exit `0`; 3 arquivos, 35/35 testes.

```bash
pnpm --filter @keepit/cliente test -- src/lib/cartStorage.test.ts src/lib/resetDemoScenario.test.ts src/lib/dataClientBootstrap.test.ts
```

- exit `0`; 3 arquivos, 25/25 testes.

```bash
pnpm --filter @keepit/core-data test -- src/mock/auth.mock.test.ts src/mock/order.mock.test.ts src/mock/async-helpers.test.ts
```

- exit `0`; Vitest encontrou os 2 arquivos existentes solicitados, 60/60 testes.

## Verificação final completa

```bash
pnpm --filter @keepit/core-data test
```

- exit `0`; 29 arquivos, 558/558 testes.

```bash
pnpm --filter @keepit/cliente test
```

- exit `0`; 23 arquivos, 176/176 testes.

```bash
pnpm --filter @keepit/core-data typecheck
```

- exit `0`; `tsc --noEmit` sem erros.

```bash
pnpm --filter @keepit/cliente typecheck
```

- exit `0`; `tsc --noEmit` sem erros.

As suites emitiram apenas o aviso já existente de depreciação da build CJS da API Node do Vite; não houve warning novo da implementação.

## Decisões MVP

- `MockDb.onClienteMutation` aceita `void | Promise<void>` para preservar doubles legados, enquanto os adapters auth/order sempre fazem `await`. A store conecta esse hook diretamente à Promise real da fila.
- `simulateAsync` aceita factory síncrona ou assíncrona; não foi criado segundo helper nem abstração de comando.
- A fila continua fail-open e resiliente. Internamente cada escrita informa sucesso/falha; `persist()` continua sem lançar e `reset()` retorna `{ status: 'reset' | 'degraded' }`.
- Um único callback `onClienteStateReset` liga store e auth mock. Ele limpa as duas referências de recovery e publica o estado de auth atual (`null`) aos listeners.
- `resetDemoScenario` agrega somente as duas falhas de persistência relevantes (`scenario-persistence` e `cart-persistence`) e aceita `clearLiveCart`; não conhece React nem o `CartContext`.
- A validação semântica cobre exatamente as invariantes pedidas: sessão fora das contas, conta duplicada, prefixo protegido `lj-cliente-*`, pedido fora das contas e item apontando para outro pedido.
- `initializeDataClient` invalida somente o singleton/promessa que efetivamente rejeitou, evitando que uma Promise antiga apague uma recuperação mais nova.
- `recoverDataClient` é a operação mínima de recuperação para o bootstrap. Em falha/timeout do próprio mock persistente, o fallback usa storage volátil novo; em falha Supabase, tenta primeiro o mock persistente novo.
- O timeout do bootstrap é configurável por `bootstrapDataClient({ timeoutMs })` e usa `5_000 ms` em produção.

## Arquivos alterados

### Core-data

- `packages/core-data/src/index.ts`
- `packages/core-data/src/index.test.ts`
- `packages/core-data/src/ports/demo-scenario.port.ts`
- `packages/core-data/src/mock/async-helpers.ts`
- `packages/core-data/src/mock/db.ts`
- `packages/core-data/src/mock/auth.mock.ts`
- `packages/core-data/src/mock/order.mock.ts`
- `packages/core-data/src/mock/cliente-state.ts`
- `packages/core-data/src/mock/cliente-state.test.ts`
- `packages/core-data/src/mock/cliente-state-store.ts`
- `packages/core-data/src/mock/cliente-state-store.test.ts`

### App Cliente

- `apps/cliente/src/lib/cartStorage.ts`
- `apps/cliente/src/lib/cartStorage.test.ts`
- `apps/cliente/src/lib/resetDemoScenario.ts`
- `apps/cliente/src/lib/resetDemoScenario.test.ts`
- `apps/cliente/src/lib/dataClientBootstrap.ts`
- `apps/cliente/src/lib/dataClientBootstrap.test.ts`

### Evidência

- `.superpowers/sdd/2026-09-04-mock-cliente-persistente/final-fix-report.md`

## Preocupações e limites

- A UI/Painel QA permanece fora de escopo. Quando a Story 12.2 ligar o fluxo, deve passar a limpeza viva do `CartContext` e apresentar `status: 'degraded'` sem anunciar sucesso integral.
- Timeout não cancela a operação de storage subjacente; ele abandona e isola o singleton antigo antes de criar o novo. Não foi introduzido mecanismo de cancelamento que o AsyncStorage não oferece.
- Mutações seguem fail-open: após uma tentativa de escrita rejeitada, a operação conclui com estado em memória e a degradação fica observável em `demoScenario.getStatus()`.
- Não houve teste manual em APK release nem validação visual, ambos fora desta correção e já pendentes na Story 12.1.
