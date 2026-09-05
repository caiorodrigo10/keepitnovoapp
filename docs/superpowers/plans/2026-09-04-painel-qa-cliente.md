# Painel QA Cliente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um Painel QA mínimo do app Cliente, acessível somente por sete toques em builds QA, com identificação do artefato, simulações centralizadas já suportadas, avanço manual de pedidos e reset real do cenário/carrinho.

**Architecture:** O snapshot mock existente sobe para schema V2 e passa a persistir simulações por domínio por meio da `DemoScenarioPort`. Um provider React fino lê essa port, alimenta as telas e a faixa global; a rota do painel é registrada por um helper puro somente quando `EXPO_PUBLIC_QA_ENABLED=true`. Os metadados usam diretamente `app.json` e variáveis `EXPO_PUBLIC_*`, com fallbacks honestos para desenvolvimento e validação de valores reais no checklist do APK.

**Tech Stack:** Expo 57, React Native 0.86, React Navigation 7, TypeScript 5.9, Vitest 1.2, EAS Build, AsyncStorage e `@keepit/core-data`.

**Spec:** `docs/superpowers/specs/2026-09-04-estabilizacao-beta-android-cliente-design.md` (Story: `docs/stories/12.2.story.md`)

## Global Constraints

- Escopo somente do app Cliente e somente de builds autorizados para QA; não alterar o app Lojista.
- Produção não registra `PainelQA`, não monta provider/faixa QA e não responde aos sete toques.
- O acesso usa exatamente sete toques na linha de versão do Perfil, sem senha fixa embarcada.
- Perfil e painel exibem versão, `versionCode`, commit SHA, datasource, ambiente e data do build.
- Metadados vêm de `app.json` + `EXPO_PUBLIC_COMMIT_SHA`, `EXPO_PUBLIC_BUILD_DATE`, `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_QA_ENABLED` e `EXPO_PUBLIC_DATA_SOURCE`; desenvolvimento pode mostrar `local`/`unknown`.
- Não criar script gerador de metadados, hook EAS customizado, `.gitignore`, dependência, renderer React Native ou arquitetura genérica.
- Preservar cores, tipografia, espaçamentos e componentes atuais; não fazer redesign ou rebranding.
- Telas e hooks continuam consumindo contratos de `@keepit/core-data`; a UI não importa store ou fixtures mock.
- Reutilizar o snapshot persistente com migração explícita V1 → V2.
- A faixa global usa exatamente `Estado simulado ativo` quando um domínio funcional está em `loading`, `empty` ou `error`.
- Reset exige confirmação, restaura o baseline, normaliza simulações, remove carrinho persistido, limpa `CartContext` vivo e distingue sucesso de degradação.
- O painel inclui somente capacidades funcionais nesta fatia: conta atual, reset, simulações de Pedidos/Lojas/Hubs/Perfil/Busca e avanço manual de pedido por operações já existentes.
- Omitir Favoritos, relógio, pausa automática, callback de senha e prazo/restauração de exclusão do painel; não antecipar Stories 12.7, 12.11, 12.12 ou 12.13.
- Testes automatizados focam validators, persistência, helpers de metadados/simulação/acesso e avanço de pedido; telas recebem typecheck e smoke, sem teste por tela.
- Validar visual e navegação em um APK Android QA release; não gerar um segundo APK local de produção.

---

### Task 1: Fechar validators residuais e expor o estado QA persistente

**Files:**
- Modify: `packages/core-data/src/ports/demo-scenario.port.ts`
- Modify: `packages/core-data/src/mock/cliente-state.ts`
- Modify: `packages/core-data/src/mock/cliente-state-store.ts`
- Modify: `packages/core-data/src/index.ts`
- Test: `packages/core-data/src/mock/cliente-state.test.ts`
- Test: `packages/core-data/src/mock/cliente-state-store.test.ts`

**Interfaces:**
- Consumes: `ClienteMockSnapshotV1`, `DemoScenarioPort`, `ClienteMockStateStore` e `createClienteBaseline()` da Story 12.1.
- Produces: snapshot V2; `QaSimulationDomain`, `QaSimulationState`, `QaScenarioState`; `DemoScenarioMutationResult`; `getQaState()` e `setQaState()`.

- [ ] **Step 1: Escrever testes RED dos validators residuais da Story 12.1**

Adicionar a `cliente-state.test.ts` os casos mínimos abaixo:

```ts
it.each(['cliente-bruno', 'cliente-carla', 'cliente-diego'])(
  'rejeita o ID auxiliar real %s no snapshot Cliente',
  (reservedId) => {
    const snapshot = createClienteBaseline();
    snapshot.accounts[0]!.id = reservedId;
    snapshot.accounts[0]!.profile.id = reservedId;
    expect(parseClienteSnapshot(JSON.stringify(snapshot))).toEqual(createClienteBaseline());
  },
);

it('rejeita snapshot sem a conta demo cliente-ana', () => {
  const snapshot = createClienteBaseline();
  snapshot.accounts = [];
  expect(parseClienteSnapshot(JSON.stringify(snapshot))).toEqual(createClienteBaseline());
});
```

