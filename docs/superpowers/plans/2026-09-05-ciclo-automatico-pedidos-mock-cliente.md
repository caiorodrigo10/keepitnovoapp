# Mock Cliente Automatic Order Cycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer pedidos pagos no mock Cliente avançarem, por agenda persistida e configurável em QA, até `no_hub`, inclusive após reabertura do app.

**Architecture:** Uma máquina pura recebe pedido, âncora persistida, configuração QA e relógio simulado, devolvendo transições vencidas em ordem sem criar timers. O snapshot Cliente sobe para V3 e persiste configuração/âncoras; o adapter mock reconcilia na hidratação e nas leituras já acionadas pelo polling, enquanto o Painel QA configura tempos, relógio, pausa e contingências.

**Tech Stack:** TypeScript 5.9, Vitest 1.2, `@keepit/core-data`, Expo 57, React Native 0.86 e AsyncStorage já instalado.

**Spec:** `docs/superpowers/specs/2026-09-04-estabilizacao-beta-android-cliente-design.md` (§§ 2, 5, 6, 10, 21–23) e `docs/stories/12.7.story.md`

## Global Constraints

- O ciclo pertence exclusivamente ao mock Cliente e não importa, lê ou sincroniza qualquer estado do app/mock Lojista.
- A sequência automática após `confirmarPagamento` é `aguardando_aceite → aceito → em_preparo → saindo_hub → no_hub`; `aguardando_pagamento` continua sob responsabilidade da confirmação de pagamento existente.
- `no_hub` é o último estado automático; `entregue` continua dependendo da retirada/PIN.
- Não adicionar dependência, scheduler, job, timer de background ou intervalo novo; reconciliar por timestamps ao hidratar e ao consultar pedidos.
- Não inventar números para X/Y/Z. Os atrasos por transição são configuração QA persistida; baseline/migração usam `null` e deixam avanço automático pausado até configuração explícita.
- A configuração usa uma única fonte persistida; nenhuma tela duplica valores de duração.
- Relógio regressivo não desfaz status nem move a âncora; reconciliação repetida no mesmo instante é idempotente.
- Reutilizar a adjacência e `OrderTransitionError` existentes; cancelamento, recusa, simulação de falha, pausa e avanço manual permanecem acessíveis somente pelo Painel QA.
- Cada mutação automática persiste antes de concluir a leitura e publica um evento de mudança; falha de persistência segue o modo degradado fail-open já existente.
- Não alterar o adapter Supabase nem criar paridade fictícia para uma automação definida somente para o cenário mock.
- Testes usam relógio falso/`vi.setSystemTime`, sem espera real; os gates são testes focados e typecheck de `core-data`/Cliente.
- O percurso visual, reinício real, pausa/retomada e mudança de status no APK Android QA release pertencem ao único smoke consolidado do Épico 12.

---

### Task 1: Máquina pura e configuração explícita da agenda

**Files:**
- Modify: `packages/core-data/src/ports/demo-scenario.port.ts`
- Create: `packages/core-data/src/mock/order-auto-progress.ts`
- Create: `packages/core-data/src/mock/order-auto-progress.test.ts`

**Interfaces:**
- Produces: `QaOrderProgressionDelaysMs = Record<'aceito' | 'em_preparo' | 'saindo_hub' | 'no_hub', number>` e `QaScenarioState.orderProgressionDelaysMs: QaOrderProgressionDelaysMs | null`.
- Produces: `OrderAutomationRuntime = { enteredStatusAt: string }` e `OrderAutoTransition = { from: PedidoStatus; to: PedidoStatus; occurredAt: string }`.
- Produces: `reconcileAutomaticOrder(pedido, runtime, qa, nowMs?): { pedido: Pedido; runtime: OrderAutomationRuntime | null; transitions: OrderAutoTransition[] }`.

- [ ] **Step 1: Escrever o RED de avanço parcial/total, pausa, terminal, idempotência e rollback**

Criar `order-auto-progress.test.ts` com um pedido em `aguardando_aceite`, âncora `2026-09-05T10:00:00.000Z` e atrasos de teste de 1 segundo por aresta:

