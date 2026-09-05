# Store Availability, Search, and Empty States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar lojas conforme disponibilidade e superfície, manter catálogos indisponíveis consultáveis e tornar todos os estados da busca explícitos sem espaços vazios.

**Architecture:** `@keepit/core-data` concentra uma projeção pura de visibilidade/compra e faz mock/Supabase devolverem o mesmo conjunto público: lojas ativas e não excluídas, inclusive fechadas ou pausadas. O app deriva listas de compra versus busca dessa projeção, resolve a matriz de apresentação em funções puras e aplica o mesmo bloqueio no detalhe e checkout.

**Tech Stack:** TypeScript 5.9, Vitest 1.2, React 19, React Native 0.86, Supabase/Postgres e componentes/tokens já existentes.

**Spec:** `docs/superpowers/specs/2026-09-04-estabilizacao-beta-android-cliente-design.md` (§§ 2, 4, 14, 15, 21–23) e `docs/stories/12.10.story.md`

## Global Constraints

- A fonte pública contém somente `status === 'ativo'` e `excluido_em === null`; `em_analise`, `rejeitado`, `suspenso` e excluído nunca chegam à busca do Cliente.
- Loja ativa fechada ou pausada permanece pesquisável e com catálogo consultável; Home e Hub mostram somente lojas com compra disponível.
- Em Home, o filtro vale para descoberta “perto do hub” e categorias; a coleção separada de favoritos da Story 12.11 continuará mostrando indisponíveis conforme §14 do design.
- `pausado_manualmente` vence o horário; sem horário válido para o instante, a loja está fechada; somente `aberta` permite adicionar ou pagar.
- A mesma `resolveLojaDisponibilidade(loja, now)` alimenta Home, Hub, busca, cards, detalhe e checkout; não duplicar comparações de status/horário em telas.
- A RLS continua sendo a barreira de exposição de dados administrativos. A mudança permite leitura pública de loja/produto pausado, mas as RPCs de criação de pedido continuam bloqueando `pausado_manualmente = true`.
- Badge de fechada/pausada tem texto e propriedades acessíveis; opacidade nunca é o único sinal.
- Busca diferencia loading, erro, sugestões/recentes sem texto, vazio geral, vazio de lojas, vazio de produtos, categoria vazia e resultados.
- Se uma seção não tem conteúdo, ela não monta container/título; sugestões gerais usam título próprio e não se confundem com resultados da categoria.
- Não adicionar mecanismo de busca, cache, storage, UI kit, renderer ou dependência; recentes ficam limitados à sessão e sugestões são constantes locais já tipadas.
- Automatizar regra, adapters, filtros, matriz de busca e bloqueio com Vitest Node; contraste, teclado, layout e navegação visual ficam exclusivamente no smoke único da Story 12.14.

---

### Task 1: Contrato central e paridade pública mock/Supabase

**Files:**
- Modify: `packages/core-data/src/ports/store.port.ts`
- Modify: `packages/core-data/src/ports/store.port.test.ts`
- Modify: `packages/core-data/src/mock/fixtures/estabelecimentos.ts`
- Modify: `packages/core-data/src/mock/store.mock.ts`
- Modify: `packages/core-data/src/mock/store.mock.test.ts`
- Modify: `packages/core-data/src/supabase/store.supabase.ts`
- Modify: `packages/core-data/src/supabase/store.supabase.test.ts`
- Create: `apps/supabase/supabase/migrations/20260905090000_cliente_consulta_lojas_indisponiveis.sql`

**Interfaces:**
- Extends: `Estabelecimento.excluido_em: string | null` e os mapeamentos mock/Supabase.
- Produces: `LojaDisponibilidade = { estado: null; visivelAoCliente: false; disponivelParaCompra: false; motivo: 'administrativa' | 'excluida' } | { estado: LojaEstado; visivelAoCliente: true; disponivelParaCompra: boolean; motivo: LojaEstado }`.
- Produces: `resolveLojaDisponibilidade(estabelecimento, now?)` como única regra de domínio.
- Refines: `StorePort.listByHub` devolve lojas públicas do hub, inclusive pausadas/fechadas; filtros por superfície ficam no app.

- [ ] **Step 1: Escrever o RED da tabela de verdade e dos adapters**

Adicionar a `store.port.test.ts`:

