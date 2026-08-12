import { describe, expect, it } from 'vitest';

import { apenasDigitosCpf, isCpfValido } from './cpf';

describe('cpf (Cliente, Story 6.5, AC2)', () => {
  it('aceita um CPF válido conhecido (gerado por algoritmo, não real), com máscara', () => {
    expect(isCpfValido('111.444.777-35')).toBe(true);
  });

  it('aceita um CPF válido conhecido, sem máscara (só dígitos)', () => {
    expect(isCpfValido('11144477735')).toBe(true);
  });

  it('aceita outro CPF válido conhecido (base diferente)', () => {
    expect(isCpfValido('529.982.247-25')).toBe(true);
  });

  it('rejeita CPF com dígito verificador incorreto (último dígito alterado)', () => {
    expect(isCpfValido('111.444.777-36')).toBe(false);
  });

  it('rejeita CPF com dígito verificador incorreto (penúltimo dígito alterado)', () => {
    expect(isCpfValido('111.444.767-35')).toBe(false);
  });

  it('rejeita todos os 11 dígitos iguais, mesmo passando aritmeticamente no cálculo do DV', () => {
    expect(isCpfValido('00000000000')).toBe(false);
    expect(isCpfValido('11111111111')).toBe(false);
    expect(isCpfValido('99999999999')).toBe(false);
  });

  it('rejeita CPF incompleto (menos de 11 dígitos)', () => {
    expect(isCpfValido('111.444.777')).toBe(false);
    expect(isCpfValido('')).toBe(false);
  });

  it('rejeita CPF com mais de 11 dígitos', () => {
    expect(isCpfValido('111444777351')).toBe(false);
  });

  it('apenasDigitosCpf remove toda pontuação/máscara', () => {
    expect(apenasDigitosCpf('111.444.777-35')).toBe('11144477735');
    expect(apenasDigitosCpf('  111 444 777 35 ')).toBe('11144477735');
  });
});