```ts
const START_MS = Date.parse('2026-09-05T10:00:00.000Z');
const delays = { aceito: 1_000, em_preparo: 1_000, saindo_hub: 1_000, no_hub: 1_000 };
const at = (offsetMs: number) => START_MS + offsetMs;
const runtime = (): OrderAutomationRuntime => ({ enteredStatusAt: new Date(START_MS).toISOString() });
const pedido = (status: PedidoStatus) => ({
  id: 'pedido-auto', cliente_id: 'cliente-ana', status,
  aceito_em: null, saiu_hub_em: null, lojista_chegou_em: null, tempo_estimado_min: null,
} as Pedido);
const qa = (configured: QaOrderProgressionDelaysMs, enabled = true): QaScenarioState => ({
  clockOffsetMs: 0,
  autoProgressOrders: enabled,
  orderProgressionDelaysMs: configured,
  simulations: { orders: 'normal', stores: 'normal', hubs: 'normal', favorites: 'normal', profile: 'normal', search: 'normal' },
});

it('aplica somente as transições vencidas e preserva os instantes agendados', () => {
  const partial = reconcileAutomaticOrder(pedido('aguardando_aceite'), runtime(), qa(delays), at(2_500));
  expect(partial.pedido.status).toBe('em_preparo');
  expect(partial.transitions.map(({ to }) => to)).toEqual(['aceito', 'em_preparo']);
  expect(partial.runtime).toEqual({ enteredStatusAt: '2026-09-05T10:00:02.000Z' });

  const total = reconcileAutomaticOrder(partial.pedido, partial.runtime!, qa(delays), at(5_000));
  expect(total.transitions.map(({ to }) => to)).toEqual(['saindo_hub', 'no_hub']);
  expect(total.pedido).toMatchObject({
    status: 'no_hub',
    saiu_hub_em: '2026-09-05T10:00:03.000Z',
    lojista_chegou_em: '2026-09-05T10:00:04.000Z',
  });
  expect(total.runtime).toBeNull();
});

it('é no-op pausado, com relógio regressivo, em no_hub ou após reconciliação repetida', () => {
  expect(reconcileAutomaticOrder(pedido('aguardando_aceite'), runtime(), qa(delays, false), at(5_000)).transitions).toEqual([]);
  expect(reconcileAutomaticOrder(pedido('aguardando_aceite'), runtime(), qa(delays), at(-1_000)).transitions).toEqual([]);
  expect(reconcileAutomaticOrder(pedido('no_hub'), runtime(), qa(delays), at(9_000)).transitions).toEqual([]);
});
```

Os helpers constroem somente os campos necessários e nunca importam fixtures do Lojista.

- [ ] **Step 2: Executar o teste e confirmar a falha esperada**

Run: `pnpm --filter @keepit/core-data test -- src/mock/order-auto-progress.test.ts`

Expected: FAIL porque o módulo e o campo de configuração ainda não existem.

- [ ] **Step 3: Implementar a reconciliação determinística**

Definir a adjacência uma vez:

```ts
const AUTO_NEXT_STATUS = {
  aguardando_aceite: 'aceito',
  aceito: 'em_preparo',
  em_preparo: 'saindo_hub',
  saindo_hub: 'no_hub',
} as const;
```

`reconcileAutomaticOrder` clona o pedido, retorna cedo quando `autoProgressOrders` está falso, a configuração é `null`, o status não está no mapa ou `nowMs < enteredStatusAt`. Enquanto `enteredAt + delays[nextStatus] <= nowMs`, aplicar a próxima aresta usando o deadline calculado — não `nowMs` — como nova âncora. Preencher `aceito_em`, `saiu_hub_em` e `lojista_chegou_em` nas respectivas arestas; ao aceitar, derivar `tempo_estimado_min` com `Math.max(1, Math.ceil(somaDosAtrasosRestantes / 60_000))`. Retornar runtime `null` ao chegar em `no_hub`.

- [ ] **Step 4: Validar GREEN e commit**

Run: `pnpm --filter @keepit/core-data test -- src/mock/order-auto-progress.test.ts`

Expected: PASS sem timers reais.

```bash
git add packages/core-data/src/ports/demo-scenario.port.ts packages/core-data/src/mock/order-auto-progress.ts packages/core-data/src/mock/order-auto-progress.test.ts
git commit -m "feat(core-data): define mock order progression"
```

### Task 2: Snapshot V3 e catch-up na hidratação

**Files:**
- Modify: `packages/core-data/src/mock/cliente-state.ts`
- Modify: `packages/core-data/src/mock/cliente-state.test.ts`
- Modify: `packages/core-data/src/mock/cliente-state-store.ts`
- Modify: `packages/core-data/src/mock/cliente-state-store.test.ts`
- Modify: `packages/core-data/src/mock/db.ts`