```ts
const NOW = new Date(2026, 8, 5, 12, 0);
const horarioAberto = [{ dia_semana: NOW.getDay(), aberto: true, hora_abre: '08:00', hora_fecha: '18:00' }];
const horarioFechado = [{ dia_semana: NOW.getDay(), aberto: true, hora_abre: '08:00', hora_fecha: '10:00' }];
const loja = (override: Partial<Estabelecimento>): Estabelecimento => ({
  id: 'loja', nome_fantasia: 'Loja', categoria: 'farmacia', descricao: null,
  foto_fachada_url: null, endereco: 'Rua A', lat: 0, lng: 0, raio_atendimento_km: 1,
  tempo_medio_entrega_min: 20, taxa_deslocamento_reais: 5, ticket_minimo_reais: null,
  status: 'ativo', motivo_rejeicao: null, motivo_suspensao: null,
  pausado_manualmente: false, excluido_em: null, horarios: horarioAberto,
  ...override,
});

it.each([
  ['aberta', loja({ status: 'ativo', excluido_em: null, pausado_manualmente: false, horarios: horarioAberto }), true, true],
  ['fechada', loja({ status: 'ativo', excluido_em: null, pausado_manualmente: false, horarios: horarioFechado }), true, false],
  ['pausada', loja({ status: 'ativo', excluido_em: null, pausado_manualmente: true, horarios: horarioAberto }), true, false],
  ['administrativa', loja({ status: 'suspenso', excluido_em: null, pausado_manualmente: false, horarios: horarioAberto }), false, false],
  ['excluida', loja({ status: 'ativo', excluido_em: '2026-09-05T09:00:00.000Z', pausado_manualmente: false, horarios: horarioAberto }), false, false],
])('%s resolve visibilidade e compra', (_case, estabelecimento, visivel, compra) => {
  expect(resolveLojaDisponibilidade(estabelecimento, NOW)).toMatchObject({
    visivelAoCliente: visivel, disponivelParaCompra: compra,
  });
});
```

Nos testes mock/Supabase, adicionar estas expectativas depois de preparar fixtures/rows com os cinco casos acima:

```ts
const lojas = await port.listByHub('hub-centro', { delayMs: 0 });
expect(lojas.map(({ id }) => id)).toEqual(expect.arrayContaining(['open', 'closed', 'paused']));
expect(lojas.map(({ id }) => id)).not.toEqual(expect.arrayContaining(['suspended', 'deleted']));

expect(builders.estabelecimentos.eq).toHaveBeenCalledWith('status', 'ativo');
expect(builders.estabelecimentos.is).toHaveBeenCalledWith('excluido_em', null);
expect(builders.estabelecimentos.eq).not.toHaveBeenCalledWith('pausado_manualmente', false);
```

- [ ] **Step 2: Executar testes e confirmar o RED**

Run: `pnpm --filter @keepit/core-data test -- src/ports/store.port.test.ts src/mock/store.mock.test.ts src/supabase/store.supabase.test.ts`

Expected: FAIL porque a projeção/campo não existem e o adapter real ainda exclui pausadas.

- [ ] **Step 3: Implementar projeção, mapeamento e políticas mínimas**

`resolveLojaDisponibilidade` testa primeiro exclusão, depois `status !== 'ativo'`; esses ramos retornam `estado: null`. Somente lojas públicas chamam `deriveLojaEstado`; nelas, `disponivelParaCompra` é `estado === 'aberta'`.

Adicionar `excluido_em` a `ESTABELECIMENTO_COLUMNS`, `EstabelecimentoRow`, mapper e fixtures. Mock filtra pela projeção `visivelAoCliente`; Supabase remove apenas o predicado de pausa de `fetchEstabelecimentosPorIds`.

A migration faz `DROP POLICY`/`CREATE POLICY` para `publico_ve_ativos`, `publico_ve_estab_hubs` e `publico_ve_produtos`. As três políticas públicas exigem pai `status = 'ativo'` e `excluido_em IS NULL`, mas não exigem `pausado_manualmente = false`; produtos continuam exigindo `ativo = true AND excluido_em IS NULL`, e hub continua exigindo `ativo = true`. Ao recriar `publico_ve_ativos`, preservar literalmente o ramo existente `OR dono_user_id = (SELECT auth.uid())`, para que o lojista continue lendo o próprio cadastro em qualquer status. Não tocar nas policies separadas de dono/admin nem nas RPCs de pedido, que preservam o bloqueio server-side.

