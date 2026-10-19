# Task 3 report — estado compartilhado e rollback otimista

Data: 2026-09-05
Base das ports: `ddbfcbe feat(core-data): add persistent cliente favorites`
Correção de isolamento herdada: `ae24991 fix(core-data): isolate mock favorites by cliente`

## Resultado

- `planFavoriteToggle` cria snapshots independentes para o estado otimista e
  rollback sem alterar o `ReadonlySet` recebido, distinguindo `favorite` de
  `unfavorite` pela presença do recurso.
- Um executor compartilhado por coleção impede uma segunda mutação do mesmo ID
  enquanto a primeira está pendente (devolve a mesma Promise), mas permite IDs
  diferentes em paralelo.
- Em falha, somente a pertinência do item rejeitado volta ao snapshot anterior;
  uma mutação concorrente de outro ID não é perdida. O erro do adapter não é
  exposto: o contexto e o resultado recebem um erro genérico acionável.
- `FavoritesProvider` é a fonte única de IDs e contagens de hubs/lojas. A carga
  usa `Promise.all` sobre as duas ports e protege o estado otimista contra
  respostas antigas de refresh.
- O provider atualiza no mount autenticado (login/troca de conta), no retorno ao
  foreground e quando a rota focada é `Home`, `Perfil` ou `Favoritos`.
- `RootNavigator` envolve somente as rotas autenticadas e usa `cliente.id` como
  key, evitando leitura sem sessão e vazamento de estado ao trocar de conta.
- Nenhum cache de domínio, realtime, renderer de teste ou dependência foi
  adicionado.

## Evidência TDD

### RED inicial

```text
pnpm --filter @keepit/cliente test -- src/lib/favoriteTransition.test.ts

Test Files  1 failed (1)
Failed to load url ./favoriteTransition
Exit 1
```

### RED de rejeição síncrona encontrado no self-review

```text
Test Files  1 failed (1)
Tests       1 failed | 5 passed (6)
expected "spy" to be called 2 times, but got 1 times
Exit 1
```

O caso provou que uma port que lançasse antes de devolver a Promise podia deixar
o ID preso no mapa de operações pendentes. A execução agora normaliza essa
falha e libera o ID no `finally` da Promise registrada.

### RED de refresh por foco

```text
Test Files  1 failed (1)
Tests       7 failed | 6 passed (13)
shouldRefreshFavoritesOnFocus is not a function
Exit 1
```

### RED de refresh concorrente encontrado no review

```text
Test Files  1 failed (1)
Tests       2 failed | 12 passed (14)
canApplyFavoriteRefresh is not a function
executor.hasPending is not a function
Exit 1
```

O gate impede que uma listagem iniciada durante uma mutação em voo publique um
snapshot remoto anterior ao toggle. A resposta só entra quando a coleção não
tem mutação pendente e sua sequência continua igual à capturada no início.

### GREEN focado final

```text
pnpm --filter @keepit/cliente test -- src/lib/favoriteTransition.test.ts

Test Files  1 passed (1)
Tests       14 passed (14)
Exit 0
```

## Verificação

- `pnpm --filter @keepit/cliente typecheck` — PASS.
- `pnpm --filter @keepit/cliente test` — PASS, 44 arquivos e 322 testes.
- `git diff --check` — PASS.
- O Vitest emitiu somente o aviso preexistente de depreciação da API CJS do
  Vite.
- CodeRabbit CLI não está instalado neste ambiente; não houve revisão
  automatizada externa. A revisão foi feita contra o brief, as ports existentes
  e os cenários de corrida cobertos pelo teste focado.

## Self-review e preocupações

- Corridas consideradas: segundo toque no mesmo ID, operações de IDs diferentes,
  rollback depois do sucesso concorrente e refresh iniciado antes de uma mutação.
- Bordas consideradas: coleção vazia, remoção de item existente, adição de item
  ausente, exceção síncrona da port, unmount com request em voo e troca de conta.
- Respostas de refresh antigas não sobrescrevem um toggle posterior; cada
  coleção mantém seu próprio contador de mutação.
- O listener de navegação consulta a rota mais interna focada e só relê as ports
  nas três superfícies exigidas, sem criar polling ou assinatura realtime.
- Sem preocupações funcionais conhecidas dentro do escopo do brief.
