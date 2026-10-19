export type DataMode = 'mock' | 'supabase';

/** Aceita somente fontes de dados configuradas de forma explícita. */
export function resolveDataMode(value: string | undefined, environment?: string): DataMode {
  const normalized = value?.trim();
  if (environment?.trim() === 'production' && normalized === 'mock') {
    throw new Error('DATA_SOURCE_MOCK_EM_PRODUCAO');
  }
  if (normalized === 'mock' || normalized === 'supabase') {
    return normalized;
  }
  throw new Error('DATA_SOURCE_INVALIDO');
}
