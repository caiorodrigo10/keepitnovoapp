import { beforeEach, describe, expect, it } from 'vitest';

import {
  __resetDataClientForTests,
  createDataClient,
  initializeDataClient,
  type ClienteMockStorage,
} from '../index';

interface MemoryStorageOptions {
  getItemError?: Error;
  setItemError?: Error;
}

function memoryStorage(options: MemoryStorageOptions = {}): ClienteMockStorage {
  const values = new Map<string, string>();

  return {
    async getItem(key) {
      if (options.getItemError) throw options.getItemError;
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      if (options.setItemError) throw options.setItemError;
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
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

  it('não oferece cenário mock no datasource supabase', () => {
    expect(createDataClient({ source: 'supabase' }).demoScenario).toBeUndefined();
  });
});
