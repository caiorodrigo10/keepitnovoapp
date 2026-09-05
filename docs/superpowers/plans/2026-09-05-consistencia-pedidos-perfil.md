# Orders and Profile Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer Perfil, Meus Pedidos e detalhes observarem a mesma coleção por cliente, com contador/abas derivados e atualização após qualquer mutação relevante.

**Architecture:** Um recurso externo pequeno, indexado por `clienteId`, deduplica `listMine`, armazena snapshots imutáveis e notifica React via `useSyncExternalStore`; o polling existente apenas invalida esse recurso. Classificação, estado visual simulado e destino de navegação ficam em funções puras, enquanto criação/confirmação/reset acionam a mesma invalidação usada pelas telas mutadoras.

**Tech Stack:** React 19 (`useSyncExternalStore`), React Native 0.86, TypeScript 5.9, Vitest 1.2, React Navigation 7 e `@keepit/core-data`.

**Spec:** `docs/superpowers/specs/2026-09-04-estabilizacao-beta-android-cliente-design.md` (§§ 2, 10, 11, 21–23) e `docs/stories/12.8.story.md`

## Global Constraints

- Perfil, Meus Pedidos, Painel QA e detalhes usam uma única instância de coleção por `clienteId`; nenhuma tela mantém cópia própria nem chama `useOrders` em paralelo.
- O contador do Perfil é sempre `emAndamento.length + concluidos.length`; não persistir, incrementar ou decrementar contador.
- `aguardando_pagamento`, `aguardando_aceite`, `aceito`, `em_preparo`, `saindo_hub` e `no_hub` ficam em “Em andamento”; os nove demais estados do contrato ficam em “Concluídos”.
- Criação, confirmação, transição, cancelamento, entrega e reset invalidam a coleção compartilhada; polling/AppState existentes continuam fallback para mudanças externas.
- Não adicionar TanStack Query, EventEmitter, renderer React Native ou qualquer dependência; usar React/core APIs já instaladas.
- Simulações QA transformam somente o estado apresentado (`loading`/`empty`/`error`), nunca escrevem ou substituem o snapshot canônico.
- Loading, erro, vazio e conteúdo são mutuamente exclusivos; a faixa global existente identifica simulação ativa.
- Preservar copy, tabs, cards, rotas, design e params atuais; não redesenhar Perfil ou Meus Pedidos.
- Testes de integração exercitam o resource puro; navegação é coberta por resolver puro porque o Vitest Cliente roda em `node` e não possui renderer React Native.
- Os gates são testes direcionados e typecheck; criação→abas→Perfil→detalhe→reset no APK Android QA release pertence ao único smoke consolidado do Épico 12.

---

### Task 1: Recurso compartilhado e invalidável de pedidos

**Files:**
- Create: `apps/cliente/src/lib/ordersResource.ts`
- Create: `apps/cliente/src/lib/ordersResource.test.ts`

**Interfaces:**
- Produces: `OrdersSnapshot = { data: Pedido[]; loading: boolean; error: Error | null }`.
- Produces: `createOrdersResource(fetchMine, subscribeChanges?)` com `getSnapshot(clienteId)`, `subscribe(clienteId, listener)`, `load(clienteId)`, `invalidate(clienteId?)` e `clear(clienteId?)`.
- Produces: `getOrdersResource()` lazy, `invalidatePedidos(clienteId?)` e `clearPedidosResource(clienteId?)` ligados a `getDataClient().order.listMine/subscribeChanges`.

- [ ] **Step 1: Escrever o RED de deduplicação, publicação e invalidação**

Criar `ordersResource.test.ts`:

