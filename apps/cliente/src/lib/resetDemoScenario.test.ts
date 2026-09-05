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
  const reset = vi.fn().mockResolvedValue({ status: 'reset' });
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
    const clearOrders = vi.fn();
    const options = { clearOrders };

    await expect(resetDemoScenario(client, false, options)).resolves.toEqual({ status: 'cancelled' });

    expect(reset).not.toHaveBeenCalled();
    expect(asyncStorageMock.removeItem).not.toHaveBeenCalled();
    expect(clearOrders).not.toHaveBeenCalled();
  });

  it('reseta core-data e carrinho quando confirmado', async () => {
    const { client, reset } = createFakeClient();

    await expect(resetDemoScenario(client, true)).resolves.toEqual({ status: 'reset' });

    expect(reset).toHaveBeenCalledOnce();
    expect(asyncStorageMock.removeItem).toHaveBeenCalledWith('@keepit/cliente:carrinho');
  });

  it('retorna degradação quando o snapshot do cenário não pode ser persistido', async () => {
    const { client, reset } = createFakeClient();
    reset.mockResolvedValue({ status: 'degraded' });
    asyncStorageMock.removeItem.mockResolvedValue(undefined);

    await expect(resetDemoScenario(client, true)).resolves.toEqual({
      status: 'degraded',
      failures: ['scenario-persistence'],
    });
  });

  it('retorna degradação quando o carrinho persistido não pode ser removido', async () => {
    const { client } = createFakeClient();
    asyncStorageMock.removeItem.mockRejectedValue(new Error('storage indisponível'));

    await expect(resetDemoScenario(client, true)).resolves.toEqual({
      status: 'degraded',
      failures: ['cart-persistence'],
    });
  });

  it('informa degradação quando a limpeza viva falha', async () => {
    const { client } = createFakeClient();
    asyncStorageMock.removeItem.mockResolvedValue(undefined);

    await expect(
      resetDemoScenario(client, true, {
        clearLiveCart: vi.fn().mockRejectedValue(new Error('provider indisponível')),
      }),
    ).resolves.toEqual({ status: 'degraded', failures: ['cart-live-state'] });
  });

  it('informa degradação quando o CartProvider preserva o snapshot após falha de persistência', async () => {
    const { client } = createFakeClient();
    asyncStorageMock.removeItem.mockResolvedValue(undefined);

    await expect(
      resetDemoScenario(client, true, {
        clearLiveCart: vi.fn().mockResolvedValue({
          status: 'persistence_error',
          state: {
            estabelecimentoId: 'loja-a',
            hubId: 'hub-a',
            payment: { type: 'pix' },
            items: [{ produtoId: 'p-a', nome: 'Item A', precoSnapshotReais: 10, quantidade: 1 }],
          },
        }),
      }),
    ).resolves.toEqual({ status: 'degraded', failures: ['cart-live-state'] });
  });

  it('aguarda o reset do cenário antes de limpar carrinho persistido e estado vivo', async () => {
    let resolveReset!: (value: { status: 'reset' }) => void;
    const resetPending = new Promise<{ status: 'reset' }>((resolve) => {
      resolveReset = resolve;
    });
    const { client, reset } = createFakeClient();
    reset.mockReturnValue(resetPending);
    asyncStorageMock.removeItem.mockResolvedValue(undefined);
    const clearLiveCart = vi.fn();
    const clearOrders = vi.fn();
    const options = { clearLiveCart, clearOrders };

    const result = resetDemoScenario(client, true, options);
    await Promise.resolve();

    expect(asyncStorageMock.removeItem).not.toHaveBeenCalled();
    expect(clearLiveCart).not.toHaveBeenCalled();
    expect(clearOrders).not.toHaveBeenCalled();

    resolveReset({ status: 'reset' });
    await expect(result).resolves.toEqual({ status: 'reset' });
    expect(asyncStorageMock.removeItem).toHaveBeenCalledWith('@keepit/cliente:carrinho');
    expect(clearLiveCart).toHaveBeenCalledOnce();
    expect(clearOrders).toHaveBeenCalledOnce();
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
