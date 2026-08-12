import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Testes de `dataClientBootstrap.ts` — Story 3.2 (Dependencies, item 4). O
 * módulo sob teste tem efeito colateral na avaliação (roda no top-level, não
 * numa função exportada) — por isso cada teste usa `vi.resetModules()` +
 * `await import(...)` dinâmico, mesmo padrão de
 * `apps/cliente/src/lib/dataClientBootstrap.test.ts` (Story 2.5.1).
 */

const asyncStorageMock = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: asyncStorageMock,
}));

const createClientMock = vi.fn();
vi.mock('@keepit/supabase-client', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

const getDataClientMock = vi.fn();
vi.mock('@keepit/core-data', () => ({
  getDataClient: (...args: unknown[]) => getDataClientMock(...args),
}));

describe('dataClientBootstrap (Lojista)', () => {
  const originalDataSource = process.env.EXPO_PUBLIC_DATA_SOURCE;

  beforeEach(() => {
    vi.resetModules();
    createClientMock.mockReset();
    getDataClientMock.mockReset();
    asyncStorageMock.getItem.mockReset();
    asyncStorageMock.setItem.mockReset();
    asyncStorageMock.removeItem.mockReset();
  });

  afterEach(() => {
    if (originalDataSource === undefined) {
      delete process.env.EXPO_PUBLIC_DATA_SOURCE;
    } else {
      process.env.EXPO_PUBLIC_DATA_SOURCE = originalDataSource;
    }
  });

  it('modo mock (default seguro): não cria client Supabase nem chama getDataClient', async () => {
    delete process.env.EXPO_PUBLIC_DATA_SOURCE;

    await import('./dataClientBootstrap');

    expect(createClientMock).not.toHaveBeenCalled();
    expect(getDataClientMock).not.toHaveBeenCalled();
  });

  it('EXPO_PUBLIC_DATA_SOURCE com valor diferente de "supabase" também continua em modo mock', async () => {
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'mock';

    await import('./dataClientBootstrap');

    expect(createClientMock).not.toHaveBeenCalled();
    expect(getDataClientMock).not.toHaveBeenCalled();
  });

  it('EXPO_PUBLIC_DATA_SOURCE=supabase: cria o client com AsyncStorage/persistSession/autoRefreshToken e injeta em getDataClient, sem passwordRecoveryState (exclusivo do Cliente)', async () => {
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'supabase';
    createClientMock.mockReturnValue('fake-supabase-client');

    await import('./dataClientBootstrap');

    expect(createClientMock).toHaveBeenCalledTimes(1);
    const [options] = createClientMock.mock.calls[0] as [
      { storage: unknown; persistSession: boolean; autoRefreshToken: boolean },
    ];
    expect(options.storage).toBeDefined();
    expect(options.persistSession).toBe(true);
    expect(options.autoRefreshToken).toBe(true);

    expect(getDataClientMock).toHaveBeenCalledWith({
      source: 'supabase',
      supabaseClient: 'fake-supabase-client',
    });
  });

  it('falha ao criar o client Supabase degrada para mock sem lançar (sem tela branca no boot)', async () => {
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'supabase';
    createClientMock.mockImplementation(() => {
      throw new Error('EXPO_PUBLIC_SUPABASE_URL ausente');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(import('./dataClientBootstrap')).resolves.toBeDefined();

    expect(getDataClientMock).toHaveBeenCalledWith({ source: 'mock' });
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});
