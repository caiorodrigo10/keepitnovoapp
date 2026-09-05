import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetDataClientForTests,
  initializeDataClient,
  type ClienteMockStorage,
} from '../index';
import { CLIENTE_MOCK_STATE_KEY, createClienteBaseline } from './cliente-state';

const NOW = Date.parse('2026-09-05T12:00:00.000Z');
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;

interface MemoryStorage extends ClienteMockStorage {
  peek(): string | null;
}

function memoryStorage(initial = JSON.stringify(createClienteBaseline())): MemoryStorage {
  let value: string | null = initial;
  return {
    async getItem(key) {
      return key === CLIENTE_MOCK_STATE_KEY ? value : null;
    },
    async setItem(key, next) {
      if (key === CLIENTE_MOCK_STATE_KEY) value = next;
    },
    async removeItem(key) {
      if (key === CLIENTE_MOCK_STATE_KEY) value = null;
    },
    peek() {
      return value;
    },
  };
}

describe('account-deletion.mock', () => {
  beforeEach(() => {
    __resetDataClientForTests();
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetDataClientForTests();
  });

  it('exige sessão e a senha atual sem persistir tentativa inválida', async () => {
    const storage = memoryStorage();
    const client = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });

    await expect(client.accountDeletion.schedule('keepit123')).rejects.toThrow(/sessão/i);
    await client.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 });
    const before = storage.peek();

    await expect(client.accountDeletion.schedule('incorreta')).rejects.toThrow(/senha/i);
    await expect(client.accountDeletion.status()).resolves.toBeNull();
    expect(storage.peek()).toBe(before);
  });

  it('agenda sete dias exatos e repete schedule/cancel sem criar outro prazo', async () => {
    const client = await initializeDataClient({ source: 'mock', clienteMockStorage: memoryStorage() });
    await client.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 });

    const first = await client.accountDeletion.schedule('keepit123');
    const repeated = await client.accountDeletion.schedule('keepit123');

    expect(first).toEqual({
      status: 'scheduled',
      requestedAt: '2026-09-05T12:00:00.000Z',
      deleteAt: '2026-09-12T12:00:00.000Z',
    });
    expect(repeated).toEqual(first);

    const cancelled = await client.accountDeletion.cancel();
    await expect(client.accountDeletion.cancel()).resolves.toEqual(cancelled);
    expect(cancelled).toEqual({ ...first, status: 'cancelled' });
  });

  it('não anuncia schedule quando a persistência falha e permite retry limpo', async () => {
    let value: string | null = JSON.stringify(createClienteBaseline());
    let writes = 0;
    const storage: ClienteMockStorage = {
      async getItem() {
        return value;
      },
      async setItem(_key, next) {
        writes += 1;
        if (writes === 2) throw new Error('disk full');
        value = next;
      },
      async removeItem() {
        value = null;
      },
    };
    const client = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
    await client.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 });

    await expect(client.accountDeletion.schedule('keepit123')).rejects.toThrow(/persistir/i);
    await expect(client.accountDeletion.status()).resolves.toBeNull();
    await expect(client.accountDeletion.schedule('keepit123')).resolves.toMatchObject({ status: 'scheduled' });
  });

  it('persiste/reabre, conclui no relógio QA, bloqueia a credencial e o reset restaura Ana', async () => {
    const storage = memoryStorage();
    const first = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
    await first.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 });
    const scheduled = await first.accountDeletion.schedule('keepit123');
    await first.auth.signOut({ delayMs: 0 });
    await first.demoScenario!.flush();

    __resetDataClientForTests();
    const reopened = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
    await reopened.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 });
    await expect(reopened.accountDeletion.status()).resolves.toEqual(scheduled);

    await expect(reopened.demoScenario!.advanceClock(SEVEN_DAYS_MS)).resolves.toEqual({ status: 'updated' });
    await expect(reopened.accountDeletion.status()).resolves.toEqual({ ...scheduled, status: 'completed' });
    await expect(reopened.auth.currentUser({ delayMs: 0 })).resolves.toMatchObject({
      id: 'cliente-ana',
      bloqueado: true,
    });

    await reopened.auth.signOut({ delayMs: 0 });
    await expect(
      reopened.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 }),
    ).rejects.toThrow(/bloqueado/i);

    await expect(reopened.demoScenario!.reset()).resolves.toEqual({ status: 'reset' });
    await expect(
      reopened.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 }),
    ).resolves.toMatchObject({ id: 'cliente-ana', bloqueado: false });
    await expect(reopened.accountDeletion.status()).resolves.toBeNull();
  });
});
