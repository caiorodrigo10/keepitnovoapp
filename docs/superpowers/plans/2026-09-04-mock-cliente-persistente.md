# Mock Cliente Persistente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o modo mock do app Cliente iniciar com uma conta demo e dados de uso zerados, persistir as mutações entre reinícios e oferecer um reset seguro, sem compartilhar estado com o app Lojista.

**Architecture:** `@keepit/core-data` ganha um snapshot versionado exclusivamente do domínio Cliente, uma store assíncrona injetável e uma port aditiva de cenário demo. O app Cliente injeta o `AsyncStorage` e aguarda a hidratação antes de montar navegação e providers; o reset do app coordena a port com a chave já existente do carrinho. As fixtures de catálogo continuam imutáveis e os arrays usados pelo Lojista não são serializados pelo snapshot Cliente.

**Tech Stack:** TypeScript 5.9, React 19, React Native/Expo 57, AsyncStorage 2.2, Vitest 1.2, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-09-04-estabilizacao-beta-android-cliente-design.md`

## Global Constraints

- O mock Cliente não lê, grava nem sincroniza o estado do mock Lojista.
- A fixture-base contém a conta demo `cliente-ana`/`ana.souza@example.com`, mas zero pedidos desse cliente, zero favoritos, nenhum hub selecionado e carrinho vazio.
- Telas e hooks consomem contratos de `@keepit/core-data`; nenhum fluxo de produto acessa diretamente adapter mock ou `AsyncStorage`.
- O snapshot usa a chave exclusiva `@keepit/cliente:mock-state`, `schemaVersion: 1` e escrita de payload JSON completo por `setItem`.
- Estado ausente cria a fixture-base; JSON inválido ou versão incompatível é substituído explicitamente pela fixture-base, sem estado parcial e sem crash.
- Falha de leitura ou escrita é fail-open: o app permanece utilizável com o estado em memória e expõe o último erro pela port de cenário, sem gravar credenciais em logs.
- “Resetar cenário” é uma operação destrutiva confirmada pela UI; a port recebe a confirmação como precondição e o app limpa também `@keepit/cliente:carrinho`.
- O modo `supabase` mantém os adapters e o bootstrap atuais; persistência e port de cenário mock não alteram chamadas reais.
- Implementação por TDD estrito: ler `test-driven-development/SKILL.md` e `test-driven-development/writing-good-tests.md`, escrever o teste, observar a falha, implementar o mínimo e observar a passagem.
- Não implementar as UIs de favoritos, Painel QA, exclusão ou recuperação desta story; apenas reservar e persistir os campos necessários no snapshot.

---

### Task 1: Snapshot versionado e fixture-base exclusiva do Cliente

**Files:**
- Create: `packages/core-data/src/mock/cliente-state.ts`
- Create: `packages/core-data/src/mock/cliente-state.test.ts`
- Modify: `packages/core-data/src/mock/db.ts`

**Interfaces:**
- Consumes: `Cliente`, `Pedido` e as fixtures existentes de `packages/core-data/src/mock/fixtures/`.
- Produces: `CLIENTE_MOCK_SCHEMA_VERSION`, `ClienteMockSnapshotV1`, `ClienteMockStorage`, `createClienteBaseline()`, `parseClienteSnapshot(raw)` e `applyClienteSnapshot(db, snapshot)`.

- [ ] **Step 1: Escrever os testes que falham para baseline, parsing e isolamento**

```ts
import { describe, expect, it } from 'vitest';
import { createMockDb } from './db';
import {
  CLIENTE_MOCK_SCHEMA_VERSION,
  applyClienteSnapshot,
  createClienteBaseline,
  parseClienteSnapshot,
} from './cliente-state';