Manter o caso de account ID duplicado existente e acrescentar, no mesmo `it.each`, três mutadores: e-mail duplicado após `trim().toLowerCase()`, dois pedidos com o mesmo `id` e dois itens com o mesmo `id` global. Para o segundo pedido, alterar `pedido.id` e todos os seus `item.pedido_id`, deixando duplicado somente o `item.id` que o caso pretende provar.

- [ ] **Step 2: Rodar os validators e confirmar falha**

Run: `pnpm --filter @keepit/core-data test -- src/mock/cliente-state.test.ts`

Expected: FAIL porque IDs auxiliares, ausência da conta demo e as três novas duplicidades ainda são aceitos.

- [ ] **Step 3: Implementar as invariantes de identidade em um único guard**

Em `cliente-state.ts`:

```ts
const RESERVED_AUXILIARY_CLIENTE_IDS = new Set(['cliente-bruno', 'cliente-carla', 'cliente-diego']);

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

const accountIds = snapshot.accounts.map((account) => account.id);
const accountEmails = snapshot.accounts.map((account) => account.email.trim().toLowerCase());
const orderIds = snapshot.orders.map((order) => order.id);
const itemIds = snapshot.orders.flatMap((order) => order.itens.map((item) => item.id));
```

Exigir `accountIds.includes('cliente-ana')`, rejeitar prefixo `lj-cliente-` e os três IDs reservados, aplicar `hasUniqueValues` às quatro coleções e preservar as invariantes já existentes de sessão, dono do pedido e `item.pedido_id`.

- [ ] **Step 4: Escrever o teste RED da migração e do estado QA**

Definir seis domínios fechados: `orders`, `stores`, `hubs`, `favorites`, `profile`, `search`; somente cinco serão expostos na UI desta story.

```ts
it('migra V1 para V2 preservando dados e normalizando simulações', () => {
  const current = createClienteBaseline();
  const legacy = {
    ...current,
    schemaVersion: 1,
    sessionClienteId: 'cliente-ana',
    qa: { clockOffsetMs: 3_600_000, autoProgressOrders: false },
  };

  expect(parseClienteSnapshot(JSON.stringify(legacy))).toMatchObject({
    schemaVersion: 2,
    sessionClienteId: 'cliente-ana',
    qa: {
      clockOffsetMs: 3_600_000,
      autoProgressOrders: false,
      simulations: {
        orders: 'normal', stores: 'normal', hubs: 'normal',
        favorites: 'normal', profile: 'normal', search: 'normal',
      },
    },
  });
});
```

- [ ] **Step 5: Definir tipos na port e migrar o snapshot para V2**

Em `demo-scenario.port.ts`:

```ts
export const QA_SIMULATION_DOMAINS = ['orders', 'stores', 'hubs', 'favorites', 'profile', 'search'] as const;
export type QaSimulationDomain = (typeof QA_SIMULATION_DOMAINS)[number];
export type QaSimulationState = 'normal' | 'loading' | 'empty' | 'error';

export interface QaScenarioState {
  clockOffsetMs: number;
  autoProgressOrders: boolean;
  simulations: Record<QaSimulationDomain, QaSimulationState>;
}

export type DemoScenarioMutationResult = { status: 'updated' } | { status: 'degraded' };
```

Adicionar à port:

```ts
getQaState(): QaScenarioState;
setQaState(next: QaScenarioState): Promise<DemoScenarioMutationResult>;
```

Em `cliente-state.ts`, mudar `CLIENTE_MOCK_SCHEMA_VERSION` para `2`, criar `ClienteMockSnapshotV2` e `createDefaultQaScenarioState()`. Manter um shape V1 privado para o decoder. A ordem do decode é: V2 válido → V1 válido migrado → baseline V2. O migrador copia todos os dados e acrescenta somente `simulations`; o reset usa `createDefaultQaScenarioState()`.

- [ ] **Step 6: Escrever teste RED da port persistida e degradação**

Em `cliente-state-store.test.ts`:

```ts
it('persiste simulação por port e restaura após reabertura', async () => {
  const storage = memoryStorage();
  const first = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
  const next = first.demoScenario!.getQaState();
  next.simulations.orders = 'error';
  await expect(first.demoScenario!.setQaState(next)).resolves.toEqual({ status: 'updated' });

  __resetDataClientForTests();
  const reopened = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
  expect(reopened.demoScenario!.getQaState().simulations.orders).toBe('error');
});
```

Adicionar um segundo teste com falha de `setItem` esperando `{ status: 'degraded' }`, e confirmar no teste de reset que os seis domínios voltam a `normal`.

- [ ] **Step 7: Implementar a port no store e no `DataClient`**

No store, devolver cópia defensiva e resultado honesto:

