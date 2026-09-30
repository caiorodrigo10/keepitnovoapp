import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Testes de `dataClientBootstrap.ts` — Story 2.5.1 (AC4). O módulo sob teste
 * tem efeito colateral na avaliação (roda no top-level, não numa função
 * exportada) — por isso cada teste usa `vi.resetModules()` +
 * `await import(...)` dinâmico para reavaliar o módulo do zero com o
 * ambiente/mocks daquele teste. Mesmo padrão de mock de dependência RN já
 * usado em `onboardingFlag.test.ts`.
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
  resolveDataMode: (value: string | undefined) => {
    const normalized = value?.trim();
    if (normalized === 'mock' || normalized === 'supabase') return normalized;
    throw new Error('DATA_SOURCE_INVALIDO');
  },
}));

describe('dataClientBootstrap', () => {
  const originalDataSource = process.env.EXPO_PUBLIC_DATA_SOURCE;

  beforeEach(() => {
    vi.resetModules();
    createClientMock.mockReset();
    initializeDataClientMock.mockReset();
    initializeDataClientMock.mockResolvedValue('mock-client');
    recoverDataClientMock.mockReset();
    recoverDataClientMock.mockResolvedValue('recovered-mock-client');
    asyncStorageMock.getItem.mockReset();
    asyncStorageMock.setItem.mockReset();
    asyncStorageMock.removeItem.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalDataSource === undefined) {
      delete process.env.EXPO_PUBLIC_DATA_SOURCE;
    } else {
      process.env.EXPO_PUBLIC_DATA_SOURCE = originalDataSource;
    }
  });

  it('modo mock explícito injeta AsyncStorage e expõe uma promessa de hidratação', async () => {
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'mock';

    const module = await import('./dataClientBootstrap');

    await expect(module.dataClientReady).resolves.toBe('mock-client');
    expect(createClientMock).not.toHaveBeenCalled();
    expect(initializeDataClientMock).toHaveBeenCalledWith({
      source: 'mock',
      clienteMockStorage: expect.objectContaining({
        getItem: expect.any(Function),
        setItem: expect.any(Function),
        removeItem: expect.any(Function),
      }),
    });
  });

  it('ausência de modo rejeita o bootstrap sem inicializar demo', async () => {
    delete process.env.EXPO_PUBLIC_DATA_SOURCE;

    const module = await import('./dataClientBootstrap');

    await expect(module.dataClientReady).rejects.toThrow('DATA_SOURCE_INVALIDO');
    expect(createClientMock).not.toHaveBeenCalled();
    expect(initializeDataClientMock).not.toHaveBeenCalled();
    expect(recoverDataClientMock).not.toHaveBeenCalled();
  });

  it('EXPO_PUBLIC_DATA_SOURCE=supabase: cria o client móvel em PKCE persistente e aguarda sua inicialização', async () => {
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'supabase';
    createClientMock.mockReturnValue('fake-supabase-client');
    initializeDataClientMock.mockResolvedValue('supabase-client');

    const module = await import('./dataClientBootstrap');

    await expect(module.dataClientReady).resolves.toBe('supabase-client');
    expect(createClientMock).toHaveBeenCalledTimes(1);
    const [options] = createClientMock.mock.calls[0] as [
      { storage: unknown; persistSession: boolean; autoRefreshToken: boolean; flowType: string },
    ];
    expect(options.storage).toBeDefined();
    expect(options.persistSession).toBe(true);
    expect(options.autoRefreshToken).toBe(true);
    expect(options.flowType).toBe('pkce');

    expect(initializeDataClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'supabase',
        supabaseClient: 'fake-supabase-client',
      }),
    );
  });

  it('Story 2.7 (AC5): injeta um passwordRecoveryState apoiado em AsyncStorage, sem tocar token/senha', async () => {
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'supabase';
    createClientMock.mockReturnValue('fake-supabase-client');
    asyncStorageMock.getItem.mockResolvedValue('true');

    await import('./dataClientBootstrap');

    const [options] = initializeDataClientMock.mock.calls[0] as [
      { passwordRecoveryState: { isActive(): Promise<boolean>; activate(): Promise<void>; clear(): Promise<void> } },
    ];
    const { passwordRecoveryState } = options;

    await expect(passwordRecoveryState.isActive()).resolves.toBe(true);
    expect(asyncStorageMock.getItem).toHaveBeenCalledWith('@keepit/auth/password-recovery-active');

    await passwordRecoveryState.activate();
    expect(asyncStorageMock.setItem).toHaveBeenCalledWith('@keepit/auth/password-recovery-active', 'true');

    await passwordRecoveryState.clear();
    expect(asyncStorageMock.removeItem).toHaveBeenCalledWith('@keepit/auth/password-recovery-active');
  });

  it('falha ao criar o Supabase rejeita sem recuperar em mock', async () => {
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'supabase';
    createClientMock.mockImplementation(() => {
      throw new Error('EXPO_PUBLIC_SUPABASE_URL ausente');
    });
    const module = await import('./dataClientBootstrap');

    await expect(module.dataClientReady).rejects.toThrow('EXPO_PUBLIC_SUPABASE_URL ausente');
    expect(recoverDataClientMock).not.toHaveBeenCalled();
  });

  it('retry do modo real recupera somente em Supabase', async () => {
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'supabase';
    createClientMock.mockReturnValue('fake-supabase-client');
    const module = await import('./dataClientBootstrap');
    await module.dataClientReady;
    recoverDataClientMock.mockReset();
    recoverDataClientMock.mockResolvedValue('recovered-supabase-client');

    await expect(module.bootstrapDataClient({ recover: true })).resolves.toBe(
      'recovered-supabase-client',
    );
    expect(recoverDataClientMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'supabase' }),
    );
    expect(recoverDataClientMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ source: 'mock' }),
    );
  });
});