**Interfaces:**
- Consumes: `OrderAutomationRuntime` e `reconcileAutomaticOrder` da Task 1.
- Produces: `ClienteMockSnapshotV3.orderAutomation: Record<string, OrderAutomationRuntime>` e QA com `orderProgressionDelaysMs`.
- Produces: `MockDb.clienteOrderAutomation` e `MockDb.clienteQaState`, ambos exclusivos do domínio Cliente.

- [ ] **Step 1: Escrever o RED da migração e reabertura vencida**

Adicionar aos testes de snapshot/store:

```ts
it('migra V2 sem inventar agenda nem duração', () => {
  const current = createClienteBaseline();
  const { orderAutomation: _automation, ...withoutAutomation } = current;
  const legacy = {
    ...withoutAutomation,
    schemaVersion: 2,
    qa: { ...current.qa, autoProgressOrders: true, orderProgressionDelaysMs: undefined },
  };
  const decoded = decodeClienteSnapshot(JSON.stringify(legacy));
  expect(decoded).toMatchObject({
    status: 'migrated',
    snapshot: {
      schemaVersion: 3,
      orderAutomation: {},
      qa: { autoProgressOrders: false, orderProgressionDelaysMs: null },
    },
  });
});

it('aplica em ordem as transições vencidas ao reabrir', async () => {
  vi.useFakeTimers();
  vi.setSystemTime('2026-09-05T10:00:05.000Z');
  const snapshot = createClienteBaseline();
  const seeded = structuredClone(createMockDb().pedidos.find((pedido) => pedido.cliente_id === 'cliente-ana')!);
  Object.assign(seeded, { status: 'aguardando_aceite', aceito_em: null, saiu_hub_em: null, lojista_chegou_em: null });
  snapshot.orders = [seeded];
  snapshot.qa = {
    ...snapshot.qa,
    autoProgressOrders: true,
    orderProgressionDelaysMs: { aceito: 1_000, em_preparo: 1_000, saindo_hub: 1_000, no_hub: 1_000 },
  };
  snapshot.orderAutomation = { [seeded.id]: { enteredStatusAt: '2026-09-05T10:00:00.000Z' } };
  const storage = memoryStorage({ initialValue: JSON.stringify(snapshot) });
  const client = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
  await expect(client.order.listMine('cliente-ana', { delayMs: 0 })).resolves.toEqual([
    expect.objectContaining({ status: 'no_hub' }),
  ]);
  await client.demoScenario!.flush();
  expect(JSON.parse(storage.peek(CLIENTE_MOCK_STATE_KEY)!).orderAutomation).toEqual({});
  vi.useRealTimers();
});
```

O teste de store acrescenta casos de pausa, reabertura parcial, segunda hidratação idempotente e relógio menor que a âncora.

- [ ] **Step 2: Executar e confirmar o RED**

Run: `pnpm --filter @keepit/core-data test -- src/mock/cliente-state.test.ts src/mock/cliente-state-store.test.ts`

Expected: FAIL porque schema V3, configuração e metadados de automação ainda não existem.

- [ ] **Step 3: Migrar e validar o snapshot completo**

Subir `CLIENTE_MOCK_SCHEMA_VERSION` para `3`. O decoder aceita V3 completo, migra V2 preservando contas/pedidos/simulações/relógio, acrescenta `orderAutomation: {}` e força `autoProgressOrders: false`/`orderProgressionDelaysMs: null`. O validator exige atrasos finitos e não negativos quando configurados, âncoras ISO válidas e chaves de automação pertencentes a pedidos do snapshot. Baseline V3 usa `{}`/`null`/`false`; reset volta exatamente a esse estado.

- [ ] **Step 4: Aplicar QA/âncoras ao banco e reconciliar antes de concluir `hydrate()`**

`applyClienteSnapshot` copia `qa` e `orderAutomation` para `MockDb`; `captureSnapshot` faz o caminho inverso. `setQaState` atualiza `db.clienteQaState` antes de persistir, para o adapter observar relógio/pausa novos sem reinício. Depois de aplicar o snapshot, `hydrate()` percorre somente os pedidos com âncora, chama `reconcileAutomaticOrder` com `Date.now() + qa.clockOffsetMs`, substitui pedido/runtime e grava um único snapshot quando houver catch-up. Não agendar pedidos legados sem âncora.

- [ ] **Step 5: Validar e commit**

Run: `pnpm --filter @keepit/core-data test -- src/mock/cliente-state.test.ts src/mock/cliente-state-store.test.ts src/mock/order-auto-progress.test.ts`

Expected: PASS para migração, catch-up, pausa, rollback e idempotência.

