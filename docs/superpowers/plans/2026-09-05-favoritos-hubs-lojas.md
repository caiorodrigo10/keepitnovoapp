# Hub and Store Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o cliente favorite hubs e lojas em mock e Supabase, com uma fonte compartilhada, persistência por conta, idempotência e reversão visual em falha.

**Architecture:** Duas ports explícitas expõem listar, consultar, favoritar e desfavoritar por ID. O mock grava os conjuntos já reservados no snapshot Cliente; o adapter Supabase usa duas relações protegidas por RLS. Um `FavoritesProvider` mantém a coleção única consumida por Home, Perfil, listas e detalhes e executa transições otimistas reversíveis.

**Tech Stack:** TypeScript 5.9, Vitest 1.2, React 19, React Native 0.86, Supabase/Postgres e AsyncStorage já instalados.

**Spec:** `docs/superpowers/specs/2026-09-04-estabilizacao-beta-android-cliente-design.md` (§§ 2, 4, 5, 12, 14, 21–23) e `docs/stories/12.11.story.md`

## Global Constraints

- `HubFavoritesPort` e `StoreFavoritesPort` são separados e oferecem `list`, `has`, `favorite` e `unfavorite`; a UI nunca consulta tabelas nem arrays mock diretamente.
- Toda operação usa a sessão corrente como identidade. Nenhuma API pública aceita `clienteId` fornecido pela tela.
- Repetir `favorite` ou `unfavorite` é sucesso idempotente; não há limite nem duplicata.
- No modo real, a lista remota é a fonte de verdade: o provider relê ao entrar/focar nas superfícies de favoritos, para que uma alteração feita em outro dispositivo apareça sem cache persistente concorrente.
- Hub `ativo === false` e loja pública fechada/pausada continuam na lista com texto explícito; hub inativo nunca é selecionável.
- O mock persiste `favoriteHubIds`/`favoriteStoreIds` no snapshot existente, restaura ao reabrir e zera somente no reset de cenário.
- As tabelas reais nascem com FK, chave composta, índice reverso, grants mínimos e RLS por operação. `anon` não recebe acesso e a service role nunca entra no app Cliente.
- A implementação deve consultar primeiro o changelog e a documentação atuais do Supabase sobre [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), executar `supabase --help` e o `--help` do subcomando antes de qualquer CLI, e não adicionar o CLI ou outra dependência ao projeto.
- Criar a migration somente com `supabase migration new cliente_favoritos`; usar exatamente o caminho emitido pelo CLI. Não digitar nem antecipar timestamp no plano ou na implementação.
- Após aplicar no projeto de desenvolvimento, executar os testes SQL com dois usuários, os advisors de segurança/performance, `supabase db pull <label> --local --yes` e `supabase migration list`; revisar o diff antes de aceitar qualquer arquivo gerado.
- Não gerar APK nesta story. Layout, contraste, estado acessível e persistência real serão verificados uma única vez no smoke Android QA/staging da Story 12.14.

---

### Task 1: Criar relações Supabase isoladas por usuário

**Files:**
- Create via Supabase CLI: `apps/supabase/supabase/migrations/<CLI-output>_cliente_favoritos.sql`
- Create: `apps/supabase/supabase/tests/cliente_favoritos_rls.test.sql`
- Modify (generated): `packages/shared-types/src/supabase.ts`
- Modify: `docs/architecture/03-data-models.md`
- Modify: `docs/architecture/05-security.md`

**Interfaces:**
- Produces: `public.clientes_hubs_favoritos(cliente_id, hub_id, criado_em)` with PK `(cliente_id, hub_id)`.
- Produces: `public.clientes_estabelecimentos_favoritos(cliente_id, estabelecimento_id, criado_em)` with PK `(cliente_id, estabelecimento_id)`.
- Produces: SELECT/INSERT/DELETE policies scoped by `(select auth.uid()) = cliente_id`; no UPDATE grant or policy.

- [ ] **Step 1: Descobrir os comandos e criar o arquivo sem inventar nome**

Em `apps/supabase`, ler `supabase --help`, `supabase migration new --help`, `supabase test --help`, `supabase db pull --help` e `supabase migration list --help`. Então executar somente `supabase migration new cliente_favoritos` e registrar o caminho real emitido. Se o CLI oficial não estiver disponível, parar e usar o MCP Supabase aprovado; não instalar pacote nem criar arquivo timestampado manualmente.