- [ ] **Step 4: Validar paridade e commit**

Run: `pnpm --filter @keepit/core-data test -- src/ports/store.port.test.ts src/mock/store.mock.test.ts src/supabase/store.supabase.test.ts`

Expected: PASS com a mesma população pública e os três estados temporais nos dois adapters.

Run: `pnpm --filter @keepit/core-data typecheck`

Expected: PASS com `excluido_em` mapeado em todos os construtores tipados.

```bash
git add packages/core-data/src/ports/store.port.ts packages/core-data/src/ports/store.port.test.ts packages/core-data/src/mock/fixtures/estabelecimentos.ts packages/core-data/src/mock/store.mock.ts packages/core-data/src/mock/store.mock.test.ts packages/core-data/src/supabase/store.supabase.ts packages/core-data/src/supabase/store.supabase.test.ts apps/supabase/supabase/migrations/20260905090000_cliente_consulta_lojas_indisponiveis.sql
git commit -m "feat(core-data): expose public unavailable stores safely"
```

### Task 2: Seletores de superfície e resultados com disponibilidade

**Files:**
- Create: `apps/cliente/src/lib/storeDiscovery.ts`
- Create: `apps/cliente/src/lib/storeDiscovery.test.ts`
- Modify: `apps/cliente/src/hooks/useSearchLojas.ts`
- Modify: `apps/cliente/src/hooks/useSearchProdutos.ts`
- Modify: `apps/cliente/src/hooks/useSearchProdutos.test.ts`
- Modify: `apps/cliente/src/screens/home/Home.tsx`
- Modify: `apps/cliente/src/screens/home/Hub.tsx`
- Modify: `apps/cliente/src/components/discovery/StoreCard.tsx`

**Interfaces:**
- Consumes: `resolveLojaDisponibilidade` da Task 1.
- Produces: `LojaComDisponibilidade = { loja: Estabelecimento; disponibilidade: LojaDisponibilidade }`.
- Produces: `selectStoresForSurface(stores, 'purchase' | 'search', now?)`.
- Refines: `useSearchLojas` devolve `LojaComDisponibilidade[]`; `ProdutoComLoja` passa a conter `disponibilidade`.

- [ ] **Step 1: Escrever o RED dos filtros e combinações de consulta**

Criar `storeDiscovery.test.ts`:

```ts
const at = (id: string, status: EstabelecimentoStatus, paused: boolean, close: string, deleted: string | null = null) => ({
  id, status, pausado_manualmente: paused, excluido_em: deleted,
  horarios: [{ dia_semana: NOW.getDay(), aberto: true, hora_abre: '08:00', hora_fecha: close }],
} as Estabelecimento);
const open = at('open', 'ativo', false, '18:00');
const closed = at('closed', 'ativo', false, '10:00');
const paused = at('paused', 'ativo', true, '18:00');
const suspended = at('suspended', 'suspenso', false, '18:00');
const deletedStore = at('deleted', 'ativo', false, '18:00', '2026-09-05T09:00:00.000Z');

it('Home/Hub recebem apenas abertas; busca preserva aberta, fechada e pausada', () => {
  const purchase = selectStoresForSurface([open, closed, paused, suspended, deletedStore], 'purchase', NOW);
  const search = selectStoresForSurface([open, closed, paused, suspended, deletedStore], 'search', NOW);
  expect(purchase.map(({ loja }) => loja.id)).toEqual(['open']);
  expect(search.map(({ loja }) => loja.id)).toEqual(['open', 'closed', 'paused']);
  expect(search.map(({ disponibilidade }) => disponibilidade.estado)).toEqual(['aberta', 'fechada', 'pausada']);
});
```

Em `useSearchProdutos.test.ts`, testar o helper puro extraído do hook:

```ts
const results = joinSearchProducts([
  { loja: closed, products: [{ id: 'p-closed', estabelecimento_id: closed.id, ativo: true }] },
  { loja: paused, products: [{ id: 'p-paused', estabelecimento_id: paused.id, ativo: true }] },
  { loja: suspended, products: [{ id: 'p-hidden', estabelecimento_id: suspended.id, ativo: true }] },
] as StoreProductsInput[], NOW);
expect(results.map(({ produto }) => produto.id)).toEqual(['p-closed', 'p-paused']);
expect(results.map(({ disponibilidade }) => disponibilidade.estado)).toEqual(['fechada', 'pausada']);
```