```ts
getQaState(): QaScenarioState {
  return structuredClone(this.lastSnapshot.qa);
}

async setQaState(next: QaScenarioState): Promise<DemoScenarioMutationResult> {
  this.lastSnapshot = { ...this.lastSnapshot, qa: structuredClone(next) };
  const persisted = await this.persist();
  return persisted ? { status: 'updated' } : { status: 'degraded' };
}
```

Ajustar `persist()` para `Promise<boolean>` e adaptar `db.onClienteMutation` com `.then(() => undefined)`. Em `createDataClient()`, ligar os dois métodos ao `stateStore`. O barrel já reexporta `demo-scenario.port.ts`; não expor o store.

- [ ] **Step 8: Rodar pacote completo**

Run: `pnpm --filter @keepit/core-data test && pnpm --filter @keepit/core-data typecheck`

Expected: PASS, inclusive migração V1, persistência, degradação, reset e ausência de `demoScenario` no datasource Supabase.

- [ ] **Step 9: Commit**

```bash
git add packages/core-data/src/ports/demo-scenario.port.ts packages/core-data/src/mock/cliente-state.ts packages/core-data/src/mock/cliente-state-store.ts packages/core-data/src/mock/cliente-state.test.ts packages/core-data/src/mock/cliente-state-store.test.ts packages/core-data/src/index.ts
git commit -m "feat(core-data): persist qa scenario controls"
```

### Task 2: Configurar flag e metadados simples do build

**Files:**
- Read: `apps/cliente/app.json`
- Modify: `apps/cliente/eas.json`
- Create: `apps/cliente/src/config/buildInfo.ts`
- Test: `apps/cliente/src/config/buildInfo.test.ts`

**Interfaces:**
- Consumes: `app.expo.version`, `app.expo.android.versionCode` e `process.env.EXPO_PUBLIC_*`.
- Produces: `BuildInfo`, `BUILD_INFO`, `QA_BUILD_ENABLED` e `formatBuildInfoRows()` sem geração de arquivo.

- [ ] **Step 1: Escrever teste RED do resolver puro**

```ts
it('combina app.json e variáveis QA nas seis linhas canônicas', () => {
  const info = resolveBuildInfo(
    { version: '1.0.0', versionCode: 4 },
    {
      commitSha: '0123456789abcdef0123456789abcdef01234567',
      buildDate: '2026-09-04T12:00:00.000Z', appEnv: 'qa', qaEnabled: 'true', dataSource: 'mock',
    },
  );

  expect(info.qaEnabled).toBe(true);
  expect(formatBuildInfoRows(info)).toEqual([
    { label: 'Versão', value: '1.0.0' },
    { label: 'VersionCode', value: '4' },
    { label: 'Commit', value: '0123456789ab' },
    { label: 'Datasource', value: 'mock' },
    { label: 'Ambiente', value: 'qa' },
    { label: 'Data do build', value: '2026-09-04T12:00:00.000Z' },
  ]);
});

it('usa fallbacks honestos no desenvolvimento', () => {
  expect(resolveBuildInfo({ version: '1.0.0', versionCode: 4 }, {})).toMatchObject({
    commitSha: 'local', buildDate: 'unknown', environment: 'local', dataSource: 'mock', qaEnabled: false,
  });
});
```

- [ ] **Step 2: Rodar e confirmar módulo ausente**

Run: `pnpm --filter @keepit/cliente test -- src/config/buildInfo.test.ts`

Expected: FAIL porque `buildInfo.ts` ainda não existe.

- [ ] **Step 3: Criar o módulo direto e tipado**

```ts
import app from '../../app.json';

export interface BuildInfo {
  version: string;
  versionCode: number;
  commitSha: string;
  dataSource: 'mock' | 'supabase';
  environment: string;
  buildDate: string;
  qaEnabled: boolean;
}

export interface PublicBuildEnv {
  commitSha?: string; buildDate?: string; appEnv?: string; qaEnabled?: string; dataSource?: string;
}

export function resolveBuildInfo(config: { version: string; versionCode: number }, env: PublicBuildEnv): BuildInfo {
  return {
    ...config,
    commitSha: env.commitSha?.trim() || 'local',
    buildDate: env.buildDate?.trim() || 'unknown',
    environment: env.appEnv?.trim() || 'local',
    dataSource: env.dataSource?.trim() === 'supabase' ? 'supabase' : 'mock',
    qaEnabled: env.qaEnabled === 'true',
  };
}
```

Construir `BUILD_INFO` com acessos diretos, necessários para inline do Expo:

```ts
export const BUILD_INFO = resolveBuildInfo(
  { version: app.expo.version, versionCode: app.expo.android.versionCode },
  {
    commitSha: process.env.EXPO_PUBLIC_COMMIT_SHA,
    buildDate: process.env.EXPO_PUBLIC_BUILD_DATE,
    appEnv: process.env.EXPO_PUBLIC_APP_ENV,
    qaEnabled: process.env.EXPO_PUBLIC_QA_ENABLED,
    dataSource: process.env.EXPO_PUBLIC_DATA_SOURCE,
  },
);
export const QA_BUILD_ENABLED = BUILD_INFO.qaEnabled;
```