- [ ] **Step 2: Escrever primeiro o teste SQL de isolamento**

O teste transacional cria dois usuários/clientes e um hub/estabelecimento, troca `request.jwt.claim.sub` e role para provar:

```sql
-- user_a pode inserir, listar e apagar somente as próprias linhas.
-- repetir INSERT via ON CONFLICT DO NOTHING mantém count(*) = 1.
-- user_b vê count(*) = 0 para as linhas de user_a.
-- INSERT com cliente_id = user_a sob JWT de user_b falha por RLS.
-- anon não consegue SELECT/INSERT/DELETE.
```

Cobrir as duas tabelas no mesmo arquivo e encerrar com `ROLLBACK`; não depender de dados permanentes nem da service role como sujeito do teste.

- [ ] **Step 3: Implementar schema, grants e policies mínimas**

Ambas as FKs apontam para `clientes(id)` e seu recurso (`hubs(id)` ou `estabelecimentos(id)`) com `ON DELETE CASCADE`; `criado_em timestamptz NOT NULL DEFAULT now()`. A PK composta entrega uniqueness e consulta por cliente; adicionar índice no ID do recurso para a direção reversa/FK. Ativar e forçar RLS, revogar `anon`, conceder a `authenticated` somente SELECT/INSERT/DELETE e criar uma policy separada por operação, com autenticação explícita e ownership em `USING`/`WITH CHECK`.

Estender a policy de SELECT de `hubs` e `hubs_horarios` para que um usuário autenticado leia um hub inativo somente quando existir seu próprio favorito; não relaxar descoberta pública e não criar dependência circular entre policies. Atualizar os dois documentos normativos e regenerar `packages/shared-types/src/supabase.ts` pelo MCP/CLI oficial, nunca à mão.

- [ ] **Step 4: Validar migration/RLS e commit**

Executar a migration e o SQL de prova no `keepit-dev`, consultar advisors, puxar o schema local com label exclusiva e confirmar o histórico. Depois:

Run: `pnpm --filter @keepit/shared-types typecheck`

Expected: PASS com as duas relações geradas.

Commit somente o caminho exato criado pelo CLI:

```bash
git add <CLI-output> apps/supabase/supabase/tests/cliente_favoritos_rls.test.sql packages/shared-types/src/supabase.ts docs/architecture/03-data-models.md docs/architecture/05-security.md
git commit -m "feat(supabase): secure cliente favorites"
```

### Task 2: Implementar ports e paridade mock/Supabase

**Files:**
- Create: `packages/core-data/src/ports/favorites.port.ts`
- Create: `packages/core-data/src/mock/favorites.mock.ts`
- Create: `packages/core-data/src/mock/favorites.mock.test.ts`
- Create: `packages/core-data/src/supabase/favorites.supabase.ts`
- Create: `packages/core-data/src/supabase/favorites.supabase.test.ts`
- Modify: `packages/core-data/src/mock/db.ts`
- Modify: `packages/core-data/src/mock/cliente-state.ts`
- Modify: `packages/core-data/src/mock/cliente-state-store.ts`
- Modify: `packages/core-data/src/mock/cliente-state-store.test.ts`
- Modify: `packages/core-data/src/index.ts`
- Modify: `packages/core-data/src/index.test.ts`

**Interfaces:**
- Produces: `HubFavoritesPort` and `StoreFavoritesPort`, each with `list(options?): Promise<string[]>`, `has(resourceId, options?): Promise<boolean>`, `favorite(resourceId, options?): Promise<void>` and `unfavorite(resourceId, options?): Promise<void>`.
- Extends: `DataClient.favoriteHubs` and `DataClient.favoriteStores` in both datasources.

- [ ] **Step 1: Escrever RED do contrato comum**

Usar o mesmo conjunto de casos para cada adapter:

```ts
await port.favorite('resource-a', { delayMs: 0 });
await port.favorite('resource-a', { delayMs: 0 });
expect(await port.list({ delayMs: 0 })).toEqual(['resource-a']);
expect(await port.has('resource-a', { delayMs: 0 })).toBe(true);

await port.unfavorite('resource-a', { delayMs: 0 });
await port.unfavorite('resource-a', { delayMs: 0 });
expect(await port.list({ delayMs: 0 })).toEqual([]);
```

