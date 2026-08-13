import { afterEach, describe, expect, it } from 'vitest';

import { isSupabaseDataSource } from './dataSource';

/**
 * Testes de `dataSource.ts` — Story 6.6. Mesmo gate
 * (`EXPO_PUBLIC_DATA_SOURCE`) já testado em `dataClientBootstrap.test.ts`,
 * aqui isolado como função pura (sem efeito colateral de importação) —
 * mesmo padrão de `apps/lojista/src/lib/dataSource.test.ts`.
 */
describe('isSupabaseDataSource', () => {
  const originalDataSource = process.env.EXPO_PUBLIC_DATA_SOURCE;

  afterEach(() => {
    if (originalDataSource === undefined) {
      delete process.env.EXPO_PUBLIC_DATA_SOURCE;
    } else {
      process.env.EXPO_PUBLIC_DATA_SOURCE = originalDataSource;
    }
  });

  it('false quando a env var está ausente (default seguro: mock)', () => {
    delete process.env.EXPO_PUBLIC_DATA_SOURCE;
    expect(isSupabaseDataSource()).toBe(false);
  });

  it('false para qualquer valor diferente de "supabase"', () => {
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'mock';
    expect(isSupabaseDataSource()).toBe(false);
  });

  it('true só quando EXPO_PUBLIC_DATA_SOURCE=supabase', () => {
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'supabase';
    expect(isSupabaseDataSource()).toBe(true);
  });

  it('tolera espaços em branco ao redor do valor', () => {
    process.env.EXPO_PUBLIC_DATA_SOURCE = '  supabase  ';
    expect(isSupabaseDataSource()).toBe(true);
  });
});
