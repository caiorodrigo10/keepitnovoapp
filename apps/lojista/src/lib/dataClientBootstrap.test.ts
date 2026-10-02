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

const initializeDataClientMock = vi.fn();
const recoverDataClientMock = vi.fn();
vi.mock('@keepit/core-data', () => ({
  initializeDataClient: (...args: unknown[]) => initializeDataClientMock(...args),
  recoverDataClient: (...args: unknown[]) => recoverDataClientMock(...args),
  resolveDataMode: (value: string | undefined, environment?: string) => {
    const normalized = value?.trim();
    if (environment?.trim() === 'production' && normalized === 'mock') {
      throw new Error('DATA_SOURCE_MOCK_EM_PRODUCAO');
    }
    if (normalized === 'mock' || normalized === 'supabase') return normalized;
    throw new Error('DATA_SOURCE_INVALIDO');
  },
}));

describe('dataClientBootstrap (Lojista)', () => {
  const originalDataSource = process.env.EXPO_PUBLIC_DATA_SOURCE;
  const originalAppEnv = process.env.EXPO_PUBLIC_APP_ENV;

  beforeEach(() => {
    vi.resetModules();
    createClientMock.mockReset();
    initializeDataClientMock.mockReset();
    initializeDataClientMock.mockResolvedValue('data-client');
    recoverDataClientMock.mockReset();
    recoverDataClientMock.mockResolvedValue('recovered-data-client');
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
    if (originalAppEnv === undefined) {
      delete process.env.EXPO_PUBLIC_APP_ENV;
    } else {
      process.env.EXPO_PUBLIC_APP_ENV = originalAppEnv;
    }
  });

  it('modo mock precisa ser explícito e inicializa o DataClient', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'qa';
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'mock';

    const module = await import('./dataClientBootstrap');

    await expect(module.dataClientReady).resolves.toBe('data-client');
    expect(createClientMock).not.toHaveBeenCalled();
    expect(initializeDataClientMock).toHaveBeenCalledWith({ source: 'mock' });
  });

  it('rejeita modo mock em ambiente de produção sem inicializar demo', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'mock';

    const module = await import('./dataClientBootstrap');

    await expect(module.dataClientReady).rejects.toThrow('DATA_SOURCE_MOCK_EM_PRODUCAO');
    expect(createClientMock).not.toHaveBeenCalled();
    expect(initializeDataClientMock).not.toHaveBeenCalled();
  });

  it('ausência de modo rejeita sem autorizar demo', async () => {
    delete process.env.EXPO_PUBLIC_DATA_SOURCE;

    const module = await import('./dataClientBootstrap');

    await expect(module.dataClientReady).rejects.toThrow('DATA_SOURCE_INVALIDO');
    expect(createClientMock).not.toHaveBeenCalled();
    expect(initializeDataClientMock).not.toHaveBeenCalled();
    expect(recoverDataClientMock).not.toHaveBeenCalled();
  });

  it('EXPO_PUBLIC_DATA_SOURCE=supabase: cria o client com AsyncStorage/persistSession/autoRefreshToken e injeta em getDataClient, sem passwordRecoveryState (exclusivo do Cliente)', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'supabase';
    createClientMock.mockReturnValue('fake-supabase-client');

    const module = await import('./dataClientBootstrap');

    await module.dataClientReady;

    expect(createClientMock).toHaveBeenCalledTimes(1);
    const [options] = createClientMock.mock.calls[0] as [
      { storage: unknown; persistSession: boolean; autoRefreshToken: boolean },
    ];
    expect(options.storage).toBeDefined();
    expect(options.persistSession).toBe(true);
    expect(options.autoRefreshToken).toBe(true);

    expect(initializeDataClientMock).toHaveBeenCalledWith({
      source: 'supabase',
      supabaseClient: 'fake-supabase-client',
    });
  });

  it('falha ao criar o client Supabase rejeita sem recuperar em mock', async () => {
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'supabase';
    createClientMock.mockImplementation(() => {
      throw new Error('EXPO_PUBLIC_SUPABASE_URL ausente');
    });
    const module = await import('./dataClientBootstrap');

    await expect(module.dataClientReady).rejects.toThrow('EXPO_PUBLIC_SUPABASE_URL ausente');
    expect(recoverDataClientMock).not.toHaveBeenCalled();
  });

  it('observador de sessão reutiliza o mesmo client persistente dos adapters, inclusive no retry', async () => {
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'supabase';
    createClientMock.mockReturnValue('shared-auth-client');
    const module = await import('./dataClientBootstrap');
    await module.dataClientReady;
    expect(module.getLojistaSupabaseClient()).toBe('shared-auth-client');
    await module.bootstrapDataClient({ recover: true });
    expect(module.getLojistaSupabaseClient()).toBe('shared-auth-client');
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it('retry do modo real recupera somente em Supabase', async () => {
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'supabase';
    createClientMock.mockReturnValue('fake-supabase-client');
    const module = await import('./dataClientBootstrap');
    await module.dataClientReady;

    await module.bootstrapDataClient({ recover: true });

    expect(recoverDataClientMock).toHaveBeenCalledWith({
      source: 'supabase',
      supabaseClient: 'fake-supabase-client',
    });
    expect(recoverDataClientMock).not.toHaveBeenCalledWith({ source: 'mock' });
  });
});
