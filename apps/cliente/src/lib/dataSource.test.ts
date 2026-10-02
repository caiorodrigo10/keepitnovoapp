import { afterEach, describe, expect, it } from 'vitest';

import { isSupabaseDataSource, isMockDataSource } from './dataSource';

/**
 * Testes de `dataSource.ts` — Story 6.6. Mesmo gate
 * (`EXPO_PUBLIC_DATA_SOURCE`) já testado em `dataClientBootstrap.test.ts`,
 * aqui isolado como função pura (sem efeito colateral de importação) —
 * mesmo padrão de `apps/lojista/src/lib/dataSource.test.ts`.
 */
describe('isSupabaseDataSource', () => {
  const originalDataSource = process.env.EXPO_PUBLIC_DATA_SOURCE;
  const originalAppEnv = process.env.EXPO_PUBLIC_APP_ENV;

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

  it('simulação exige declaração mock explícita', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'qa';
    delete process.env.EXPO_PUBLIC_DATA_SOURCE;
    expect(() => isMockDataSource()).toThrow('DATA_SOURCE_INVALIDO');
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'supabase'; expect(isMockDataSource()).toBe(false);
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'mock'; expect(isMockDataSource()).toBe(true);
  });

  it('rejeita fonte ausente em ambiente de produção', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    delete process.env.EXPO_PUBLIC_DATA_SOURCE;
    expect(() => isSupabaseDataSource()).toThrow('DATA_SOURCE_INVALIDO');
  });

  it('false para qualquer valor diferente de "supabase"', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'qa';
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'mock';
    expect(isSupabaseDataSource()).toBe(false);
  });

  it('true só quando EXPO_PUBLIC_DATA_SOURCE=supabase', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'supabase';
    expect(isSupabaseDataSource()).toBe(true);
  });

  it('tolera espaços em branco ao redor do valor', () => {
    process.env.EXPO_PUBLIC_DATA_SOURCE = '  supabase  ';
    expect(isSupabaseDataSource()).toBe(true);
  });

  it('rejeita mock em ambiente de produção', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'mock';

    expect(() => isMockDataSource()).toThrow('DATA_SOURCE_MOCK_EM_PRODUCAO');
    expect(() => isSupabaseDataSource()).toThrow('DATA_SOURCE_MOCK_EM_PRODUCAO');
  });
});