```bash
git add packages/core-data/src/mock/cliente-state.ts packages/core-data/src/mock/cliente-state.test.ts packages/core-data/src/mock/cliente-state-store.ts packages/core-data/src/mock/cliente-state-store.test.ts packages/core-data/src/mock/db.ts
git commit -m "feat(core-data): persist order progression schedule"
```

### Task 3: Adapter mock, persistência e notificação por transição

**Files:**
- Modify: `packages/core-data/src/ports/order.port.ts`
- Modify: `packages/core-data/src/mock/db.ts`
- Modify: `packages/core-data/src/mock/order.mock.ts`
- Modify: `packages/core-data/src/mock/order.mock.test.ts`
- Modify: `packages/core-data/src/mock/cliente-state-store.ts`

**Interfaces:**
- Produces: `OrderChangeEvent = { clienteId: string; pedidoId?: string; reason: 'mutation' | 'auto-progress' | 'reset' }`.
- Adds: `OrderPort.subscribeChanges?(listener: (event: OrderChangeEvent) => void): () => void`; opcional porque a automação é mock-only e o polling continua sendo fallback comum.
- Consumes: `MockDb.clienteQaState`, `MockDb.clienteOrderAutomation` e máquina da Task 1.

- [ ] **Step 1: Escrever RED de início após pagamento, eventos e parada em `no_hub`**

Adicionar a `order.mock.test.ts` um cenário com relógio falso e configuração injetada no `db`:

```ts
it('agenda após pagamento, reconcilia leituras e emite cada transição uma vez', async () => {
  vi.useFakeTimers();
  vi.setSystemTime('2026-09-05T10:00:00.000Z');
  db.clienteQaState = qaComAtrasosDeUmSegundo();
  const event = vi.fn();
  port.subscribeChanges!(event);
  const created = await port.create(validInput, { delayMs: 0 });
  await port.confirmarPagamento(created.id, { delayMs: 0 });

  vi.setSystemTime('2026-09-05T10:00:05.000Z');
  const [current] = await port.listMine('cliente-ana', { delayMs: 0 });
  expect(current.status).toBe('no_hub');
  expect(event.mock.calls.filter(([value]) => value.reason === 'auto-progress')).toHaveLength(4);

  await port.listMine('cliente-ana', { delayMs: 0 });
  expect(event.mock.calls.filter(([value]) => value.reason === 'auto-progress')).toHaveLength(4);
  vi.useRealTimers();
});
```

Antes do teste, extrair o `CreatePedidoInput` literal já usado no primeiro caso feliz do arquivo para `const validInput: CreatePedidoInput`, sem alterar seus valores. Definir `qaComAtrasosDeUmSegundo()` retornando `createDefaultQaScenarioState()` com `autoProgressOrders: true` e os quatro atrasos em `1_000`. Adicionar casos que provam: `create` sozinho permanece em `aguardando_pagamento`; configuração `null`/pausa não avança; cancelamento/recusa/entrega removem âncora; nenhum status posterior a `no_hub` é produzido.

- [ ] **Step 2: Executar e confirmar o RED**

Run: `pnpm --filter @keepit/core-data test -- src/mock/order.mock.test.ts`

Expected: FAIL porque pagamento não cria âncora, leituras não reconciliam e a port não assina eventos.

- [ ] **Step 3: Conectar o adapter à máquina existente**

Em `confirmarPagamento`, após a transição atual, criar âncora somente quando a configuração estiver completa, usando `{ enteredStatusAt: new Date(Date.now() + db.clienteQaState.clockOffsetMs).toISOString() }`. Antes de devolver `listMine`/`getById`, reconciliar os pedidos elegíveis; para cada `OrderAutoTransition`, substituir o pedido/runtime, aguardar `db.onClienteMutation()` e emitir `auto-progress`. Toda mutação mock bem-sucedida emite uma vez `reason: 'mutation'`; mutações manuais legais reancoram no relógio simulado quando configurado, e estados terminais removem runtime. `subscribeChanges` adiciona/remove listeners de um `Set` mantido pelo `MockDb`; `ClienteMockStateStore.reset()` emite `reset` para contas removidas.

- [ ] **Step 4: Validar adapter, persistência e typecheck**

Run: `pnpm --filter @keepit/core-data test -- src/mock/order.mock.test.ts src/mock/cliente-state-store.test.ts src/mock/order-auto-progress.test.ts`

Expected: PASS sem espera real e sem tocar fixtures Lojista.

Run: `pnpm --filter @keepit/core-data typecheck`

Expected: PASS; o método opcional não exige alteração no adapter Supabase.

- [ ] **Step 5: Commit**