`StoreProductsInput` e `joinSearchProducts(inputs, now?)` são exportados pelo hook apenas para compor/filtrar os resultados; a chamada assíncrona continua dentro de `useSearchProdutos`.

- [ ] **Step 2: Executar testes e confirmar o RED**

Run: `pnpm --filter @keepit/cliente test -- src/lib/storeDiscovery.test.ts src/hooks/useSearchProdutos.test.ts`

Expected: FAIL no módulo e contratos ausentes.

- [ ] **Step 3: Aplicar o seletor sem duplicar a regra**

Home deriva `lojasDisponiveis = selectStoresForSurface(lojas, 'purchase')` para “Lojas perto do hub” e categorias; Hub faz o mesmo para seus cards. Não aplicar esse filtro à futura coleção separada de favoritos da Story 12.11. Hooks de busca usam `'search'`; produto mantém loja/estado associados para o detalhe posterior. `StoreCard` recebe `disponibilidade` e sempre mostra `LojaEstadoBadge` na busca; em Home/Hub o badge aberto pode ser omitido sem perder informação, pois ali só há lojas compráveis.

Não chamar `store.getState` uma vez por card. A projeção usa os horários já carregados em `Estabelecimento`, mantendo uma única consulta/lista por superfície.

- [ ] **Step 4: Validar filtros e commit**

Run: `pnpm --filter @keepit/cliente test -- src/lib/storeDiscovery.test.ts src/hooks/useSearchProdutos.test.ts`

Expected: PASS para horários, pausa, status administrativos, exclusão e associação de produto/loja.

```bash
git add apps/cliente/src/lib/storeDiscovery.ts apps/cliente/src/lib/storeDiscovery.test.ts apps/cliente/src/hooks/useSearchLojas.ts apps/cliente/src/hooks/useSearchProdutos.ts apps/cliente/src/hooks/useSearchProdutos.test.ts apps/cliente/src/screens/home/Home.tsx apps/cliente/src/screens/home/Hub.tsx apps/cliente/src/components/discovery/StoreCard.tsx
git commit -m "feat(cliente): filter stores by discovery surface"
```

### Task 3: Matriz pura de busca, sugestões e seções sem espaço vazio

**Files:**
- Create: `apps/cliente/src/lib/searchViewState.ts`
- Create: `apps/cliente/src/lib/searchViewState.test.ts`
- Modify: `apps/cliente/src/screens/home/BuscaLoja.tsx`
- Modify: `apps/cliente/src/screens/home/BuscaProduto.tsx`

**Interfaces:**
- Produces: `SearchViewInput = { surface: 'combined' | 'stores'; query: string; category: string; loading: boolean; error: Error | null; stores: LojaComDisponibilidade[]; products: ProdutoComLoja[]; recent: string[]; suggestions: SearchSuggestion[] }`.
- Produces: `SearchViewState = { kind: 'loading' } | { kind: 'error' } | { kind: 'suggestions'; recent: string[]; general: SearchSuggestion[] } | { kind: 'empty'; scope: 'all' | 'stores' | 'category' } | { kind: 'results'; showStores: boolean; showProducts: boolean }`; no ramo de resultados, cada booleano falso registra explicitamente “nenhuma loja”/“nenhum produto” sem montar uma seção vazia.
- Produces: `resolveSearchViewState(input)` e `recordRecentQuery(current, query, limit?)`.
- Produces: `SearchSuggestion = { label: string; category: string }` e `GENERAL_SEARCH_SUGGESTIONS = [{ label: 'Farmácias', category: 'farmacia' }, { label: 'Roupas', category: 'vestuario' }, { label: 'Conveniência', category: 'conveniencia' }]`, identificadas como sugestão, não resultado.

- [ ] **Step 1: Escrever o RED da matriz completa**

Criar testes table-driven:

```ts
const store = { loja: { id: 'store' }, disponibilidade: { estado: 'aberta' } } as LojaComDisponibilidade;
const product = { produto: { id: 'product' }, loja: store.loja, disponibilidade: store.disponibilidade } as ProdutoComLoja;
const baseInput = (override: Partial<SearchViewInput>): SearchViewInput => ({
  surface: 'combined', query: 'x', category: 'todos', loading: false, error: null,
  stores: [], products: [], recent: ['arroz'], suggestions: GENERAL_SEARCH_SUGGESTIONS,
  ...override,
});

it.each([
  [{ loading: true }, { kind: 'loading' }],
  [{ error: new Error('offline') }, { kind: 'error' }],
  [{ query: '', stores: [], products: [] }, { kind: 'suggestions' }],
  [{ query: 'x', category: 'todos', stores: [], products: [] }, { kind: 'empty', scope: 'all' }],
  [{ query: 'x', category: 'farmacia', stores: [], products: [] }, { kind: 'empty', scope: 'category' }],
  [{ surface: 'stores', query: 'x', stores: [], products: [] }, { kind: 'empty', scope: 'stores' }],
  [{ query: 'x', stores: [store], products: [] }, { kind: 'results', showStores: true, showProducts: false }],
  [{ query: 'x', stores: [], products: [product] }, { kind: 'results', showStores: false, showProducts: true }],
])('resolve estado sem sobreposição', (input, expected) => {
  expect(resolveSearchViewState(baseInput(input))).toMatchObject(expected);
});

expect(recordRecentQuery(['arroz', 'leite'], ' LEITE ')).toEqual(['LEITE', 'arroz']);
expect(recordRecentQuery([], '   ')).toEqual([]);
```

Adicionar as expectativas restantes:

```ts
expect(resolveSearchViewState(baseInput({ query: '', recent: ['arroz'] }))).toEqual({
  kind: 'suggestions', recent: ['arroz'], general: GENERAL_SEARCH_SUGGESTIONS,
});
expect(recordRecentQuery(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
```

`recordRecentQuery` faz `trim`, ignora string vazia, remove duplicata sem diferenciar maiúsculas/minúsculas, move o termo novo para o início e aplica `slice(0, limit)` com limite padrão 5. Em busca combinada, `showProducts: false` é o estado explícito de “nenhum produto” e `showStores: false` o de “nenhuma loja”; a tela omite a seção correspondente.

- [ ] **Step 2: Executar o teste e confirmar o RED**

Run: `pnpm --filter @keepit/cliente test -- src/lib/searchViewState.test.ts`

Expected: FAIL porque o resolver ainda não existe.

- [ ] **Step 3: Renderizar exatamente o estado resolvido**

Ambas as telas mantêm `recentQueries` somente em estado de sessão. Ao submeter/tocar resultado, chamam `recordRecentQuery`; com query vazia, renderizam seções “BUSCAS RECENTES” somente se houver itens e “SUGESTÕES” para a constante geral. Loading e erro vencem todos os outros estados.

No ramo `results`, montar título/container de lojas apenas com `showStores`, e produtos apenas com `showProducts`; o booleano falso distingue a seção sem resultado sem reservar espaço. No ramo `empty`, usar copy específica para geral, lojas ou categoria. Chips continuam visíveis, mas nenhuma `View` de seção vazia recebe margem/altura.

- [ ] **Step 4: Validar estados e commit**

Run: `pnpm --filter @keepit/cliente test -- src/lib/searchViewState.test.ts src/lib/storeDiscovery.test.ts src/hooks/useSearchProdutos.test.ts`

Expected: PASS para loading, erro, vazios geral/lojas/categoria, ausência de cada seção, sugestões/recentes e combinações de resultados.

```bash
git add apps/cliente/src/lib/searchViewState.ts apps/cliente/src/lib/searchViewState.test.ts apps/cliente/src/screens/home/BuscaLoja.tsx apps/cliente/src/screens/home/BuscaProduto.tsx
git commit -m "feat(cliente): model complete search presentation states"
```

### Task 4: Catálogo consultável e bloqueio uniforme de compra

**Files:**
- Modify: `apps/cliente/src/components/discovery/LojaEstadoBadge.tsx`
- Modify: `apps/cliente/src/screens/home/Loja.tsx`
- Modify: `apps/cliente/src/screens/home/DetalheProduto.tsx`
- Modify: `apps/cliente/src/screens/home/Checkout.tsx`
- Modify: `apps/cliente/src/lib/checkoutValidation.ts`
- Modify: `apps/cliente/src/lib/checkoutValidation.test.ts`