```ts
const pedido = (status: PedidoStatus): Pedido => ({ id: `pedido-${status}`, cliente_id: 'cliente-ana', status } as Pedido);

it('compartilha uma leitura e publica o mesmo snapshot a todos os consumidores', async () => {
  const fetchMine = vi.fn().mockResolvedValue([pedido('aceito')]);
  const resource = createOrdersResource(fetchMine);
  const first = vi.fn();
  const second = vi.fn();
  resource.subscribe('cliente-ana', first);
  resource.subscribe('cliente-ana', second);

  await Promise.all([resource.load('cliente-ana'), resource.load('cliente-ana')]);

  expect(fetchMine).toHaveBeenCalledTimes(1);
  expect(resource.getSnapshot('cliente-ana')).toMatchObject({ loading: false, error: null });
  expect(first).toHaveBeenCalled();
  expect(second).toHaveBeenCalled();
});

it('invalida após mudança e ignora resposta antiga que chega fora de ordem', async () => {
  let resolveFirst!: (orders: Pedido[]) => void;
  let resolveSecond!: (orders: Pedido[]) => void;
  const fetchMine = vi.fn()
    .mockReturnValueOnce(new Promise<Pedido[]>((resolve) => { resolveFirst = resolve; }))
    .mockReturnValueOnce(new Promise<Pedido[]>((resolve) => { resolveSecond = resolve; }));
  const resource = createOrdersResource(fetchMine);
  const firstLoad = resource.load('cliente-ana');
  const secondLoad = resource.invalidate('cliente-ana');
  resolveSecond([pedido('em_preparo')]);
  await secondLoad;
  resolveFirst([pedido('aceito')]);
  await firstLoad;
  expect(resource.getSnapshot('cliente-ana').data[0]?.status).toBe('em_preparo');
});
```

Adicionar casos de erro explícito, `clear()` retornando snapshot vazio e evento da `subscribeChanges` da Story 12.7 invalidando somente o `clienteId` informado.

- [ ] **Step 2: Executar o teste e confirmar o RED**

Run: `pnpm --filter @keepit/cliente test -- src/lib/ordersResource.test.ts`

Expected: FAIL porque o resource ainda não existe.

- [ ] **Step 3: Implementar store sem React e snapshots estáveis**

Manter mapas privados de snapshot, listeners, promise em voo e geração por cliente. `load` devolve a promise existente quando a geração é igual; `invalidate` incrementa geração e força nova leitura; somente a geração mais recente pode publicar. `subscribe` devolve cleanup, e cada publicação substitui o objeto/array por cópia nova. `clear` publica `{ data: [], loading: false, error: null }`; evento `OrderChangeEvent` chama `invalidate(event.clienteId)`.

Instanciar somente no primeiro uso, depois que o bootstrap já configurou o `DataClient` persistente:

```ts
let sharedOrdersResource: OrdersResource | null = null;

export function getOrdersResource(): OrdersResource {
  if (!sharedOrdersResource) {
    const order = getDataClient().order;
    sharedOrdersResource = createOrdersResource(
      (clienteId) => order.listMine(clienteId),
      order.subscribeChanges?.bind(order),
    );
  }
  return sharedOrdersResource;
}

export const invalidatePedidos = (clienteId?: string) => getOrdersResource().invalidate(clienteId);
export const clearPedidosResource = (clienteId?: string) => getOrdersResource().clear(clienteId);
```

- [ ] **Step 4: Validar GREEN e commit**

Run: `pnpm --filter @keepit/cliente test -- src/lib/ordersResource.test.ts`

Expected: PASS para leitura única, corrida, erro, evento e reset.

```bash
git add apps/cliente/src/lib/ordersResource.ts apps/cliente/src/lib/ordersResource.test.ts
git commit -m "feat(cliente): add shared orders resource"
```

### Task 2: Invariante, estados simulados e navegação puros

**Files:**
- Modify: `apps/cliente/src/lib/pedidoStatus.ts`
- Modify: `apps/cliente/src/lib/pedidoStatus.test.ts`
- Create: `apps/cliente/src/lib/ordersViewState.ts`
- Create: `apps/cliente/src/lib/ordersViewState.test.ts`
- Create: `apps/cliente/src/lib/pedidoNavigation.ts`
- Create: `apps/cliente/src/lib/pedidoNavigation.test.ts`

**Interfaces:**
- Produces: `partitionPedidos(pedidos): { emAndamento: Pedido[]; concluidos: Pedido[]; total: number }`.
- Produces: `resolveOrdersViewState(snapshot, simulation): { kind: 'loading' | 'error' | 'empty' } | { kind: 'content'; pedidos: Pedido[] }`.
- Produces: `getPedidoNavigationTarget(pedido): { navigator: 'root'; route: 'ModalConfirmarPin'; params: { pedidoId: string } } | { navigator: 'pedidos'; route: 'Recibo'; params: { pedidoId: string } }`.

- [ ] **Step 1: Escrever o RED da invariante para todos os status**

Adicionar a `pedidoStatus.test.ts`:

```ts
it('mantém total = Em andamento + Concluídos para os 15 status', () => {
  const pedidos = TODOS_OS_STATUS.map((status, index) => ({ id: String(index), status }) as Pedido);
  const result = partitionPedidos(pedidos);
  expect(result.total).toBe(15);
  expect(result.total).toBe(result.emAndamento.length + result.concluidos.length);
  expect(result.emAndamento.map(({ status }) => status)).toEqual([
    'aguardando_pagamento', 'aguardando_aceite', 'aceito', 'em_preparo', 'saindo_hub', 'no_hub',
  ]);
});
```

- [ ] **Step 2: Escrever RED dos quatro estados sem contaminar dados e dos destinos**

Em `ordersViewState.test.ts` e `pedidoNavigation.test.ts`, declarar localmente:

```ts
const pedido = (status: PedidoStatus): Pedido => ({
  id: `pedido-${status}`,
  cliente_id: 'cliente-ana',
  status,
} as Pedido);
```

Então cobrir estados e destinos:

```ts
const canonical = { data: [pedido('aceito')], loading: false, error: null };
expect(resolveOrdersViewState(canonical, 'normal')).toMatchObject({ kind: 'content' });
expect(resolveOrdersViewState(canonical, 'loading')).toEqual({ kind: 'loading' });
expect(resolveOrdersViewState(canonical, 'empty')).toEqual({ kind: 'empty' });
expect(resolveOrdersViewState(canonical, 'error')).toEqual({ kind: 'error' });
expect(canonical.data).toHaveLength(1);

expect(getPedidoNavigationTarget(pedido('no_hub'))).toMatchObject({ navigator: 'root', route: 'ModalConfirmarPin' });
expect(getPedidoNavigationTarget(pedido('entregue'))).toMatchObject({ navigator: 'pedidos', route: 'Recibo' });
expect(getPedidoNavigationTarget(pedido('recusado'))).toMatchObject({ navigator: 'pedidos', route: 'Recibo' });
```

- [ ] **Step 3: Implementar derivações mínimas**

`partitionPedidos` filtra uma única entrada com `isPedidoEmAndamento/isPedidoConcluido` e calcula `total` pela soma dos dois arrays. `resolveOrdersViewState` prioriza simulação `loading/error/empty`, depois snapshot `loading/error`, depois array vazio e por fim conteúdo; nunca muta `snapshot`. `getPedidoNavigationTarget` usa apenas `isPedidoConcluido` e preserva os params atuais.

- [ ] **Step 4: Rodar testes e commit**

Run: `pnpm --filter @keepit/cliente test -- src/lib/pedidoStatus.test.ts src/lib/ordersViewState.test.ts src/lib/pedidoNavigation.test.ts`

Expected: PASS para enum completo, invariante, estados e navegação.

```bash
git add apps/cliente/src/lib/pedidoStatus.ts apps/cliente/src/lib/pedidoStatus.test.ts apps/cliente/src/lib/ordersViewState.ts apps/cliente/src/lib/ordersViewState.test.ts apps/cliente/src/lib/pedidoNavigation.ts apps/cliente/src/lib/pedidoNavigation.test.ts
git commit -m "refactor(cliente): centralize order derivations"
```

### Task 3: Um hook, todos os consumidores e mutações

**Files:**
- Modify: `apps/cliente/src/hooks/usePedidosMine.ts`
- Modify: `apps/cliente/src/hooks/usePedidoDetail.ts`
- Modify: `apps/cliente/src/screens/pedidos/MeusPedidos.tsx`
- Modify: `apps/cliente/src/screens/perfil/Perfil.tsx`
- Modify: `apps/cliente/src/screens/home/Pagamento.tsx`
- Modify: `apps/cliente/src/hooks/usePagamentoSimulado.ts`
- Modify: `apps/cliente/src/lib/resetDemoScenario.ts`
- Modify: `apps/cliente/src/lib/resetDemoScenario.test.ts`
- Modify: `apps/cliente/src/screens/perfil/PainelQA.tsx`

**Interfaces:**
- Consumes: `getOrdersResource`, `partitionPedidos`, `resolveOrdersViewState` e `getPedidoNavigationTarget` das Tasks 1/2.
- Produces: `usePedidosMine(clienteId: string | null): OrdersSnapshot & { refresh(): void }`, sem `AsyncCallOptions` de simulação.
- Maintains: `usePedidoDetail` deriva do mesmo snapshot e `refresh` agora invalida todos os consumidores daquele cliente.

- [ ] **Step 1: Ligar `usePedidosMine` ao resource e preservar polling/AppState**