```bash
git add packages/core-data/src/ports/order.port.ts packages/core-data/src/mock/db.ts packages/core-data/src/mock/order.mock.ts packages/core-data/src/mock/order.mock.test.ts packages/core-data/src/mock/cliente-state-store.ts
git commit -m "feat(core-data): reconcile mock order progression"
```

### Task 4: Configuração, pausa, relógio e contingência no Painel QA

**Files:**
- Modify: `apps/cliente/src/context/QaScenarioContext.tsx`
- Create: `apps/cliente/src/lib/qaOrderProgression.ts`
- Create: `apps/cliente/src/lib/qaOrderProgression.test.ts`
- Modify: `apps/cliente/src/lib/qaOrderActions.ts`
- Modify: `apps/cliente/src/lib/qaOrderActions.test.ts`
- Modify: `apps/cliente/src/lib/qaSimulation.test.ts`
- Modify: `apps/cliente/src/screens/perfil/PainelQA.tsx`

**Interfaces:**
- Produces: `parseQaOrderProgression(values): { status: 'valid'; delays: QaOrderProgressionDelaysMs } | { status: 'invalid'; message: string }`.
- Adds to context: `configureOrderProgression(delays, enabled)` e `advanceClockBy(offsetMs)`; ambos persistem por `DemoScenarioPort.setQaState`.
- Adds: `runQaOrderOutcome(client, pedido, outcome: 'cancel' | 'refuse')` usando `OrderPort.cancel/refuse`; simulação `orders:error` continua sendo a contingência de falha.

- [ ] **Step 1: Escrever RED de parsing e contingências permitidas**

```ts
expect(parseQaOrderProgression({ aceito: '5', em_preparo: '10', saindo_hub: '15', no_hub: '20' })).toEqual({
  status: 'valid',
  delays: { aceito: 5_000, em_preparo: 10_000, saindo_hub: 15_000, no_hub: 20_000 },
});
expect(parseQaOrderProgression({ aceito: '', em_preparo: '10', saindo_hub: '15', no_hub: '20' })).toEqual({
  status: 'invalid', message: 'Informe todos os tempos em segundos.'
});
```

Em `qaOrderActions.test.ts`, provar que `refuse` só chama `order.refuse` em `aguardando_aceite`, `cancel` usa `order.cancel` antes de `saindo_hub` e nenhum outcome contorna a máquina em `no_hub`/terminal.

- [ ] **Step 2: Implementar helpers e mutações do provider**

O parser aceita quatro inteiros não negativos, converte segundos para milissegundos e nunca fornece fallback. `configureOrderProgression` grava delays e `autoProgressOrders`; habilitar com config `null` rejeita em memória. `advanceClockBy` soma milissegundos positivos ao offset atual e preserva os demais campos/simulações. `copyQaState` clona também o objeto de delays. Acrescentar `orderProgressionDelaysMs: null` ao `normalState` de `qaSimulation.test.ts` para manter o fixture tipado no schema V3.

- [ ] **Step 3: Expor somente no Painel QA**

Adicionar quatro `TextField keyboardType="number-pad"`, botão `Salvar e ativar`, botão `Pausar avanço automático`, campo de minutos e botão `Avançar relógio`. Após salvar, pausar ou avançar relógio, chamar `refreshPedidos()` para reconciliar/publicar imediatamente. Manter o gate/rota QA existentes, o single-flight `busy` e notices de degradação. Nos cards de pedido, conservar avanço manual/entrega por PIN e mostrar `Recusar`/`Cancelar` apenas quando `runQaOrderOutcome` aceitar o status; a simulação existente `Pedidos → Erro` cobre falha sem mutar dados.

- [ ] **Step 4: Executar gates finais e commit**

Run: `pnpm --filter @keepit/cliente test -- src/lib/qaOrderProgression.test.ts src/lib/qaOrderActions.test.ts src/lib/qaSimulation.test.ts`

Expected: PASS para parsing, pausa/relógio e contingências.

Run: `pnpm --filter @keepit/core-data typecheck && pnpm --filter @keepit/cliente typecheck`

Expected: PASS sem dependências novas.

```bash
git add apps/cliente/src/context/QaScenarioContext.tsx apps/cliente/src/lib/qaOrderProgression.ts apps/cliente/src/lib/qaOrderProgression.test.ts apps/cliente/src/lib/qaOrderActions.ts apps/cliente/src/lib/qaOrderActions.test.ts apps/cliente/src/lib/qaSimulation.test.ts apps/cliente/src/screens/perfil/PainelQA.tsx
git commit -m "feat(cliente): configure mock order progression"
```
