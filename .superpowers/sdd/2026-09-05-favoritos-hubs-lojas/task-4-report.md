# Task 4 report — favoritos nas superfícies do Cliente

Data: 2026-09-05
Base: `cfe1891 feat(core-data): persist mock password recovery`

## Resultado

- `FavoriteButton` consome somente `FavoritesContext`, usa a mesma fonte para
  hubs e lojas e expõe `accessibilityRole="button"`, estado
  `selected`/`disabled` e labels “Favoritar…”/“Desfavoritar…”. Um toggle
  revertido exibe uma única mensagem genérica e o interlock local impede dois
  handlers simultâneos no mesmo botão.
- `StoreCard`, `Hub` e `Loja` usam o botão compartilhado. A estrutura de
  `StoreCard` separa a ação de abrir a loja da ação de favoritar, sem
  `Pressable` aninhado.
- A Home deriva a seção exclusivamente de `favoriteStoreIds`; a fixture
  `FAVORITOS_IDS`/`isFavorito` foi removida.
- Perfil mostra contagens reais e separadas de hubs e lojas e abre a nova rota
  `Favoritos`.
- `Favoritos` resolve os IDs pelas leituras existentes `hub.getById` e
  `store.getById`, preserva a ordem persistida e mantém o último snapshot se
  uma leitura/refresh falha. Alvos ausentes e lojas excluídas/não públicas só
  deixam a lista depois de uma resolução integral bem-sucedida; a UI nunca
  chama `unfavorite` automaticamente.
- Hubs inativos e lojas fechadas/pausadas continuam visíveis com o texto
  “Indisponível”. A linha de hub inativo não navega, mas o botão de desfavoritar
  permanece utilizável. Lojas fechadas/pausadas continuam abrindo o detalhe,
  onde o bloqueio de compra já é aplicado pela Story 12.10.
- Nenhum renderer, APK, dependência, cache ou arquivo de autenticação foi
  criado/modificado por esta Task.

## Evidência TDD

### RED — seleção/resolução dinâmica

```text
pnpm --filter @keepit/cliente test -- src/lib/discoveryDisplay.test.ts
Test Files  1 failed (1)
Tests       3 failed | 6 passed (9)
selectFavoriteEntities/resolveFavoriteEntities is not a function
```

### RED — exclusão somente após lote resolvido

```text
Test Files  1 failed (1)
Tests       1 failed | 9 passed (10)
expected loja excluída omitida; recebeu loja visível + excluída
```

### RED — refresh falho versus rollback

```text
Test Files  1 failed (1)
Tests       1 failed | 10 passed (11)
shouldResolveFavoriteSnapshot is not a function
```

Esse último caso protege uma corrida encontrada no self-review: uma remoção
otimista podia atualizar a tela antes da rejeição da port. Agora refresh falho
mantém o snapshot anterior, enquanto uma nova identidade de coleção produzida
pelo rollback é resolvida e republicada.

## Verificação

- Gate focado `@keepit/core-data`: PASS — 4 arquivos, 55 testes.
- Gate focado `@keepit/cliente`: PASS — 2 arquivos, 25 testes.
- Suíte completa `@keepit/cliente`: PASS — 44 arquivos, 327 testes.
- `git diff --check`: PASS.
- `rg "FAVORITOS_IDS|isFavorito" apps/cliente/src`: zero ocorrências.
- CodeRabbit CLI não está instalado; revisão automática omitida conforme o
  graceful degradation configurado.
- Não foi gerado APK nem executado renderer, conforme o brief.

## Bloqueio externo do gate de tipos

Os dois typechecks chegam ao mesmo erro pré-existente e fora do escopo desta
Task:

```text
packages/core-data/src/supabase/auth.supabase.ts:160:11 TS2322
requestPasswordReset retorna Promise<void>, mas AuthPort espera
Promise<PasswordResetRequestResult>.
```

- `pnpm --filter @keepit/core-data typecheck`: FAIL somente nesse arquivo.
- `pnpm --filter @keepit/cliente typecheck`: FAIL somente nesse mesmo arquivo
  transitivo.
- O arquivo pertence à implementação de recuperação de senha da Story 12.12 e
  não foi tocado, como exigido pelo escopo. Os diagnósticos não apontaram nenhum
  arquivo da Task 4.

## Concorrência do worktree

Durante a verificação, trabalho paralelo modificou
`packages/core-data/src/mock/auth.mock.test.ts`. Esse arquivo não pertence à
Task 4 e será explicitamente excluído do staging/commit.

## Follow-up — revisão final do plano

Os três achados de `final-review.md` foram tratados em uma correção integrada:

- `EscolhaRetirada` agora exibe um `FavoriteButton` irmão em cada hub, inclusive
  quando a contagem atual é zero. O controle continua acessível durante a
  descoberta e não interfere no bloqueio de seleção do hub.
- Mutações de favoritos no mock agora executam dentro da mesma barreira
  serializada usada para persistência, retornam uma closure de rollback e
  rejeitam quando o `AsyncStorage` falha. Tanto favorito quanto desfavorito
  restauram o estado em memória anterior à tentativa.
- A notificação de rollback saiu de cada botão e passou para o único caminho de
  erro do `FavoritesProvider`. Chamadores que compartilham a mesma Promise
  recebem o mesmo resultado revertido, mas somente um alerta é publicado.

### Evidência RED adicional

- `favorites.mock.test.ts`: callback de persistência rejeitado deixava o ID
  adicionado/removido em memória.
- `cliente-state-store.test.ts`: falha de `AsyncStorage.setItem` resolvia a
  mutação como sucesso em vez de rejeitar e reverter.
- `favoriteTransition.test.ts`: `publishFavoriteError` ainda não existia para
  centralizar uma única notificação entre seguidores da mesma transição.

### Verificação do follow-up

- Gate focado `@keepit/core-data`: PASS — 4 arquivos, 63 testes (incluindo 44
  nos dois arquivos diretamente alterados).
- Gate focado `@keepit/cliente`: PASS — 2 arquivos, 26 testes.
- Suíte completa `@keepit/core-data`: PASS — 32 arquivos, 646 testes.
- Suíte completa `@keepit/cliente`: PASS — 44 arquivos, 328 testes.
- `git diff --check`: PASS.
- Os dois typechecks continuam bloqueados somente pelo mesmo `TS2322` em
  `packages/core-data/src/supabase/auth.supabase.ts:160`, fora do escopo e sem
  alterações nesta Task.
- Nenhum renderer, APK, dependência ou arquivo de autenticação foi alterado.
