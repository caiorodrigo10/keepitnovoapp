export type DataMode = 'mock' | 'supabase';

/** Aceita somente fontes de dados configuradas de forma explícita. */
export function resolveDataMode(value: string | undefined): DataMode {
  const normalized = value?.trim();
  if (normalized === 'mock' || normalized === 'supabase') {
    return normalized;
  }
  throw new Error('DATA_SOURCE_INVALIDO');
}