describe('cliente-state', () => {
  it('cria baseline com conta demo, mas sem dados de uso do Cliente', () => {
    const state = createClienteBaseline();
    expect(state).toMatchObject({
      schemaVersion: CLIENTE_MOCK_SCHEMA_VERSION,
      sessionClienteId: null,
      selectedHubId: null,
      favoriteHubIds: [],
      favoriteStoreIds: [],
      orders: [],
      accountDeletion: null,
      qa: { clockOffsetMs: 0, autoProgressOrders: true },
    });
    expect(state.accounts).toEqual([
      expect.objectContaining({ id: 'cliente-ana', email: 'ana.souza@example.com' }),
    ]);
  });

  it.each([null, '{', JSON.stringify({ schemaVersion: 999 })])(
    'substitui payload ausente, corrompido ou incompatível por baseline (%s)',
    (raw) => expect(parseClienteSnapshot(raw)).toEqual(createClienteBaseline()),
  );

  it('aplica somente o domínio Cliente e preserva dados do Lojista', () => {
    const db = createMockDb();
    const lojistaContas = structuredClone(db.lojistaContas);
    const estabelecimentosCadastrados = structuredClone(db.estabelecimentosCadastrados);
    applyClienteSnapshot(db, createClienteBaseline());
    expect(db.lojistaContas).toEqual(lojistaContas);
    expect(db.estabelecimentosCadastrados).toEqual(estabelecimentosCadastrados);
    expect(db.pedidos.filter((pedido) => pedido.cliente_id === 'cliente-ana')).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha esperada**

Run: `pnpm --filter @keepit/core-data test -- src/mock/cliente-state.test.ts`

Expected: FAIL porque `./cliente-state` ainda não existe.

- [ ] **Step 3: Implementar tipos, baseline, validação e aplicação mínima**

```ts
export const CLIENTE_MOCK_SCHEMA_VERSION = 1 as const;

export interface ClienteMockStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface ClienteMockAccount {
  id: string;
  email: string;
  password: string;
  profile: Cliente;
}

export interface ClienteMockSnapshotV1 {
  schemaVersion: 1;
  accounts: ClienteMockAccount[];
  sessionClienteId: string | null;
  orders: Pedido[];
  favoriteHubIds: string[];
  favoriteStoreIds: string[];
  selectedHubId: string | null;
  accountDeletion: { requestedAt: string } | null;
  qa: { clockOffsetMs: number; autoProgressOrders: boolean };
}

export const CLIENTE_MOCK_STATE_KEY = '@keepit/cliente:mock-state';
export const CLIENTE_DEMO_INITIAL_PASSWORD = 'keepit123';
```

`createClienteBaseline()` deve clonar somente `cliente-ana`, associar o e-mail e a senha acima, e devolver arrays vazios. `parseClienteSnapshot()` deve aceitar apenas um objeto completo de versão 1, clonar seu resultado e retornar baseline para ausência, erro de JSON ou shape inválido. `applyClienteSnapshot()` deve remover das fixtures apenas os IDs presentes em `snapshot.accounts`, inserir os perfis/credenciais do snapshot, aplicar `sessionClienteId` e substituir somente os pedidos pertencentes a esses IDs. Clientes auxiliares, pedidos e estruturas do Lojista ficam intactos.

- [ ] **Step 4: Rodar os testes do snapshot e do banco mock**

Run: `pnpm --filter @keepit/core-data test -- src/mock/cliente-state.test.ts src/index.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core-data/src/mock/cliente-state.ts packages/core-data/src/mock/cliente-state.test.ts packages/core-data/src/mock/db.ts
git commit -m "feat(core-data): add versioned cliente mock snapshot"
```

---

### Task 2: Store persistente e port de cenário mock

**Files:**
- Create: `packages/core-data/src/ports/demo-scenario.port.ts`
- Create: `packages/core-data/src/mock/cliente-state-store.ts`
- Create: `packages/core-data/src/mock/cliente-state-store.test.ts`
- Modify: `packages/core-data/src/index.ts`

**Interfaces:**
- Consumes: `ClienteMockStorage`, `ClienteMockSnapshotV1`, `createClienteBaseline()`, `parseClienteSnapshot(raw)` e `applyClienteSnapshot(db, snapshot)` da Task 1.
- Produces: `ClienteMockStateStore.hydrate()`, `.persist()`, `.reset()`, `.getStatus()`; `DemoScenarioPort`; `CreateDataClientOptions.clienteMockStorage`; `initializeDataClient(options)`; `DataClient.demoScenario` apenas em mock.

- [ ] **Step 1: Escrever testes que falham para hidratação, reabertura, reset e falhas**

```ts
it('hidrata antes de devolver o client e reabre o estado persistido', async () => {
  const storage = memoryStorage();
  const first = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
  await first.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 });
  await first.demoScenario!.flush();

  __resetDataClientForTests();
  const reopened = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
  await expect(reopened.auth.currentUser({ delayMs: 0 })).resolves.toMatchObject({ id: 'cliente-ana' });
});

it('reset restaura baseline e publica status sem propagar falha de storage', async () => {
  const storage = memoryStorage({ setItemError: new Error('disk full') });
  const client = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
  await expect(client.demoScenario!.reset()).resolves.toBeUndefined();
  expect(client.demoScenario!.getStatus()).toMatchObject({ hydrated: true, persistence: 'degraded' });
});

it('não oferece cenário mock no datasource supabase', () => {
  expect(createDataClient({ source: 'supabase' }).demoScenario).toBeUndefined();
});
```

O helper `memoryStorage()` deve ser um double em memória no próprio teste, com `getItem`/`setItem`/`removeItem` reais sobre uma `Map`; apenas a variante de erro simula a dependência externa.

- [ ] **Step 2: Rodar os testes e confirmar a falha esperada**

Run: `pnpm --filter @keepit/core-data test -- src/mock/cliente-state-store.test.ts src/index.test.ts`

Expected: FAIL porque `initializeDataClient`, `demoScenario` e a store não existem.

- [ ] **Step 3: Criar a port e a store com fila de escrita**

```ts
export interface DemoScenarioStatus {
  hydrated: boolean;
  persistence: 'ready' | 'degraded';
  lastError: 'read' | 'write' | 'reset' | null;
}

export interface DemoScenarioPort {
  reset(): Promise<void>;
  flush(): Promise<void>;
  getStatus(): DemoScenarioStatus;
}
```

`ClienteMockStateStore` mantém uma `writeQueue: Promise<void>`; cada `persist()` captura um snapshot clonado completo e encadeia `storage.setItem(CLIENTE_MOCK_STATE_KEY, JSON.stringify(snapshot))`. A rejeição é consumida, muda o status para `degraded`/`write` e não quebra a próxima escrita. `hydrate()` lê uma vez, aplica `parseClienteSnapshot`, e grava o baseline quando a chave estiver ausente ou inválida. `reset()` aplica baseline em memória e substitui o payload persistido completo.

- [ ] **Step 4: Integrar criação síncrona e inicialização assíncrona sem regressão Supabase**

```ts
export interface CreateDataClientOptions {
  source?: DataSource;
  supabaseClient?: SupabaseClient<Database>;
  passwordRecoveryState?: PasswordRecoveryState;
  clienteMockStorage?: ClienteMockStorage;
}

export interface DataClient {
  auth: AuthPort;
  hub: HubPort;
  store: StorePort;
  product: ProductPort;
  order: OrderPort;
  payment: PaymentPort;
  wallet: WalletPort;
  admin: AdminPort;
  analytics: AnalyticsPort;
  lojistaAuth: LojistaAuthPort;
  estabelecimentoCadastro: EstabelecimentoCadastroPort;
  demoScenario?: DemoScenarioPort;
}

export async function initializeDataClient(options: CreateDataClientOptions = {}): Promise<DataClient> {
  const client = getDataClient(options);
  await mockStateStoreFor(client)?.hydrate();
  return client;
}
```

Manter `createDataClient()` e `getDataClient()` compatíveis e síncronos para testes/consumidores existentes. A associação client→store deve ficar privada em `index.ts` por `WeakMap<DataClient, ClienteMockStateStore>`; `__resetDataClientForTests()` também zera a promessa de inicialização compartilhada. Exportar `ClienteMockStorage` e `DemoScenarioPort` no barrel público, pois o bootstrap do app consome somente `@keepit/core-data`.

- [ ] **Step 5: Rodar os testes focados e o typecheck**

Run: `pnpm --filter @keepit/core-data test -- src/mock/cliente-state-store.test.ts src/index.test.ts`

Expected: PASS.

Run: `pnpm --filter @keepit/core-data typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core-data/src/ports/demo-scenario.port.ts packages/core-data/src/mock/cliente-state-store.ts packages/core-data/src/mock/cliente-state-store.test.ts packages/core-data/src/index.ts
git commit -m "feat(core-data): hydrate cliente mock state"
```

---

### Task 3: Persistir mutações de autenticação e pedidos

**Files:**
- Modify: `packages/core-data/src/mock/db.ts`
- Modify: `packages/core-data/src/mock/auth.mock.ts`
- Modify: `packages/core-data/src/mock/auth.mock.test.ts`
- Modify: `packages/core-data/src/mock/order.mock.ts`
- Modify: `packages/core-data/src/mock/order.mock.test.ts`
- Modify: `packages/core-data/src/mock/cliente-state-store.test.ts`

**Interfaces:**
- Consumes: callback `MockDb.onClienteMutation(): void` instalado pela store da Task 2.
- Produces: persistência enfileirada após toda mutação Cliente bem-sucedida; validação da senha persistida; `demoScenario.flush()` como barreira determinística para testes e encerramento controlado.

- [ ] **Step 1: Escrever testes que falham para credenciais, perfil e pedido após reabertura**

```ts
it('persiste senha redefinida e passa a exigir a nova senha no próximo login', async () => {
  const storage = memoryStorage();
  const client = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
  await client.auth.establishPasswordRecoverySession('keepit://reset', { delayMs: 0 });
  await client.auth.updatePassword('novaSenha9', { delayMs: 0 });
  await client.auth.signOut({ delayMs: 0 });
  await client.demoScenario!.flush();
  __resetDataClientForTests();
  const reopened = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
  await expect(reopened.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 })).rejects.toThrow();
  await expect(reopened.auth.signIn('ana.souza@example.com', 'novaSenha9', { delayMs: 0 })).resolves.toMatchObject({ id: 'cliente-ana' });
});

it('persiste perfil e pedido criado após reabertura', async () => {
  const storage = memoryStorage();
  const client = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
  await client.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 });
  await client.auth.updateProfile('cliente-ana', { nome: 'Ana Persistida' }, { delayMs: 0 });
  const created = await client.order.create({
    cliente_id: 'cliente-ana',
    estabelecimento_id: 'estab-farmacia-vida',
    hub_id: 'hub-centro',
    itens: [{
      produto_id: 'produto-dipirona',
      nome_snapshot: 'Dipirona Monoidratada 500mg',
      preco_unitario_reais: 14.9,
      quantidade: 2,
    }],
    forma_pagamento: 'pix',
    subtotal_produtos_reais: 29.8,
    taxa_deslocamento_reais: 5,
    taxa_keepit_reais: 3.58,
    taxa_servico_comprador_reais: 1.99,
    total_pago_reais: 40.37,
    nf_solicitada: false,
  }, { delayMs: 0 });
  await client.demoScenario!.flush();
  __resetDataClientForTests();
  const reopened = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
  await expect(reopened.auth.getById('cliente-ana', { delayMs: 0 })).resolves.toMatchObject({ nome: 'Ana Persistida' });
  await expect(reopened.order.listMine('cliente-ana', { delayMs: 0 })).resolves.toEqual([
    expect.objectContaining({ id: created.id, total_pago_reais: 40.37 }),
  ]);
});
```

No segundo teste, copiar o `CreatePedidoInput` literal já usado no caso feliz de `order.mock.test.ts`; não compartilhar builder de expectativa com a implementação.

- [ ] **Step 2: Rodar os testes e confirmar que o estado volta ao baseline**

Run: `pnpm --filter @keepit/core-data test -- src/mock/auth.mock.test.ts src/mock/order.mock.test.ts src/mock/cliente-state-store.test.ts`

Expected: FAIL nas expectativas após reabertura e na rejeição da senha antiga.

- [ ] **Step 3: Adicionar o hook único de mutação ao banco**

```ts
onClienteMutation: () => void;

export function createMockDb(): MockDb {
  return {
    onClienteMutation: () => undefined,
  };
}
```

O primeiro membro é adicionado à interface `MockDb`; o segundo valor é adicionado ao objeto literal existente de `createMockDb()` sem remover nenhum campo atual.

A store da Task 2 substitui o callback por `() => { void store.persist(); }` após hidratar. Chamar esse callback somente depois de uma mutação bem-sucedida em `signUp`, `signIn`, `signOut`, `updatePassword`, `updateProfile`, `updateEmail`, `updateCpf` e em todos os métodos de `order.mock.ts` que alteram um `Pedido` do Cliente. Não chamar em leituras nem em branches que lançam antes de mutar.

- [ ] **Step 4: Persistir e validar senha sem expô-la**

Alterar a credencial interna para `{ clienteId: string; email: string; password: string }`. A fixture demo usa `CLIENTE_DEMO_INITIAL_PASSWORD`; `signUp` salva `input.senha`; `signIn` exige igualdade; `updatePassword` troca somente a senha da sessão ativa. Erros continuam genéricos e nenhum log inclui e-mail ou senha.

- [ ] **Step 5: Rodar testes focados, suíte e typecheck do pacote**

Run: `pnpm --filter @keepit/core-data test -- src/mock/auth.mock.test.ts src/mock/order.mock.test.ts src/mock/cliente-state-store.test.ts`

Expected: PASS.

Run: `pnpm --filter @keepit/core-data test`

Expected: PASS.

Run: `pnpm --filter @keepit/core-data typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core-data/src/mock/db.ts packages/core-data/src/mock/auth.mock.ts packages/core-data/src/mock/auth.mock.test.ts packages/core-data/src/mock/order.mock.ts packages/core-data/src/mock/order.mock.test.ts packages/core-data/src/mock/cliente-state-store.test.ts
git commit -m "feat(core-data): persist cliente mock mutations"
```

---

### Task 4: Bootstrap assíncrono do app Cliente

**Files:**
- Modify: `apps/cliente/src/lib/dataClientBootstrap.ts`
- Modify: `apps/cliente/src/lib/dataClientBootstrap.test.ts`
- Modify: `apps/cliente/App.tsx`
- Create: `apps/cliente/src/lib/clienteMockStorage.ts`

**Interfaces:**
- Consumes: `initializeDataClient({ source, clienteMockStorage, ... })` da Task 2 e `AsyncStorage`.
- Produces: `dataClientReady: Promise<DataClient>` e `useDataClientReady()`; adapter `clienteMockStorage` com a chave exclusiva encapsulada pelo core-data.

- [ ] **Step 1: Escrever testes que falham para injeção e espera de hidratação**

```ts
it('modo mock injeta AsyncStorage e expõe uma promessa de hidratação', async () => {
  delete process.env.EXPO_PUBLIC_DATA_SOURCE;
  initializeDataClientMock.mockResolvedValue('mock-client');
  const module = await import('./dataClientBootstrap');
  await expect(module.dataClientReady).resolves.toBe('mock-client');
  expect(initializeDataClientMock).toHaveBeenCalledWith({
    source: 'mock',
    clienteMockStorage: expect.objectContaining({
      getItem: expect.any(Function),
      setItem: expect.any(Function),
      removeItem: expect.any(Function),
    }),
  });
});

it('falha no Supabase degrada pela mesma inicialização para mock persistente', async () => {
  process.env.EXPO_PUBLIC_DATA_SOURCE = 'supabase';
  createClientMock.mockImplementation(() => { throw new Error('config ausente'); });
  const module = await import('./dataClientBootstrap');
  await module.dataClientReady;
  expect(initializeDataClientMock).toHaveBeenLastCalledWith({
    source: 'mock',
    clienteMockStorage: expect.any(Object),
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar a falha esperada**

Run: `pnpm --filter @keepit/cliente test -- src/lib/dataClientBootstrap.test.ts`

Expected: FAIL porque o bootstrap ainda não exporta `dataClientReady` nem chama `initializeDataClient` em mock.

- [ ] **Step 3: Implementar o adapter e o bootstrap**

```ts
// clienteMockStorage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ClienteMockStorage } from '@keepit/core-data';

export const clienteMockStorage: ClienteMockStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};
```

`dataClientBootstrap.ts` deve exportar uma única `dataClientReady`. Em mock ela chama `initializeDataClient({ source: 'mock', clienteMockStorage })`; em Supabase ela chama `initializeDataClient({ source: 'supabase', supabaseClient, passwordRecoveryState })`; no catch de configuração Supabase chama o mesmo fallback mock persistente.

- [ ] **Step 4: Bloquear a montagem até dados e fontes estarem prontos**

```tsx
export default function App() {
  const [dataReady, setDataReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts(fonts);

  useEffect(() => {
    let mounted = true;
    dataClientReady.finally(() => mounted && setDataReady(true));
    return () => { mounted = false; };
  }, []);

  if (!dataReady || (!fontsLoaded && !fontError)) return null;
  return <ReadyApp />;
}

function ReadyApp() {
  const linking = useMemo(() => createPasswordRecoveryLinking(getDataClient().auth, Linking), []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <CartProvider>
          <NavigationContainer linking={linking}>
            <RootNavigator />
          </NavigationContainer>
          <StatusBar style="dark" />
        </CartProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

Construir `linking` somente depois de `dataReady`, dentro de um componente filho, para não chamar `getDataClient()` antes da hidratação. Não alterar rotas, copy ou layout.

- [ ] **Step 5: Rodar testes e typecheck do app Cliente**

Run: `pnpm --filter @keepit/cliente test -- src/lib/dataClientBootstrap.test.ts`

Expected: PASS.

Run: `pnpm --filter @keepit/cliente typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/cliente/src/lib/clienteMockStorage.ts apps/cliente/src/lib/dataClientBootstrap.ts apps/cliente/src/lib/dataClientBootstrap.test.ts apps/cliente/App.tsx
git commit -m "feat(cliente): await persistent mock bootstrap"
```

---

### Task 5: Reset coordenado com carrinho e verificação integrada

**Files:**
- Create: `apps/cliente/src/lib/resetDemoScenario.ts`
- Create: `apps/cliente/src/lib/resetDemoScenario.test.ts`
- Modify: `apps/cliente/src/lib/cartStorage.ts`
- Modify: `apps/cliente/src/lib/cartStorage.test.ts`
- Modify: `docs/stories/12.1.story.md`

**Interfaces:**
- Consumes: `DataClient.demoScenario.reset()` da Task 2 e `clearCartState()` existente.
- Produces: `resetDemoScenario(client: DataClient, confirmed: boolean): Promise<ResetDemoScenarioResult>` para a futura UI do Painel QA.

- [ ] **Step 1: Escrever testes que falham para confirmação, limpeza e falha parcial**

```ts
describe('resetDemoScenario', () => {
  it('não altera nada sem confirmação explícita', async () => {
    const result = await resetDemoScenario(fakeClient, false);
    expect(result).toEqual({ status: 'cancelled' });
    expect(fakeClient.demoScenario!.reset).not.toHaveBeenCalled();
  });

  it('reseta core-data e carrinho quando confirmado', async () => {
    const result = await resetDemoScenario(fakeClient, true);
    expect(result).toEqual({ status: 'reset' });
    expect(fakeClient.demoScenario!.reset).toHaveBeenCalledOnce();
    expect(asyncStorageMock.removeItem).toHaveBeenCalledWith('@keepit/cliente:carrinho');
  });

  it('informa indisponibilidade fora do mock', async () => {
    const result = await resetDemoScenario({ ...fakeClient, demoScenario: undefined }, true);
    expect(result).toEqual({ status: 'unavailable' });
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar a falha esperada**

Run: `pnpm --filter @keepit/cliente test -- src/lib/resetDemoScenario.test.ts src/lib/cartStorage.test.ts`

Expected: FAIL porque `resetDemoScenario.ts` ainda não existe.

- [ ] **Step 3: Implementar a orquestração mínima atrás de função de app**

```ts
export type ResetDemoScenarioResult =
  | { status: 'cancelled' }
  | { status: 'unavailable' }
  | { status: 'reset' };

export async function resetDemoScenario(
  client: DataClient,
  confirmed: boolean,
): Promise<ResetDemoScenarioResult> {
  if (!confirmed) return { status: 'cancelled' };
  if (!client.demoScenario) return { status: 'unavailable' };
  await client.demoScenario.reset();
  await clearCartState();
  return { status: 'reset' };
}
```

A função não exibe `Alert`; a futura tela do Painel QA será responsável por mostrar “Conta demo, perfil, pedidos, favoritos, hub selecionado, carrinho e configurações QA serão apagados” e passar `confirmed: true` somente após o botão destrutivo. Manter `clearCartState()` fail-open para não impedir a restauração do core-data.

- [ ] **Step 4: Rodar todas as verificações da story**

Run: `pnpm --filter @keepit/core-data test && pnpm --filter @keepit/cliente test`

Expected: PASS.

Run: `pnpm --filter @keepit/core-data typecheck && pnpm --filter @keepit/cliente typecheck`

Expected: PASS.

- [ ] **Step 5: Atualizar a story com evidências e status**

Em `docs/stories/12.1.story.md`, marcar os subtasks concluídos, mudar `Status` de `Draft` para `Ready for Review` e registrar em `QA Results` os quatro comandos acima com resultado e a limitação explícita: teste manual em APK release ainda pendente até existir build QA instalável.

- [ ] **Step 6: Commit**

```bash
git add apps/cliente/src/lib/resetDemoScenario.ts apps/cliente/src/lib/resetDemoScenario.test.ts apps/cliente/src/lib/cartStorage.ts apps/cliente/src/lib/cartStorage.test.ts docs/stories/12.1.story.md
git commit -m "feat(cliente): reset persistent demo scenario"
```
