import { expect, it } from 'vitest';

import { resolveDataMode } from './data-mode';

it('aceita demo apenas explicitamente', () => {
  expect(resolveDataMode('mock')).toBe('mock');
  expect(resolveDataMode('supabase')).toBe('supabase');
  expect(() => resolveDataMode(undefined)).toThrow('DATA_SOURCE_INVALIDO');
  expect(() => resolveDataMode('supabsae')).toThrow('DATA_SOURCE_INVALIDO');
});
