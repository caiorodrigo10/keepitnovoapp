# Task 2 report — ports e paridade mock/Supabase de favoritos

Data: 2026-09-05
Base de schema/tipos: `cbe43e0 feat(supabase): secure cliente favorites`

## Resultado

- `HubFavoritesPort` e `StoreFavoritesPort` expõem `list`, `has`, `favorite`
  e `unfavorite` com `AsyncCallOptions`.
- `DataClient.favoriteHubs` e `DataClient.favoriteStores` estão conectados nos
  datasources mock e Supabase por uma factory própria de cada datasource.
- O mock exige sessão de Cliente em todas as operações, mantém hubs e lojas em
  coleções separadas por `cliente_id`, devolve cópia nas leituras e chama a
  persistência somente quando a coleção da conta atual realmente muda.
- `MockDb`, `applyClienteSnapshot` e `ClienteMockStateStore.captureSnapshot`
  hidratam/gravam mapas de favoritos com ownership no snapshot V4. Snapshots
  V1–V3 são migrados e os favoritos globais legados são preservados sob a
  conta demo `cliente-ana`. O baseline e o reset permanecem vazios.
- O adapter Supabase chama `auth.getUser()` em toda operação, consulta por
  `cliente_id`, usa `upsert` com `ignoreDuplicates: true` e a PK composta como
  `onConflict`, e restringe `DELETE` por usuário + recurso.
- Erros de auth, ausência de sessão, query, upsert e delete rejeitam a Promise.
  Não foi criado fallback ou cache local de favoritos, nem dependência nova.

## Evidência TDD

### RED inicial

```text
pnpm --filter @keepit/core-data test -- src/mock/favorites.mock.test.ts src/supabase/favorites.supabase.test.ts src/mock/cliente-state-store.test.ts src/index.test.ts

Test Files  4 failed (4)
Tests       3 failed | 31 passed (34)

Failed to load url ./favorites.mock
Failed to load url ./favorites.supabase
expected undefined not to be undefined (favoriteHubs/favoriteStores)
Cannot read properties of undefined (reading 'favorite')
Exit 1
```

### RED de segurança encontrado no self-review

```text
pnpm --filter @keepit/core-data test -- src/mock/favorites.mock.test.ts

Test Files  1 failed (1)
Tests       1 failed | 8 passed (9)
promise resolved "[]" instead of rejecting
Exit 1
```

O segundo RED provou que `forceEmpty` conseguia contornar a exigência de
sessão. A correção mantém a latência/estados simulados, mas autentica antes de
aplicá-los.

### GREEN focado

```text
pnpm --filter @keepit/core-data test -- src/mock/favorites.mock.test.ts src/supabase/favorites.supabase.test.ts src/mock/cliente-state-store.test.ts src/index.test.ts

Test Files  4 passed (4)
Tests       50 passed (50)
Exit 0
```

Após o caso adicional de segurança, `favorites.mock.test.ts` passou com 9/9
testes.

### RED do review — isolamento entre contas

```text
pnpm --filter @keepit/core-data test -- src/mock/favorites.mock.test.ts src/mock/cliente-state-store.test.ts src/mock/cliente-state.test.ts

Test Files  3 failed (3)
Tests       3 failed | 57 passed (60)

expected [ "store-ana", "store-bea" ] to deeply equal [ "store-bea" ]
expected [ "hub-ana", "hub-bea" ] to deeply equal [ "hub-bea" ]
snapshot V3 retornou status "valid" em vez de migrar para V4
Exit 1
```

### GREEN do review

```text
pnpm --filter @keepit/core-data test -- src/mock/favorites.mock.test.ts src/mock/cliente-state-store.test.ts src/mock/cliente-state.test.ts

Test Files  3 passed (3)
Tests       60 passed (60)
Exit 0
```

Os regressions alternam entre duas contas válidas, provam que uma não lê nem
remove favoritos da outra, reabrem o snapshot com a segunda sessão ativa,
voltam à conta demo e confirmam reset integral. Um caso separado prova a
migração V3 → V4 sem perda dos favoritos demo.

## Verificação final

- `pnpm --filter @keepit/core-data test` — PASS, 32 arquivos e 623 testes.
- `pnpm --filter @keepit/core-data typecheck` — PASS.
- `git diff --check` — PASS.
- O Vitest emitiu somente o aviso preexistente de depreciação da API CJS do
  Vite.
- CodeRabbit CLI não está instalado neste ambiente; a revisão automatizada foi
  omitida conforme o fallback configurado no projeto.

## Validação Supabase

Antes da implementação foram conferidos o changelog e a documentação oficial
atual do Supabase. As APIs vigentes confirmam `auth.getUser()` como leitura
autenticada no servidor, `upsert` com `onConflict`/`ignoreDuplicates` e
`delete()` sempre acompanhado de filtros. A mudança de 2026 sobre grants do
Data API já está coberta pela migration de `cbe43e0`, que concede explicitamente
`SELECT, INSERT, DELETE` a `authenticated` e mantém RLS por ownership.

Referências:

- <https://supabase.com/docs/reference/javascript/auth-getuser>
- <https://supabase.com/docs/reference/javascript/upsert>
- <https://supabase.com/docs/reference/javascript/delete>
- <https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically>

## Escopo e preocupações

- Nenhum arquivo da Story 12.10 ou dos apps foi alterado por esta task.
- O HIGH de isolamento registrado em `task-2-review.md` foi corrigido na
  origem: todas as leituras/mutações mock resolvem o mapa pela sessão atual, e
  o snapshot só aceita/persiste owners presentes em `accounts`.
- A instância do SDK Supabase continua com resolução lazy para preservar
  `createDataClient({ source: 'supabase' })` sem exigir env até a primeira
  operação. Isso não é cache de favoritos; nenhum dado de domínio é mantido
  localmente pelo adapter.
- Sem preocupações funcionais conhecidas dentro do escopo do brief.
