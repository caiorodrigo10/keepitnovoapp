import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearCartState, loadCartState, saveCartState, type PersistedCartState } from './cartStorage';

/**
 * Segue o MESMO padrão de `onboardingFlag.test.ts` (Story 2.1): AsyncStorage
 * mockado in-memory via `vi.mock`, sem harness de teste de hook React (ver
 * JSDoc de `cartRules.test.ts` para o gap de infra já documentado).
 */
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

const mockedStorage = vi.mocked(AsyncStorage, true);

const SAMPLE_STATE: PersistedCartState = {
  estabelecimentoId: 'estab-1',
  items: [{ produtoId: 'produto-1', nome: 'Protetor solar FPS 50', precoSnapshotReais: 39.9, quantidade: 2 }],
  hubId: 'hub-1',
  payment: { type: 'pix' },
};

describe('cartStorage (Story 6.1, AC3)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('loadCartState', () => {
    it('retorna null quando nada foi salvo (getItem resolve null)', async () => {
      mockedStorage.getItem.mockResolvedValue(null);

      await expect(loadCartState()).resolves.toBeNull();
    });

    it('retorna o estado salvo quando o JSON é válido', async () => {
      mockedStorage.getItem.mockResolvedValue(JSON.stringify(SAMPLE_STATE));

      await expect(loadCartState()).resolves.toEqual(SAMPLE_STATE);
    });

    it('fail-open: JSON corrompido retorna null, não lança', async () => {
      mockedStorage.getItem.mockResolvedValue('{ isso não é json válido');

      await expect(loadCartState()).resolves.toBeNull();
    });

    it('fail-open: payload com shape inesperado retorna null', async () => {
      mockedStorage.getItem.mockResolvedValue(JSON.stringify({ foo: 'bar' }));

      await expect(loadCartState()).resolves.toBeNull();
    });

    it('fail-open: erro na leitura do storage retorna null, não propaga exceção', async () => {
      mockedStorage.getItem.mockRejectedValue(new Error('storage indisponível'));

      await expect(loadCartState()).resolves.toBeNull();
    });
  });

  describe('saveCartState', () => {
    it('grava o estado serializado sob a mesma chave', async () => {
      mockedStorage.setItem.mockResolvedValue(undefined);

      await expect(saveCartState(SAMPLE_STATE)).resolves.toEqual({ status: 'saved' });

      expect(mockedStorage.setItem).toHaveBeenCalledWith(expect.any(String), JSON.stringify(SAMPLE_STATE));
    });

    it('torna observável a falha de escrita sem propagar exceção', async () => {
      mockedStorage.setItem.mockRejectedValue(new Error('storage indisponível'));

      await expect(saveCartState(SAMPLE_STATE)).resolves.toEqual({ status: 'failed' });
    });

    it('faz round-trip do snapshot salvo sem outra fonte de estado', async () => {
      let persisted: string | null = null;
      mockedStorage.setItem.mockImplementation(async (_key, value) => {
        persisted = value;
      });
      mockedStorage.getItem.mockImplementation(async () => persisted);
      const switched: PersistedCartState = {
        estabelecimentoId: 'loja-b',
        hubId: 'hub-a',
        payment: null,
        items: [{ produtoId: 'p-b', nome: 'Item B', precoSnapshotReais: 20, quantidade: 1 }],
      };

      await expect(saveCartState(switched)).resolves.toEqual({ status: 'saved' });
      await expect(loadCartState()).resolves.toEqual(switched);
    });
  });

  describe('clearCartState', () => {
    it('remove a chave do carrinho', async () => {
      mockedStorage.removeItem.mockResolvedValue(undefined);

      await expect(clearCartState()).resolves.toEqual({ status: 'cleared' });

      expect(mockedStorage.removeItem).toHaveBeenCalledWith('@keepit/cliente:carrinho');
    });

    it('fail-open: erro na remoção retorna degradação observável', async () => {
      mockedStorage.removeItem.mockRejectedValue(new Error('storage indisponível'));

      await expect(clearCartState()).resolves.toEqual({ status: 'degraded' });
    });
  });
});
