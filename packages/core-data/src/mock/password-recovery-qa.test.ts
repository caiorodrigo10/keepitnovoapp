import { afterEach, describe, expect, it } from 'vitest';

import {
  __resetDataClientForTests,
  initializeDataClient,
  type ClienteMockStorage,
} from '../index';
import { CLIENTE_MOCK_STATE_KEY } from './cliente-state';

function memoryStorage(): ClienteMockStorage & { peek(): string | null } {
  const values = new Map<string, string>();

  return {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
    peek() {
      return values.get(CLIENTE_MOCK_STATE_KEY) ?? null;
    },
  };
}

describe('DemoScenarioPort — recuperação de senha expirada', () => {
  afterEach(() => {
    __resetDataClientForTests();
  });

  it('informa indisponível quando não existe solicitação pendente', async () => {
    const client = await initializeDataClient({ source: 'mock', clienteMockStorage: memoryStorage() });

    await expect(client.demoScenario!.expirePasswordRecovery()).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it('expira a solicitação corrente, persiste e rejeita o callback após restart', async () => {
    const storage = memoryStorage();
    const client = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
    const request = await client.auth.requestPasswordReset('ana.souza@example.com', { delayMs: 0 });
    if (request.delivery !== 'demo') throw new Error('O adapter mock deve devolver callback demo.');

    await expect(client.demoScenario!.expirePasswordRecovery()).resolves.toEqual({ status: 'expired' });
    await client.demoScenario!.flush();

    const persisted = JSON.parse(storage.peek()!);
    expect(persisted.passwordRecovery).toMatchObject({ state: 'expired' });

    __resetDataClientForTests();
    const reopened = await initializeDataClient({ source: 'mock', clienteMockStorage: storage });
    await expect(
      reopened.auth.establishPasswordRecoverySession(request.callbackUrl, { delayMs: 0 }),
    ).rejects.toThrow(/link inválido|sessão indisponível/i);
  });
});