No mock, exigir sessão e comprovar persistência/reabertura/reset. No fake Supabase, comprovar `auth.getUser`, seleção por usuário, `upsert(..., { onConflict, ignoreDuplicates: true })`, DELETE restrito ao recurso e propagação de erro.

- [ ] **Step 2: Executar o RED**

Run: `pnpm --filter @keepit/core-data test -- src/mock/favorites.mock.test.ts src/supabase/favorites.supabase.test.ts src/mock/cliente-state-store.test.ts src/index.test.ts`

Expected: FAIL porque ports, adapters e campos do `DataClient` ainda não existem.

- [ ] **Step 3: Implementar uma factory por datasource e persistência real do mock**

Adicionar os dois arrays ao `MockDb`; `applyClienteSnapshot` os hidrata e `captureSnapshot` os grava. Os adapters mock clonam resultados e persistem somente após mutação efetiva. A implementação Supabase resolve o usuário pelo client injetado e usa as tabelas tipadas; erro de auth, query ou mutation sempre rejeita, sem fallback local.

Conectar ambos em `createDataClient`, exportar os tipos e manter os arrays vazios no baseline/reset. Não criar cache separado no core-data.

- [ ] **Step 4: Validar adapters, persistência e commit**

Run: `pnpm --filter @keepit/core-data test -- src/mock/favorites.mock.test.ts src/supabase/favorites.supabase.test.ts src/mock/cliente-state-store.test.ts src/index.test.ts`

Run: `pnpm --filter @keepit/core-data typecheck`

Expected: PASS para idempotência, sessão, erro, reabertura e reset.

```bash
git add packages/core-data/src/ports/favorites.port.ts packages/core-data/src/mock/favorites.mock.ts packages/core-data/src/mock/favorites.mock.test.ts packages/core-data/src/supabase/favorites.supabase.ts packages/core-data/src/supabase/favorites.supabase.test.ts packages/core-data/src/mock/db.ts packages/core-data/src/mock/cliente-state.ts packages/core-data/src/mock/cliente-state-store.ts packages/core-data/src/mock/cliente-state-store.test.ts packages/core-data/src/index.ts packages/core-data/src/index.test.ts
git commit -m "feat(core-data): add persistent cliente favorites"
```

### Task 3: Criar estado compartilhado e rollback otimista

**Files:**
- Create: `apps/cliente/src/lib/favoriteTransition.ts`
- Create: `apps/cliente/src/lib/favoriteTransition.test.ts`
- Create: `apps/cliente/src/context/FavoritesContext.tsx`
- Modify: `apps/cliente/src/navigation/RootNavigator.tsx`

**Interfaces:**
- Produces: `planFavoriteToggle(currentIds, resourceId)` returning immutable optimistic/rollback sets.
- Produces: `FavoritesContextValue` with hub/store IDs, counts, loading/error, `refresh` and `toggleHub`/`toggleStore`.
- Produces: `FavoriteMutationResult = { status: 'saved'; favorite: boolean } | { status: 'reverted'; favorite: boolean; error: Error }`.

- [ ] **Step 1: Escrever RED de transição e concorrência por item**

```ts
const transition = planFavoriteToggle(new Set(['a']), 'a');
expect([...transition.optimistic]).toEqual([]);
expect([...transition.rollback]).toEqual(['a']);
expect(transition.operation).toBe('unfavorite');
```

Cobrir adicionar, remover, imutabilidade e rollback. O provider deve ignorar segundo toque no mesmo ID enquanto a operação está pendente, mas permitir IDs diferentes.

- [ ] **Step 2: Executar RED**

Run: `pnpm --filter @keepit/cliente test -- src/lib/favoriteTransition.test.ts`

Expected: FAIL porque o módulo ainda não existe.

- [ ] **Step 3: Implementar provider único e erro observável**

Carregar as duas ports em paralelo. Em toggle, publicar o conjunto otimista, executar a port correta e manter o conjunto somente no sucesso; na rejeição, restaurar exatamente o snapshot anterior e expor erro genérico para a superfície chamadora. `refresh` relê ambas as fontes após login, retorno ao foreground e foco de Home/Perfil/Favoritos, garantindo convergência entre dispositivos sem realtime ou cache novo. Não duplicar estado em cards ou telas.

