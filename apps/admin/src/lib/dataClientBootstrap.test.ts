import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();
vi.mock('@keepit/supabase-client', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

const initializeDataClientMock = vi.fn();
const recoverDataClientMock = vi.fn();
vi.mock('@keepit/core-data', () => ({
  initializeDataClient: (...args: unknown[]) => initializeDataClientMock(...args),
  recoverDataClient: (...args: unknown[]) => recoverDataClientMock(...args),
  resolveDataMode: (value: string | undefined) => {
    const normalized = value?.trim();
    if (normalized === 'mock' || normalized === 'supabase') return normalized;
    throw new Error('DATA_SOURCE_INVALIDO');
  },
}));

describe('dataClientBootstrap (Admin)', () => {
  const originalDataSource = process.env.DATA_SOURCE;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    createClientMock.mockReset();
    initializeDataClientMock.mockReset();
    initializeDataClientMock.mockResolvedValue('data-client');
    recoverDataClientMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalDataSource === undefined) delete process.env.DATA_SOURCE;
    else process.env.DATA_SOURCE = originalDataSource;
  });

  it('pode ser importado no SSR sem acessar window nem criar cliente', async () => {
    process.env.DATA_SOURCE = 'supabase';

    const module = await import('./dataClientBootstrap');

    expect(module).toBeDefined();
    expect(createClientMock).not.toHaveBeenCalled();
    expect(initializeDataClientMock).not.toHaveBeenCalled();
  });

  it('duas chamadas reutilizam a instância usada pelo DataClient e pela autenticação', async () => {
    process.env.DATA_SOURCE = 'supabase';
    vi.stubGlobal('window', {});
    const supabaseClientA = { id: 'supabase-a' };
    const supabaseClientB = { id: 'supabase-b' };
    const dataClient = { adapterClient: supabaseClientA };
    createClientMock
      .mockReturnValueOnce(supabaseClientA)
      .mockReturnValueOnce(supabaseClientB);
    let resolveInitialization!: (value: typeof dataClient) => void;
    initializeDataClientMock.mockReturnValue(
      new Promise((resolve) => {
        resolveInitialization = resolve;
      }),
    );
    const module = await import('./dataClientBootstrap');

    const firstInitialization = module.bootstrapAdminDataClient();
    const secondInitialization = module.bootstrapAdminDataClient();

    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(initializeDataClientMock).toHaveBeenCalledTimes(1);
    resolveInitialization(dataClient);
    const [first, second] = await Promise.all([firstInitialization, secondInitialization]);

    expect(first).toBe(dataClient);
    expect(second).toBe(dataClient);
    expect(initializeDataClientMock).toHaveBeenCalledWith({
      source: 'supabase',
      supabaseClient: supabaseClientA,
    });
    expect(module.getAdminSupabaseClient()).toBe(supabaseClientA);
  });

  it('falha real no browser rejeita sem recuperar em mock', async () => {
    process.env.DATA_SOURCE = 'supabase';
    vi.stubGlobal('window', {});
    createClientMock.mockImplementation(() => {
      throw new Error('SUPABASE_URL ausente');
    });

    const module = await import('./dataClientBootstrap');

    await expect(module.bootstrapAdminDataClient()).rejects.toThrow('SUPABASE_URL ausente');
    expect(recoverDataClientMock).not.toHaveBeenCalled();
  });
});
