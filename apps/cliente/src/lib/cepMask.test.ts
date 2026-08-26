import { describe, expect, it } from 'vitest';

import { normalizeCep } from './cepMask';

/** Story 5.1.1 (AC3, AC5). */
describe('normalizeCep (Story 5.1.1, AC3/AC5)', () => {
  it('extrai os 8 dígitos de um CEP mascarado (12345-678)', () => {
    expect(normalizeCep('12345-678')).toBe('12345678');
  });

  it('aceita CEP já só com dígitos', () => {
    expect(normalizeCep('12345678')).toBe('12345678');
  });

  it('retorna null para CEP incompleto', () => {
    expect(normalizeCep('12345')).toBeNull();
  });

  it('retorna null para CEP com dígitos a mais', () => {
    expect(normalizeCep('123456789')).toBeNull();
  });

  it('retorna null para string vazia', () => {
    expect(normalizeCep('')).toBeNull();
  });

  it('ignora espaços/caracteres não numéricos misturados', () => {
    expect(normalizeCep('12.345-678 ')).toBe('12345678');
  });
});
