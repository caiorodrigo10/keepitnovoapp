import { describe, expect, it } from 'vitest';

import { apenasDigitosCnpj, isCnpjValido } from './cnpj';

describe('cnpj (Lojista, Story 3.3, AC1)', () => {
  it('aceita um CNPJ válido conhecido, com máscara', () => {
    expect(isCnpjValido('11.222.333/0001-81')).toBe(true);
  });

  it('aceita um CNPJ válido conhecido, sem máscara (só dígitos)', () => {
    expect(isCnpjValido('11222333000181')).toBe(true);
  });

  it('aceita outros dois CNPJs válidos conhecidos (diferentes bases)', () => {
    expect(isCnpjValido('45.234.567/0001-60')).toBe(true);
    expect(isCnpjValido('12.345.678/0001-95')).toBe(true);
  });

  it('rejeita CNPJ com dígito verificador incorreto (último dígito alterado)', () => {
    expect(isCnpjValido('11.222.333/0001-80')).toBe(false);
  });

  it('rejeita CNPJ com dígito verificador incorreto (penúltimo dígito alterado)', () => {
    expect(isCnpjValido('11.222.333/0001-71')).toBe(false);
  });

  it('rejeita todos os 14 dígitos iguais, mesmo passando aritmeticamente no cálculo do DV', () => {
    expect(isCnpjValido('00000000000000')).toBe(false);
    expect(isCnpjValido('11111111111111')).toBe(false);
    expect(isCnpjValido('99999999999999')).toBe(false);
  });

  it('rejeita CNPJ incompleto (menos de 14 dígitos)', () => {
    expect(isCnpjValido('11.222.333/0001')).toBe(false);
    expect(isCnpjValido('')).toBe(false);
  });

  it('rejeita CNPJ com mais de 14 dígitos', () => {
    expect(isCnpjValido('112223330001819')).toBe(false);
  });

  it('apenasDigitosCnpj remove toda pontuação/máscara', () => {
    expect(apenasDigitosCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(apenasDigitosCnpj('  11 222 333 0001 81 ')).toBe('11222333000181');
  });
});