- [ ] **Step 4: Validar e commit**

Run: `pnpm --filter @keepit/cliente test -- src/lib/favoriteTransition.test.ts`

Run: `pnpm --filter @keepit/cliente typecheck`

Expected: PASS com o provider envolvendo as rotas sem quebrar o bootstrap.

```bash
git add apps/cliente/src/lib/favoriteTransition.ts apps/cliente/src/lib/favoriteTransition.test.ts apps/cliente/src/context/FavoritesContext.tsx apps/cliente/src/navigation/RootNavigator.tsx
git commit -m "feat(cliente): share optimistic favorites state"
```

### Task 4: Integrar favoritos nas superfícies existentes

**Files:**
- Create: `apps/cliente/src/components/discovery/FavoriteButton.tsx`
- Create: `apps/cliente/src/screens/perfil/Favoritos.tsx`
- Modify: `apps/cliente/src/components/discovery/StoreCard.tsx`
- Modify: `apps/cliente/src/screens/home/Home.tsx`
- Modify: `apps/cliente/src/screens/home/Hub.tsx`
- Modify: `apps/cliente/src/screens/home/Loja.tsx`
- Modify: `apps/cliente/src/screens/perfil/Perfil.tsx`
- Modify: `apps/cliente/src/navigation/PerfilStack.tsx`
- Modify: `apps/cliente/src/navigation/types.ts`
- Modify: `apps/cliente/src/lib/discoveryDisplay.ts`
- Modify: `apps/cliente/src/lib/discoveryDisplay.test.ts`

**Interfaces:**
- Consumes: only `FavoritesContext`; removes `FAVORITOS_IDS`/`isFavorito` as a source of truth.
- Produces: a Perfil route listing favorite hubs and stores, including unavailable entries and their textual state.

- [ ] **Step 1: Remover a fixture estática e ligar os mesmos IDs em toda superfície**

Home derives the favorite-store section from `favoriteStoreIds`; Perfil shows real hub/store counts and opens `Favoritos`. Detail screens and cards render one reusable button with `accessibilityRole="button"`, `accessibilityState={{ selected, disabled }}` and labels “Favoritar…”/“Desfavoritar…”. On `reverted`, show a single generic persistence error.

- [ ] **Step 2: Preservar indisponíveis e bloquear seleção de hub**

`Favoritos` resolves each stored ID through existing hub/store reads, keeps closed/paused stores and inactive hubs visible, shows “Indisponível” text and disables selection of an inactive hub. Missing/deleted targets are omitted only after a successful refresh; no favorite is silently removed by the UI.

- [ ] **Step 3: Executar o gate automatizado final**

Run: `pnpm --filter @keepit/core-data test -- src/mock/favorites.mock.test.ts src/supabase/favorites.supabase.test.ts src/mock/cliente-state-store.test.ts src/index.test.ts`

Run: `pnpm --filter @keepit/cliente test -- src/lib/favoriteTransition.test.ts src/lib/discoveryDisplay.test.ts`

Run: `pnpm --filter @keepit/core-data typecheck && pnpm --filter @keepit/cliente typecheck`

Expected: PASS para fonte única, adapters, idempotência, persistência e rollback. Não gerar APK; o único smoke da Story 12.14 cobre botões, contagens, indisponibilidade, restart e sincronização staging.

- [ ] **Step 4: Commit**

```bash
git add apps/cliente/src/components/discovery/FavoriteButton.tsx apps/cliente/src/screens/perfil/Favoritos.tsx apps/cliente/src/components/discovery/StoreCard.tsx apps/cliente/src/screens/home/Home.tsx apps/cliente/src/screens/home/Hub.tsx apps/cliente/src/screens/home/Loja.tsx apps/cliente/src/screens/perfil/Perfil.tsx apps/cliente/src/navigation/PerfilStack.tsx apps/cliente/src/navigation/types.ts apps/cliente/src/lib/discoveryDisplay.ts apps/cliente/src/lib/discoveryDisplay.test.ts
git commit -m "feat(cliente): expose favorites across app surfaces"
```
