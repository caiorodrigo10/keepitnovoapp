import { beforeEach, describe, expect, it } from 'vitest';

import {
  __resetDataClientForTests,
  createDataClient,
  initializeDataClient,
  type ClienteMockStorage,
} from '../index';
import { createAuthMock } from './auth.mock';
import { CLIENTE_MOCK_STATE_KEY, createClienteBaseline } from './cliente-state';
import { ClienteMockStateStore } from './cliente-state-store';
import { createMockDb } from './db';
import { createOrderMock } from './order.mock';

interface MemoryStorageOptions {
  getItemError?: Error;
  setItemError?: Error;
  setItemErrors?: Error[];
  initialValue?: string;
}

interface MemoryStorage extends ClienteMockStorage {
  peek(key: string): string | null;
}

function memoryStorage(options: MemoryStorageOptions = {}): MemoryStorage {
  const values = new Map<string, string>();
  const setItemErrors = [...(options.setItemErrors ?? [])];
  if (options.initialValue !== undefined) {
    values.set(CLIENTE_MOCK_STATE_KEY, options.initialValue);
  }

  return {
    async getItem(key) {
      if (options.getItemError) throw options.getItemError;
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      if (options.setItemError) throw options.setItemError;
      const error = setItemErrors.shift();
      if (error) throw error;
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
    peek(key) {
      return values.get(key) ?? null;
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe('ClienteMockStateStore', () => {
  beforeEach(() => {
    __resetDataClientForTests();
  });

  it('hidrata antes de devolver o client e reabre o estado persistido', async () => {
    const storage = memoryStorage();
    const first = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
    await first.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 });
    await first.demoScenario!.flush();

    __resetDataClientForTests();
    const reopened = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
    await expect(reopened.auth.currentUser({ delayMs: 0 })).resolves.toMatchObject({ id: 'cliente-ana' });
  });

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

  it('degrada honestamente quando a persistência do estado QA falha', async () => {
    const storage = memoryStorage({
      initialValue: JSON.stringify(createClienteBaseline()),
      setItemError: new Error('disk full'),
    });
    const client = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
    const next = client.demoScenario!.getQaState();
    next.simulations.stores = 'loading';

    await expect(client.demoScenario!.setQaState(next)).resolves.toEqual({ status: 'degraded' });
    expect(client.demoScenario!.getQaState().simulations.stores).toBe('loading');
  });

  it('persiste senha redefinida e passa a exigir a nova senha no próximo login', async () => {
    const storage = memoryStorage();
    const client = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
    await client.auth.requestPasswordReset('ana.souza@example.com', { delayMs: 0 });
    await client.auth.establishPasswordRecoverySession('com.keepithub.cliente://auth/reset', { delayMs: 0 });
    await client.auth.updatePassword('novaSenha9', { delayMs: 0 });
    await client.auth.signOut({ delayMs: 0 });
    await client.demoScenario!.flush();

    __resetDataClientForTests();
    const reopened = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
    await expect(reopened.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 })).rejects.toThrow();
    await expect(
      reopened.auth.signIn('ana.souza@example.com', 'novaSenha9', { delayMs: 0 }),
    ).resolves.toMatchObject({ id: 'cliente-ana' });
  });

  it('persiste perfil e pedido criado após reabertura', async () => {
    const storage = memoryStorage();
    const client = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
    await client.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 });
    await client.auth.updateProfile('cliente-ana', { nome: 'Ana Persistida' }, { delayMs: 0 });
    const created = await client.order.create(
      {
        cliente_id: 'cliente-ana',
        estabelecimento_id: 'estab-farmacia-vida',
        hub_id: 'hub-centro',
        itens: [
          {
            produto_id: 'produto-dipirona',
            nome_snapshot: 'Dipirona Monoidratada 500mg',
            preco_unitario_reais: 14.9,
            quantidade: 2,
          },
        ],
        forma_pagamento: 'pix',
        subtotal_produtos_reais: 29.8,
        taxa_deslocamento_reais: 5,
        taxa_keepit_reais: 3.58,
        taxa_servico_comprador_reais: 1.99,
        total_pago_reais: 40.37,
        nf_solicitada: false,
      },
      { delayMs: 0 },
    );
    await client.demoScenario!.flush();

    __resetDataClientForTests();
    const reopened = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
    await expect(reopened.auth.getById('cliente-ana', { delayMs: 0 })).resolves.toMatchObject({
      nome: 'Ana Persistida',
    });
    await expect(reopened.order.listMine('cliente-ana', { delayMs: 0 })).resolves.toEqual([
      expect.objectContaining({ id: created.id, total_pago_reais: 40.37 }),
    ]);
  });

  it('mantém operações de auth e pedido pendentes até a escrita correspondente terminar', async () => {
    const values = new Map([[CLIENTE_MOCK_STATE_KEY, JSON.stringify(createClienteBaseline())]]);
    let writeStarted = deferred<void>();
    let releaseWrite = deferred<void>();
    const storage: ClienteMockStorage = {
      async getItem(key) {
        return values.get(key) ?? null;
      },
      async setItem(key, value) {
        writeStarted.resolve(undefined);
        await releaseWrite.promise;
        values.set(key, value);
      },
      async removeItem(key) {
        values.delete(key);
      },
    };
    const client = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });

    let authSettled = false;
    const signIn = client.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 });
    void signIn.then(
      () => {
        authSettled = true;
      },
      () => {
        authSettled = true;
      },
    );
    await writeStarted.promise;
    expect(authSettled).toBe(false);
    releaseWrite.resolve(undefined);
    await signIn;

    writeStarted = deferred<void>();
    releaseWrite = deferred<void>();
    let orderSettled = false;
    const createOrder = client.order.create(
      {
        cliente_id: 'cliente-ana',
        estabelecimento_id: 'estab-farmacia-vida',
        hub_id: 'hub-centro',
        itens: [
          {
            produto_id: 'produto-dipirona',
            nome_snapshot: 'Dipirona Monoidratada 500mg',
            preco_unitario_reais: 14.9,
            quantidade: 2,
          },
        ],
        forma_pagamento: 'pix',
        subtotal_produtos_reais: 29.8,
        taxa_deslocamento_reais: 5,
        taxa_keepit_reais: 3.58,
        taxa_servico_comprador_reais: 1.99,
        total_pago_reais: 40.37,
        nf_solicitada: false,
      },
      { delayMs: 0 },
    );
    void createOrder.then(
      () => {
        orderSettled = true;
      },
      () => {
        orderSettled = true;
      },
    );
    await writeStarted.promise;
    expect(orderSettled).toBe(false);
    releaseWrite.resolve(undefined);
    await createOrder;
  });

  it('reset restaura baseline e publica status sem propagar falha de storage', async () => {
    const storage = memoryStorage({ setItemError: new Error('disk full') });
    const client = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });

    await client.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 });
    const qa = client.demoScenario!.getQaState();
    qa.simulations.search = 'error';
    await client.demoScenario!.setQaState(qa);
    await expect(client.demoScenario!.reset()).resolves.toEqual({ status: 'degraded' });

    await expect(client.auth.currentUser({ delayMs: 0 })).resolves.toBeNull();
    expect(client.demoScenario!.getQaState().simulations).toEqual({
      orders: 'normal',
      stores: 'normal',
      hubs: 'normal',
      favorites: 'normal',
      profile: 'normal',
      search: 'normal',
    });
    expect(client.demoScenario!.getStatus()).toMatchObject({
      hydrated: true,
      persistence: 'degraded',
      lastError: 'reset',
    });
  });

  it('reset emite logout aos listeners e invalida a recuperação de senha ativa', async () => {
    const storage = memoryStorage({ initialValue: JSON.stringify(createClienteBaseline()) });
    const client = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
    await client.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 });
    await client.auth.requestPasswordReset('ana.souza@example.com', { delayMs: 0 });
    await client.auth.establishPasswordRecoverySession('com.keepithub.cliente://auth/reset', { delayMs: 0 });

    const authEvents: Array<string | null> = [];
    let resolveInitialAuth!: () => void;
    const initialAuth = new Promise<void>((resolve) => {
      resolveInitialAuth = resolve;
    });
    const unsubscribe = client.auth.onAuthStateChange((cliente) => {
      authEvents.push(cliente?.id ?? null);
      resolveInitialAuth();
    });
    await initialAuth;
    expect(authEvents).toEqual(['cliente-ana']);
    authEvents.length = 0;

    await client.demoScenario!.reset();

    expect(authEvents).toEqual([null]);
    await expect(client.auth.updatePassword('senha-invalida', { delayMs: 0 })).rejects.toThrow(
      'Nenhuma sessão de recuperação ativa',
    );
    unsubscribe();
  });

  it('mantém o baseline utilizável e expõe falha de leitura', async () => {
    const storage = memoryStorage({ getItemError: new Error('read failed') });

    const client = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });

    expect(client.demoScenario!.getStatus()).toEqual({
      hydrated: true,
      persistence: 'degraded',
      lastError: 'read',
    });
    await expect(client.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 })).resolves.toMatchObject({
      id: 'cliente-ana',
    });
  });

  it('reset remove contas e pedidos Cliente criados na sessão sem tocar dados auxiliares ou do Lojista', async () => {
    const db = createMockDb();
    const storage = memoryStorage();
    const stateStore = new ClienteMockStateStore(db, storage);
    const pedidoClienteTemplate = structuredClone(db.pedidos.find((item) => item.cliente_id === 'cliente-ana')!);
    await stateStore.hydrate();
    const auth = createAuthMock(db);
    const orders = createOrderMock(db);
    const auxiliar = structuredClone(db.clientes.find((cliente) => cliente.id === 'lj-cliente-thiago')!);
    const pedidoAuxiliar = structuredClone(db.pedidos.find((pedido) => pedido.cliente_id === auxiliar.id)!);
    const lojistaContas = structuredClone(db.lojistaContas);
    const estabelecimentosCadastrados = structuredClone(db.estabelecimentosCadastrados);

    const created = await auth.signUp(
      { nome: 'Cliente Efêmero', email: 'efemero@example.com', senha: 'senha1234', telefone: null },
      { delayMs: 0 },
    );
    const credential = db.clienteCredenciais.find((item) => item.clienteId === created.id)!;
    credential.password = 'senha1234';
    const pedido = structuredClone(pedidoClienteTemplate);
    pedido.id = 'pedido-efemero';
    pedido.cliente_id = created.id;
    db.pedidos.push(pedido);
    await stateStore.persist();

    await stateStore.reset();

    await expect(auth.signIn('efemero@example.com', 'senha1234', { delayMs: 0 })).rejects.toThrow();
    await expect(orders.listMine(created.id, { delayMs: 0 })).resolves.toEqual([]);
    expect(db.clientes.find((cliente) => cliente.id === auxiliar.id)).toEqual(auxiliar);
    expect(db.pedidos.find((item) => item.id === pedidoAuxiliar.id)).toEqual(pedidoAuxiliar);
    expect(db.lojistaContas).toEqual(lojistaContas);
    expect(db.estabelecimentosCadastrados).toEqual(estabelecimentosCadastrados);
  });

  it('aceita snapshot válido com propriedades em outra ordem sem tentar regravá-lo', async () => {
    const baseline = createClienteBaseline();
    const reordered = JSON.stringify({
      qa: baseline.qa,
      accountDeletion: baseline.accountDeletion,
      selectedHubId: baseline.selectedHubId,
      favoriteStoreIds: baseline.favoriteStoreIds,
      favoriteHubIds: baseline.favoriteHubIds,
      orders: baseline.orders,
      sessionClienteId: baseline.sessionClienteId,
      accounts: baseline.accounts,
      schemaVersion: baseline.schemaVersion,
    });
    const storage = memoryStorage({ initialValue: reordered, setItemError: new Error('unexpected write') });

    const client = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });

    await client.demoScenario!.flush();

    expect(client.demoScenario!.getStatus()).toEqual({
      hydrated: true,
      persistence: 'ready',
      lastError: null,
    });
    expect(storage.peek(CLIENTE_MOCK_STATE_KEY)).toBe(reordered);
  });

  it('substitui payload incompatível pelo baseline completo no storage', async () => {
    const storage = memoryStorage({ initialValue: JSON.stringify({ schemaVersion: 999 }) });

    await initializeDataClient({ source: 'mock', clienteMockStorage: storage });

    expect(JSON.parse(storage.peek(CLIENTE_MOCK_STATE_KEY)!)).toEqual(createClienteBaseline());
  });

  it('executa uma escrita posterior depois de uma rejeição na fila', async () => {
    const storage = memoryStorage({ setItemErrors: [new Error('first write failed')] });
    const client = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
    expect(client.demoScenario!.getStatus()).toMatchObject({ persistence: 'degraded', lastError: 'write' });

    await client.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 });
    await client.demoScenario!.flush();

    expect(client.demoScenario!.getStatus()).toMatchObject({ persistence: 'ready', lastError: null });
    expect(JSON.parse(storage.peek(CLIENTE_MOCK_STATE_KEY)!)).toEqual({
      ...createClienteBaseline(),
      sessionClienteId: 'cliente-ana',
    });
  });

  it('não oferece cenário mock no datasource supabase', () => {
    expect(createDataClient({ source: 'supabase' }).demoScenario).toBeUndefined();
  });
});