`formatBuildInfoRows()` retorna as seis linhas do teste e encurta SHA somente quando ele possui mais de 12 caracteres; `local` permanece `local`.

- [ ] **Step 4: Configurar os perfis e ambientes explicitamente**

Em `eas.json`, manter datasource atual, associar `demo`/`demo-apk` a `"environment": "preview"` e adicionar as duas variáveis estáveis ao `env` dos dois perfis:

```json
"EXPO_PUBLIC_APP_ENV": "qa",
"EXPO_PUBLIC_QA_ENABLED": "true"
```

Associar `production` a `"environment": "production"` e usar `EXPO_PUBLIC_APP_ENV=production` e `EXPO_PUBLIC_QA_ENABLED=false` no perfil. `EXPO_PUBLIC_COMMIT_SHA` e `EXPO_PUBLIC_BUILD_DATE` são variáveis do ambiente EAS selecionado, pois mudam a cada artefato; não declará-las no `env` do perfil, que teria precedência e congelaria valores antigos. A Task 6 cria os dois valores reais no ambiente `preview`. Quando ausentes em desenvolvimento local, o resolver usa `local`/`unknown`.

Assim, cada perfil resolve as quatro variáveis solicitadas: ambiente/flag no próprio `env` estável e SHA/data no ambiente EAS associado ao perfil.

Não converter `app.json` para config dinâmica. Preservar `version: 1.0.0`, `versionCode: 4`, `appVersionSource: local` e `autoIncrement: true`.

- [ ] **Step 5: Completar testes da flag**

```ts
it('desliga QA para qualquer valor diferente da string true', () => {
  expect(resolveBuildInfo({ version: '1.0.0', versionCode: 4 }, { qaEnabled: 'false' }).qaEnabled).toBe(false);
  expect(resolveBuildInfo({ version: '1.0.0', versionCode: 4 }, { qaEnabled: 'TRUE' }).qaEnabled).toBe(false);
});
```

- [ ] **Step 6: Rodar teste e typecheck**

Run: `pnpm --filter @keepit/cliente test -- src/config/buildInfo.test.ts && pnpm --filter @keepit/cliente typecheck`

Expected: PASS sem dependência ou script adicional.

- [ ] **Step 7: Commit**

```bash
git add apps/cliente/eas.json apps/cliente/src/config/buildInfo.ts apps/cliente/src/config/buildInfo.test.ts
git commit -m "feat(cliente): expose qa build metadata"
```

### Task 3: Integrar contexto QA, faixa global e reset vivo

**Files:**
- Create: `apps/cliente/src/lib/qaSimulation.ts`
- Test: `apps/cliente/src/lib/qaSimulation.test.ts`
- Create: `apps/cliente/src/context/QaScenarioContext.tsx`
- Create: `apps/cliente/src/components/qa/SimulatedStateBanner.tsx`
- Modify: `apps/cliente/src/context/CartContext.tsx`
- Modify: `apps/cliente/src/lib/resetDemoScenario.ts`
- Test: `apps/cliente/src/lib/resetDemoScenario.test.ts`
- Modify: `apps/cliente/App.tsx`

**Interfaces:**
- Consumes: `DemoScenarioPort.getQaState/setQaState`, `QA_BUILD_ENABLED` e `CartContext`.
- Produces: `useQaScenario()`, `useQaSimulation(domain)`, helpers puros, `resetDemoCart()` e faixa global.

- [ ] **Step 1: Escrever testes RED dos helpers de simulação**

```ts
const normalState: QaScenarioState = {
  clockOffsetMs: 0,
  autoProgressOrders: true,
  simulations: {
    orders: 'normal', stores: 'normal', hubs: 'normal',
    favorites: 'normal', profile: 'normal', search: 'normal',
  },
};

expect(simulationToAsyncCallOptions('normal')).toEqual({});
expect(simulationToAsyncCallOptions('loading')).toEqual({});
expect(simulationToAsyncCallOptions('empty')).toEqual({ forceEmpty: true });
expect(simulationToAsyncCallOptions('error')).toEqual({ forceError: true });
expect(isForcedLoading('loading')).toBe(true);
expect(isAnySimulationActive(normalState)).toBe(false);
expect(isAnySimulationActive({
  ...normalState,
  simulations: { ...normalState.simulations, search: 'error' },
})).toBe(true);
```

- [ ] **Step 2: Rodar e confirmar helper ausente**

