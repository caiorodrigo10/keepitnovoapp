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

  it('reset restaura baseline e publica status sem propagar falha de storage', async () => {
    const storage = memoryStorage({ setItemError: new Error('disk full') });
    const client = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });

    await client.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 });
    await expect(client.demoScenario!.reset()).resolves.toBeUndefined();

    await expect(client.auth.currentUser({ delayMs: 0 })).resolves.toBeNull();
    expect(client.demoScenario!.getStatus()).toMatchObject({
      hydrated: true,
      persistence: 'degraded',
      lastError: 'reset',
    });
  });

  it('mantém o baseline utilizável e expõe falha de leitura', async () => {
    const storage = memoryStorage({ getItemError: new Error('read failed') });

    const client = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });

    await expect(client.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 })).resolves.toMatchObject({
      id: 'cliente-ana',
    });
    expect(client.demoScenario!.getStatus()).toEqual({
      hydrated: true,
      persistence: 'degraded',
      lastError: 'read',
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

    await client.demoScenario!.flush();

    expect(client.demoScenario!.getStatus()).toMatchObject({ persistence: 'ready', lastError: null });
    expect(JSON.parse(storage.peek(CLIENTE_MOCK_STATE_KEY)!)).toEqual(createClienteBaseline());
  });

  it('não oferece cenário mock no datasource supabase', () => {
    expect(createDataClient({ source: 'supabase' }).demoScenario).toBeUndefined();
  });
});
