import { describe, expect, it } from 'vitest';

import { resolveDataMode } from './data-mode';

describe('resolveDataMode', () => {
  it('aceita demo apenas explicitamente fora de produção', () => {
    expect(resolveDataMode('mock', 'development')).toBe('mock');
    expect(resolveDataMode('supabase', 'development')).toBe('supabase');
    expect(() => resolveDataMode(undefined, 'development')).toThrow('DATA_SOURCE_INVALIDO');
    expect(() => resolveDataMode('supabsae', 'development')).toThrow('DATA_SOURCE_INVALIDO');
  });

  it('rejeita fonte ausente ou mock em produção', () => {
    expect(() => resolveDataMode(undefined, 'production')).toThrow('DATA_SOURCE_INVALIDO');
    expect(() => resolveDataMode('mock', 'production')).toThrow('DATA_SOURCE_MOCK_EM_PRODUCAO');
  });

  it('preserva Supabase em produção', () => {
    expect(resolveDataMode('supabase', 'production')).toBe('supabase');
  });
});