Run: `pnpm --filter @keepit/cliente test -- src/lib/qaSimulation.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implementar helpers e provider fino**

`simulationToAsyncCallOptions()` mapeia somente `empty/error`; `loading` usa `isForcedLoading()` e não cria timer artificial.

```ts
interface QaScenarioContextValue {
  state: QaScenarioState;
  persistence: DemoScenarioStatus;
  setSimulation(domain: QaSimulationDomain, value: QaSimulationState): Promise<DemoScenarioMutationResult>;
  syncFromClient(): void;
}
```

Inicializar com cópia de `getDataClient().demoScenario!.getQaState()`. `setSimulation()` cria novo `simulations`, chama `setQaState(next)`, mantém o estado em memória mesmo em degradação e atualiza `persistence` com `getStatus()`. `useQaSimulation()` retorna `normal` fora do provider, garantindo comportamento normal em produção.

- [ ] **Step 4: Escrever RED da degradação do reset vivo**

```ts
it('informa degradação quando a limpeza viva falha', async () => {
  const { client } = createFakeClient();
  asyncStorageMock.removeItem.mockResolvedValue(undefined);
  await expect(resetDemoScenario(client, true, {
    clearLiveCart: vi.fn().mockRejectedValue(new Error('provider indisponível')),
  })).resolves.toEqual({ status: 'degraded', failures: ['cart-live-state'] });
});
```

- [ ] **Step 5: Expor limpeza viva completa no carrinho**

Adicionar `resetDemoCart(): void` ao `CartContextValue` e implementar:

```ts
const resetDemoCart = useCallback(() => {
  setEstabelecimentoId(null);
  setItems([]);
  setHubIdState(null);
  setPaymentState(null);
  setCpfCollected(false);
  setCards([]);
  setNfSolicitadaState(false);
  cardIdCounter.current = 1;
}, []);
```

Manter `clearOrder()` inalterado. Em `resetDemoScenario`, ampliar `failures` com `cart-live-state`, capturar rejeição do callback e nunca devolver `reset` quando qualquer camada degradar.

- [ ] **Step 6: Criar a faixa e montar subárvore somente em QA**

`SimulatedStateBanner` retorna `null` sem simulação e renderiza `Estado simulado ativo` com tokens atuais caso contrário.

```tsx
const navigation = (
  <NavigationContainer linking={linking}>
    <RootNavigator />
  </NavigationContainer>
);

<CartProvider>
  {QA_BUILD_ENABLED ? (
    <QaScenarioProvider>
      <SimulatedStateBanner />
      {navigation}
    </QaScenarioProvider>
  ) : navigation}
  <StatusBar style="dark" />
</CartProvider>
```

- [ ] **Step 7: Rodar testes e typecheck**

Run: `pnpm --filter @keepit/cliente test -- src/lib/qaSimulation.test.ts src/lib/resetDemoScenario.test.ts && pnpm --filter @keepit/cliente typecheck`

Expected: PASS sem renderer.

- [ ] **Step 8: Commit**

```bash
git add apps/cliente/src/lib/qaSimulation.ts apps/cliente/src/lib/qaSimulation.test.ts apps/cliente/src/context/QaScenarioContext.tsx apps/cliente/src/components/qa/SimulatedStateBanner.tsx apps/cliente/src/context/CartContext.tsx apps/cliente/src/lib/resetDemoScenario.ts apps/cliente/src/lib/resetDemoScenario.test.ts apps/cliente/App.tsx
git commit -m "feat(cliente): add qa scenario context and live reset"
```

### Task 4: Criar acesso por sete toques e Painel QA mínimo

**Files:**
- Create: `apps/cliente/src/lib/qaAccess.ts`
- Test: `apps/cliente/src/lib/qaAccess.test.ts`
- Create: `apps/cliente/src/lib/qaOrderActions.ts`
- Test: `apps/cliente/src/lib/qaOrderActions.test.ts`
- Create: `apps/cliente/src/components/qa/BuildMetadata.tsx`
- Create: `apps/cliente/src/screens/perfil/PainelQA.tsx`
- Modify: `apps/cliente/src/navigation/types.ts`
- Modify: `apps/cliente/src/navigation/PerfilStack.tsx`
- Modify: `apps/cliente/src/screens/perfil/Perfil.tsx`

**Interfaces:**
- Consumes: `BUILD_INFO`, `QA_BUILD_ENABLED`, contexto/reset da Task 3 e operações atuais de `DataClient.order`.
- Produces: `getQaPerfilRouteNames()`, `registerVersionTap()`, rota `PainelQA`, bloco de metadados e painel com controles realmente funcionais.

- [ ] **Step 1: Escrever testes RED de rota e sete toques**

```ts
it('não registra rota QA com flag desligada', () => {
  expect(getQaPerfilRouteNames(false)).toEqual([]);
});

it('registra PainelQA com flag ligada', () => {
  expect(getQaPerfilRouteNames(true)).toEqual(['PainelQA']);
});