Usar `useSyncExternalStore` com snapshot estável e disparar `load` ao montar/trocar cliente:

```ts
const EMPTY_ORDERS_SNAPSHOT: OrdersSnapshot = { data: [], loading: false, error: null };
const resource = getOrdersResource();
const subscribe = useCallback(
  (listener: () => void) => clienteId ? resource.subscribe(clienteId, listener) : () => undefined,
  [clienteId, resource],
);
const getSnapshot = useCallback(
  () => clienteId ? resource.getSnapshot(clienteId) : EMPTY_ORDERS_SNAPSHOT,
  [clienteId, resource],
);
const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
useEffect(() => {
  if (clienteId) void resource.load(clienteId);
}, [clienteId, resource]);
const refresh = useCallback(() => {
  if (clienteId) void invalidatePedidos(clienteId);
}, [clienteId]);
```

Manter `startPedidoPolling`, mas seu callback chama `invalidatePedidos(clienteId)`; remover `AsyncCallOptions` da assinatura para impedir que `forceEmpty/forceError` entrem na coleção canônica. `usePedidoDetail` remove o terceiro parâmetro e conserva busca por ID/fallback mais recente.

- [ ] **Step 2: Migrar Perfil e Meus Pedidos para as derivações únicas**

Em `Perfil`, substituir `useOrders` por `usePedidosMine(cliente?.id ?? null)` e derivar:

```ts
const orderSummary = partitionPedidos(pedidos);
// card existente
<Text style={styles.statValue}>{pedidosError ? '—' : orderSummary.total}</Text>
```

Em `MeusPedidos`, chamar o hook sem options e resolver a apresentação:

```ts
const resourceState = usePedidosMine(cliente?.id ?? null);
const viewState = resolveOrdersViewState(resourceState, ordersSimulation);
const summary = partitionPedidos(viewState.kind === 'content' ? viewState.pedidos : []);
const listaAtual = tab === 'andamento' ? summary.emAndamento : summary.concluidos;
```

Usar `getPedidoNavigationTarget` para escolher `rootNavigation`/`navigation`. Loading, erro, vazio da tab e conteúdo permanecem visualmente iguais; `SimulatedStateBanner` global continua identificando a simulação.

- [ ] **Step 3: Invalidar criação, pagamento e reset pela mesma API**

Após `order.create` em `Pagamento`, chamar `void invalidatePedidos(cliente.id)` antes de navegar. Em `usePagamentoSimulado`, envolver a confirmação:

```ts
confirmarPagamento: async () => {
  const pedido = await getDataClient().order.confirmarPagamento(pedidoId);
  await invalidatePedidos(pedido.cliente_id);
  return pedido;
},
```

Estender `ResetDemoScenarioOptions` com `clearOrders?: () => void`; após `demoScenario.reset()` chamar `options.clearOrders?.()` e, no Painel QA, passar `clearOrders: clearPedidosResource`. Atualizar o teste de reset para provar que nada limpa antes da confirmação e que a coleção é limpa após o reset. Cancelar/Chegar/Não veio/atraso e avanço QA já chamam `refresh`; como ele agora é global, não exigem edição adicional.

- [ ] **Step 4: Executar integração focada e typecheck**

Run: `pnpm --filter @keepit/cliente test -- src/lib/ordersResource.test.ts src/lib/pedidoStatus.test.ts src/lib/ordersViewState.test.ts src/lib/pedidoNavigation.test.ts src/lib/resetDemoScenario.test.ts`

Expected: PASS para compartilhamento, invariante, navegação, simulação e reset.

Run: `pnpm --filter @keepit/core-data typecheck && pnpm --filter @keepit/cliente typecheck`

Expected: PASS sem uso restante de `useOrders` no Perfil nem options simuladas em `usePedidosMine`.

- [ ] **Step 5: Commit**

```bash
git add apps/cliente/src/hooks/usePedidosMine.ts apps/cliente/src/hooks/usePedidoDetail.ts apps/cliente/src/screens/pedidos/MeusPedidos.tsx apps/cliente/src/screens/perfil/Perfil.tsx apps/cliente/src/screens/home/Pagamento.tsx apps/cliente/src/hooks/usePagamentoSimulado.ts apps/cliente/src/lib/resetDemoScenario.ts apps/cliente/src/lib/resetDemoScenario.test.ts apps/cliente/src/screens/perfil/PainelQA.tsx
git commit -m "feat(cliente): share order state across screens"
```
