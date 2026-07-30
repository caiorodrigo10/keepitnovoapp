import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getOnboardingVisto, resetOnboardingVisto, setOnboardingVisto } from './onboardingFlag';

/**
 * [IDS] CREATE — primeiro teste unitário de `apps/cliente`. Segue o padrão de
 * `packages/core-data` (vitest, describe/it, mocks via `vi.mock`). AsyncStorage
 * é mockado in-memory (via `vi.fn`) porque não há ambiente RN nos testes —
 * fora de escopo configurar testing-library/render aqui (ver Story de config
 * do runner de testes do cliente).
 */
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

const mockedStorage = vi.mocked(AsyncStorage, true);

describe('onboardingFlag', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getOnboardingVisto', () => {
    it('retorna false quando a flag nunca foi gravada (getItem resolve null)', async () => {
      mockedStorage.getItem.mockResolvedValue(null);

      await expect(getOnboardingVisto()).resolves.toBe(false);
    });

    it('retorna true quando a flag está gravada como "true"', async () => {
      mockedStorage.getItem.mockResolvedValue('true');

      await expect(getOnboardingVisto()).resolves.toBe(true);
    });

    it('fail-open: erro na leitura do storage retorna false, não propaga exceção', async () => {
      mockedStorage.getItem.mockRejectedValue(new Error('storage indisponível'));

      await expect(getOnboardingVisto()).resolves.toBe(false);
    });
  });

  describe('setOnboardingVisto', () => {
    it('grava a flag com valor "true"', async () => {
      mockedStorage.setItem.mockResolvedValue(undefined);

      await setOnboardingVisto();

      expect(mockedStorage.setItem).toHaveBeenCalledWith(expect.any(String), 'true');
    });

    it('fail-open: erro na escrita não propaga exceção', async () => {
      mockedStorage.setItem.mockRejectedValue(new Error('storage indisponível'));

      await expect(setOnboardingVisto()).resolves.toBeUndefined();
    });
  });

  describe('resetOnboardingVisto', () => {
    it('remove a chave da flag', async () => {
      mockedStorage.removeItem.mockResolvedValue(undefined);

      await resetOnboardingVisto();

      expect(mockedStorage.removeItem).toHaveBeenCalledWith(expect.any(String));
    });

    it('fail-open: erro no reset não propaga exceção', async () => {
      mockedStorage.removeItem.mockRejectedValue(new Error('storage indisponível'));

      await expect(resetOnboardingVisto()).resolves.toBeUndefined();
    });
  });
});