it('abre exatamente no sétimo toque e reinicia', () => {
  let count = 0;
  for (let tap = 1; tap <= 6; tap += 1) {
    const result = registerVersionTap(count);
    count = result.nextCount;
    expect(result.shouldOpen).toBe(false);
  }
  expect(registerVersionTap(count)).toEqual({ nextCount: 0, shouldOpen: true });
});
```

- [ ] **Step 2: Escrever teste RED do avanço manual existente**

```ts
expect(getNextQaOrderAction({ status: 'aguardando_aceite' } as Pedido)).toEqual({
  kind: 'accept', label: 'Aceitar pedido',
});
expect(getNextQaOrderAction({ status: 'aceito' } as Pedido)).toEqual({
  kind: 'override', status: 'em_preparo', label: 'Em preparo',
});
expect(getNextQaOrderAction({ status: 'no_hub' } as Pedido)).toEqual({
  kind: 'confirm-pin', label: 'Confirmar entrega',
});
expect(getNextQaOrderAction({ status: 'entregue' } as Pedido)).toBeNull();
```

- [ ] **Step 3: Rodar e confirmar helpers ausentes**

Run: `pnpm --filter @keepit/cliente test -- src/lib/qaAccess.test.ts src/lib/qaOrderActions.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implementar helpers puros**

```ts
export function getQaPerfilRouteNames(enabled: boolean): readonly 'PainelQA'[] {
  return enabled ? ['PainelQA'] : [];
}

export function registerVersionTap(current: number) {
  const next = current + 1;
  return next === 7 ? { nextCount: 0, shouldOpen: true } : { nextCount: next, shouldOpen: false };
}
```

Mover o switch atual de `OrderStatusDevAdvancer` para `getNextQaOrderAction(pedido)`. Implementar `advanceOrderForQa(client, pedido)` somente com `order.accept`, `order.advanceStatus` ou `order.confirmPin`; não adicionar transição, cancelamento, recusa ou scheduler.

- [ ] **Step 5: Exibir os mesmos metadados no Perfil e painel**

`BuildMetadata` usa `formatBuildInfoRows(BUILD_INFO)` e recebe `onVersionPress?: () => void`; somente a linha `Versão` é pressionável. Renderizar o bloco nos ramos normal, loading, erro e sem sessão do Perfil, para que uma simulação de Perfil nunca esconda a identificação do APK nem impeça o retorno ao painel.

```ts
function handleVersionPress() {
  if (!QA_BUILD_ENABLED) return;
  const result = registerVersionTap(versionTapCount);
  setVersionTapCount(result.nextCount);
  if (result.shouldOpen) navigation.navigate('PainelQA');
}
```

Passar `undefined` em produção e não mostrar contagem/toast do gesto.

- [ ] **Step 6: Registrar a rota somente com flag QA**

Adicionar `PainelQA: undefined` a `PerfilStackParamList`. Em `PerfilStack`, manter as duas telas base e mapear `getQaPerfilRouteNames(QA_BUILD_ENABLED)` para o único `<Stack.Screen name="PainelQA" component={PainelQA} />`. Não adicionar deep link.

- [ ] **Step 7: Criar a tela mínima**

Usar `Screen`, `Button`, `Pressable`, tokens atuais e estas seções, sem outras:

1. `Build`: `BuildMetadata` completo.
2. `Conta demo`: nome/e-mail da sessão atual e rótulo `Selecionada`; não criar troca de conta.
3. `Simulações`: `Normal`, `Loading`, `Vazio`, `Erro` para Pedidos, Lojas, Hubs, Perfil e Busca, chamando `setSimulation()`.
4. `Pedidos`: listar pedidos reais da conta atual sem aplicar a simulação de Pedidos e mostrar apenas a próxima ação de `getNextQaOrderAction()`.
5. `Resetar cenário`: confirmação com descrição de conta, pedidos, favoritos futuros e carrinho perdidos.

Após reset confirmado:

```ts
const result = await resetDemoScenario(getDataClient(), true, { clearLiveCart: resetDemoCart });
syncFromClient();
```

Mostrar `Cenário restaurado` somente em `reset`. Em `degraded`, mostrar `Cenário limpo em memória, mas uma ou mais camadas não foram persistidas` e os nomes das camadas. Em `unavailable`, mostrar `Reset disponível somente no datasource mock`.

Não renderizar seções para Favoritos, relógio, avanço automático, senha ou exclusão.

- [ ] **Step 8: Rodar testes e typecheck**