**Interfaces:**
- Consumes: `LojaDisponibilidade`/`resolveLojaDisponibilidade` da Task 1 e a transação de carrinho da Story 12.9.
- Produces: `canCheckoutStore(loja, now?): boolean`, delegando integralmente à projeção central.
- Produces: catálogo navegável para `fechada`/`pausada`, CTA de adicionar e pagamento bloqueados com motivo textual.

- [ ] **Step 1: Escrever o RED do bloqueio em profundidade**

Adicionar a `checkoutValidation.test.ts`:

```ts
const NOW = new Date(2026, 8, 5, 12, 0);
const checkoutStore = (status: EstabelecimentoStatus, paused: boolean, close: string, deleted: string | null = null) => ({
  status, pausado_manualmente: paused, excluido_em: deleted,
  horarios: [{ dia_semana: NOW.getDay(), aberto: true, hora_abre: '08:00', hora_fecha: close }],
} as Estabelecimento);
const openStore = checkoutStore('ativo', false, '18:00');
const closedStore = checkoutStore('ativo', false, '10:00');
const pausedStore = checkoutStore('ativo', true, '18:00');
const suspendedStore = checkoutStore('suspenso', false, '18:00');
const deletedStore = checkoutStore('ativo', false, '18:00', '2026-09-05T09:00:00.000Z');

it.each([
  [openStore, true],
  [closedStore, false],
  [pausedStore, false],
  [suspendedStore, false],
  [deletedStore, false],
  [null, false],
])('permite checkout somente para loja pública aberta', (store, expected) => {
  expect(canCheckoutStore(store, NOW)).toBe(expected);
});
```

O teste usa os mesmos horários fixos da tabela de verdade, mas chama apenas a API pública do checkout; assim detecta divergência futura entre tela e domínio.

- [ ] **Step 2: Executar teste e confirmar o RED**

Run: `pnpm --filter @keepit/cliente test -- src/lib/checkoutValidation.test.ts`

Expected: FAIL porque `canCheckoutStore` ainda não existe.

- [ ] **Step 3: Manter consulta e bloquear somente ações de compra**

Em `Loja`, remover a consulta separada de `useLojaEstado`, derivar a projeção da `loja` já carregada e retirar `pointerEvents="none"`/opacidade do catálogo: aviso/badge permanecem, e `ProductRow` continua abrindo `DetalheProduto`. Em detalhe, resolver a disponibilidade da loja; mostrar motivo textual e desabilitar “Adicionar ao carrinho” quando não aberta. Em Checkout, `canCheckoutStore` bloqueia no handler e no `disabled`, antes de CPF/pagamento, com mensagem “Esta loja está fechada agora” ou “Esta loja está pausada no momento”.

`LojaEstadoBadge` adiciona `accessibilityRole="text"` e `accessibilityLabel="Loja aberta|fechada|pausada"`; manter cores/tokens existentes e texto visível. Não usar opacidade isoladamente em nenhum card/CTA.

- [ ] **Step 4: Executar gate final e commit**

Run: `pnpm --filter @keepit/core-data test -- src/ports/store.port.test.ts src/mock/store.mock.test.ts src/supabase/store.supabase.test.ts`

Expected: PASS para projeção e paridade de adapters.

Run: `pnpm --filter @keepit/cliente test -- src/lib/storeDiscovery.test.ts src/lib/searchViewState.test.ts src/hooks/useSearchProdutos.test.ts src/lib/checkoutValidation.test.ts`

Expected: PASS para superfícies, matriz de busca e bloqueios.

Run: `pnpm --filter @keepit/core-data typecheck && pnpm --filter @keepit/cliente typecheck`

Expected: PASS sem contratos divergentes.

Não gerar APK nem criar checklist visual nesta story. Badge/contraste, catálogo navegável, teclado, seções condicionais e bloqueios serão exercitados uma única vez no APK Android QA release consolidado da Story 12.14.

```bash
git add apps/cliente/src/components/discovery/LojaEstadoBadge.tsx apps/cliente/src/screens/home/Loja.tsx apps/cliente/src/screens/home/DetalheProduto.tsx apps/cliente/src/screens/home/Checkout.tsx apps/cliente/src/lib/checkoutValidation.ts apps/cliente/src/lib/checkoutValidation.test.ts
git commit -m "feat(cliente): block purchases from unavailable stores"
```
