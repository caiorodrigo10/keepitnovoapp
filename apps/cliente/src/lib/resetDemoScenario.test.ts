import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DataClient } from '@keepit/core-data';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetDemoScenario } from './resetDemoScenario';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

const asyncStorageMock = vi.mocked(AsyncStorage, true);

function createFakeClient(): { client: DataClient; reset: ReturnType<typeof vi.fn> } {
  const reset = vi.fn().mockResolvedValue(undefined);
  return {
    client: { demoScenario: { reset } } as unknown as DataClient,
    reset,
  };
}

describe('resetDemoScenario', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('não altera nada sem confirmação explícita', async () => {
    const { client, reset } = createFakeClient();

    await expect(resetDemoScenario(client, false)).resolves.toEqual({ status: 'cancelled' });

    expect(reset).not.toHaveBeenCalled();
    expect(asyncStorageMock.removeItem).not.toHaveBeenCalled();
  });

  it('reseta core-data e carrinho quando confirmado', async () => {
    const { client, reset } = createFakeClient();

    await expect(resetDemoScenario(client, true)).resolves.toEqual({ status: 'reset' });

    expect(reset).toHaveBeenCalledOnce();
    expect(asyncStorageMock.removeItem).toHaveBeenCalledWith('@keepit/cliente:carrinho');
  });

  it('informa indisponibilidade fora do mock', async () => {
    const { client, reset } = createFakeClient();

    await expect(resetDemoScenario({ ...client, demoScenario: undefined }, true)).resolves.toEqual({
      status: 'unavailable',
    });

    expect(reset).not.toHaveBeenCalled();
    expect(asyncStorageMock.removeItem).not.toHaveBeenCalled();
  });
});