Run: `pnpm --filter @keepit/cliente test -- src/config/buildInfo.test.ts src/lib/qaAccess.test.ts src/lib/qaOrderActions.test.ts src/lib/resetDemoScenario.test.ts && pnpm --filter @keepit/cliente typecheck`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/cliente/src/lib/qaAccess.ts apps/cliente/src/lib/qaAccess.test.ts apps/cliente/src/lib/qaOrderActions.ts apps/cliente/src/lib/qaOrderActions.test.ts apps/cliente/src/components/qa/BuildMetadata.tsx apps/cliente/src/screens/perfil/PainelQA.tsx apps/cliente/src/navigation/types.ts apps/cliente/src/navigation/PerfilStack.tsx apps/cliente/src/screens/perfil/Perfil.tsx
git commit -m "feat(cliente): add gated qa panel"
```

### Task 5: Migrar simulações e remover controles inline

**Files:**
- Modify: `apps/cliente/src/screens/home/Home.tsx`
- Modify: `apps/cliente/src/screens/home/Hub.tsx`
- Modify: `apps/cliente/src/screens/home/EscolhaRetirada.tsx`
- Modify: `apps/cliente/src/screens/home/Loja.tsx`
- Modify: `apps/cliente/src/screens/home/DetalheProduto.tsx`
- Modify: `apps/cliente/src/screens/home/BuscaProduto.tsx`
- Modify: `apps/cliente/src/screens/home/BuscaLoja.tsx`
- Modify: `apps/cliente/src/screens/pedidos/MeusPedidos.tsx`
- Modify: `apps/cliente/src/screens/modals/ModalConfirmarPin.tsx`
- Modify: `apps/cliente/src/screens/perfil/Perfil.tsx`
- Modify: `apps/cliente/src/components/discovery/index.ts`
- Modify: `apps/cliente/src/components/pedidos/index.ts`
- Delete: `apps/cliente/src/components/discovery/DevStateToggle.tsx`
- Delete: `apps/cliente/src/components/pedidos/OrderStatusDevAdvancer.tsx`

**Interfaces:**
- Consumes: `useQaSimulation()`, `simulationToAsyncCallOptions()` e `isForcedLoading()`.
- Produces: cinco domínios funcionais centralizados e zero controles técnicos em telas normais.

- [ ] **Step 1: Migrar Hubs e Lojas sem estado local**

- Home usa `hubs` em `useHubsList` e `stores` em `useStoresList`.
- Hub usa `hubs` em `useHubDetail` e `stores` em `useStoresList`.
- EscolhaRetirada usa `hubs` em `useHubsList`.
- Loja usa `stores` em `useStoreDetail`, `useLojaEstado` e `useCatalogo`.
- DetalheProduto usa `stores` em `useProductDetail`; o lookup secundário da loja permanece normal.

Em cada chamada, passar `simulationToAsyncCallOptions(state)` e derivar loading como `resource.loading || isForcedLoading(state)`. Remover `useState<DevSimState>`, `setDevState` e JSX de `DevStateToggle`.

- [ ] **Step 2: Migrar Busca, Pedidos e Perfil**

- BuscaProduto/BuscaLoja usam `search` em todas as queries da tela.
- MeusPedidos usa `orders` em `usePedidosMine`.
- Perfil usa `profile`: `loading` força o guard de loading, `error` força a mensagem amigável existente e `empty` trata `clienteAtual` como `null`; todos os ramos preservam `BuildMetadata` e o gesto QA.

O Perfil mantém `BuildMetadata`; somente o toggle técnico local desaparece das demais telas.

- [ ] **Step 3: Remover avanço inline e apagar componentes**

Remover `OrderStatusDevAdvancer` de `ModalConfirmarPin.tsx`. Remover exports dos barrels, apagar `DevStateToggle.tsx` e `OrderStatusDevAdvancer.tsx`; o avanço manual vive somente em `PainelQA`.

- [ ] **Step 4: Rodar apenas helpers e typecheck**

Run: `pnpm --filter @keepit/cliente test -- src/lib/qaSimulation.test.ts src/lib/qaAccess.test.ts src/lib/qaOrderActions.test.ts && pnpm --filter @keepit/cliente typecheck`

Expected: PASS; nenhum teste por tela ou renderer é criado.

- [ ] **Step 5: Provar ausência dos controles inline**

Run: `! rg -n "DevStateToggle|OrderStatusDevAdvancer|useState<DevSimState>" apps/cliente/src`

Expected: exit code 0 e nenhum match.

- [ ] **Step 6: Commit**

```bash
git add apps/cliente/src/screens/home/Home.tsx apps/cliente/src/screens/home/Hub.tsx apps/cliente/src/screens/home/EscolhaRetirada.tsx apps/cliente/src/screens/home/Loja.tsx apps/cliente/src/screens/home/DetalheProduto.tsx apps/cliente/src/screens/home/BuscaProduto.tsx apps/cliente/src/screens/home/BuscaLoja.tsx apps/cliente/src/screens/pedidos/MeusPedidos.tsx apps/cliente/src/screens/modals/ModalConfirmarPin.tsx apps/cliente/src/screens/perfil/Perfil.tsx apps/cliente/src/components/discovery apps/cliente/src/components/pedidos
git commit -m "refactor(cliente): centralize qa controls"
```

### Task 6: Rodar gates e validar um APK QA

**Files:**
- Modify: `docs/stories/12.2.story.md`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: evidência automatizada e smoke do APK QA, sem declarar capacidades omitidas como concluídas.

- [ ] **Step 1: Rodar testes focados**

Run: `pnpm --filter @keepit/core-data test -- src/mock/cliente-state.test.ts src/mock/cliente-state-store.test.ts && pnpm --filter @keepit/cliente test -- src/config/buildInfo.test.ts src/lib/qaSimulation.test.ts src/lib/qaAccess.test.ts src/lib/qaOrderActions.test.ts src/lib/resetDemoScenario.test.ts`

Expected: PASS.

- [ ] **Step 2: Rodar gates dos pacotes afetados**

Run: `pnpm --filter @keepit/core-data typecheck && pnpm --filter @keepit/core-data test && pnpm --filter @keepit/cliente typecheck && pnpm --filter @keepit/cliente test`

Expected: PASS.

- [ ] **Step 3: Provar ausência de rota com flag falsa**

Run: `pnpm --filter @keepit/cliente test -- src/lib/qaAccess.test.ts src/config/buildInfo.test.ts`

Expected: PASS para `getQaPerfilRouteNames(false) === []` e `resolveBuildInfo(..., { qaEnabled: 'false' }).qaEnabled === false`.

- [ ] **Step 4: Preparar metadados reais do único APK**

Confirmar que `demo-apk` usa `"environment": "preview"`. Antes do build, configurar as quatro variáveis públicas associadas ao perfil; as duas estáveis repetem os valores do perfil para tornar a inspeção do ambiente inequívoca:

```bash
eas env:set --name EXPO_PUBLIC_COMMIT_SHA --value "$(git rev-parse HEAD)" --environment preview --visibility plaintext
eas env:set --name EXPO_PUBLIC_BUILD_DATE --value "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --environment preview --visibility plaintext
eas env:set --name EXPO_PUBLIC_APP_ENV --value "qa" --environment preview --visibility plaintext
eas env:set --name EXPO_PUBLIC_QA_ENABLED --value "true" --environment preview --visibility plaintext
```

Rodar `eas env:list --environment preview` e interromper o build se SHA/data ainda forem `local`, `unknown` ou não corresponderem ao `git rev-parse HEAD` e à data UTC corrente.

- [ ] **Step 5: Gerar um APK QA release**

Run: `cd apps/cliente && eas build --platform android --profile demo-apk`

Expected: um APK interno; não gerar build local de produção nesta story.

- [ ] **Step 6: Executar smoke mínimo no APK QA**

1. Entrar na conta demo e abrir Perfil.
2. Conferir versão, `versionCode`, SHA, datasource `mock`, ambiente `qa` e data contra o build.
3. Tocar seis vezes na versão e confirmar que nada abre; no sétimo toque, confirmar abertura do Painel QA.
4. Ativar `Erro` em Pedidos e confirmar faixa global + mensagem de erro; normalizar e confirmar remoção da faixa.
5. Fazer um smoke único adicional por domínio: `Loading` em Hubs, `Vazio` em Lojas, `Erro` em Busca e `Vazio` em Perfil.
6. Avançar manualmente um pedido suportado e confirmar refresh.
7. Preencher carrinho, ativar simulação, resetar com confirmação, entrar novamente e confirmar carrinho vazio e faixa ausente.
8. Confirmar que nenhuma tela normal contém toggle ou avanço técnico.

Se a infraestrutura permitir gerar um bundle/preview com `EXPO_PUBLIC_QA_ENABLED=false` sem produzir outro APK, abrir esse preview e confirmar que dez toques não navegam. Caso contrário, registrar como evidência a combinação do teste `getQaPerfilRouteNames(false)` com a inspeção de `PerfilStack`.

- [ ] **Step 7: Registrar evidências sem ampliar o escopo**

Em `QA Results`, registrar comandos, URL/ID do build, SHA, `versionCode`, data e resultados do smoke. Marcar como comprovados somente os critérios cobertos. Registrar explicitamente que Favoritos, relógio/pausa, callback de senha e exclusão permanecem nas respectivas stories futuras.

- [ ] **Step 8: Commit**

```bash
git add docs/stories/12.2.story.md
git commit -m "docs(cliente): record qa panel evidence"
```

## Definition of Done

- Validators exigem `cliente-ana`, bloqueiam os três IDs auxiliares e rejeitam duplicidade de account/e-mail/order/item IDs.
- Snapshot V1 migra para V2; simulações persistem e reset volta todos os domínios a `normal`.
- Perfil e painel exibem os mesmos seis metadados; o APK validado não usa `local`/`unknown` para SHA/data.
- Sete toques abrem o painel somente com flag QA; helper retorna zero rotas com flag falsa.
- Painel oferece somente conta atual, cinco domínios funcionais, avanço manual existente e reset.
- Faixa aparece para simulação ativa e some ao normalizar/resetar.
- Reset limpa snapshot, carrinho persistido e `CartContext` vivo, com `degraded` honesto.
- Controles técnicos antigos não existem nas telas normais.
- Nenhuma dependência, renderer, gerador de metadados ou funcionalidade profunda de story futura foi adicionada.
- Testes, typechecks e um smoke de APK QA possuem evidência registrada.
