import { describe, expect, it } from 'vitest';

import { formatProductPriceInput, parseProductPrice } from './productPrice';

describe('parseProductPrice', () => {
  it.each([
    ['1299', 12.99],
    ['12,99', 12.99],
    ['12.99', 12.99],
    ['0,05', 0.05],
  ])('interpreta %s como R$ %s', (input, expected) => {
    expect(parseProductPrice(input)).toBe(expected);
  });
});

describe('formatProductPriceInput (máscara durante a digitação, bug O2)', () => {
  it.each([
    ['', ''],
    ['0', '0,00'],
    ['1', '0,01'],
    ['15', '0,15'],
    ['159', '1,59'],
    ['1599', '15,99'],
    ['15999', '159,99'],
    ['123456', '1.234,56'],
    ['1234567', '12.345,67'],
  ])('formata %j como %j', (input, expected) => {
    expect(formatProductPriceInput(input)).toBe(expected);
  });

  it('simula a digitação de 1599 exibindo centavos a cada tecla', () => {
    // O TextInput devolve o texto já exibido + a nova tecla; a máscara
    // reinterpreta só os dígitos como centavos a cada mudança.
    let exibido = '';
    const vistos: string[] = [];
    for (const tecla of '1599') {
      exibido = formatProductPriceInput(exibido + tecla);
      vistos.push(exibido);
    }
    expect(vistos).toEqual(['0,01', '0,15', '1,59', '15,99']);
  });

  it('é idempotente sobre o texto já mascarado e aceita colar com R$', () => {
    expect(formatProductPriceInput('15,99')).toBe('15,99');
    expect(formatProductPriceInput('R$ 15,99')).toBe('15,99');
    expect(formatProductPriceInput('1.234,56')).toBe('1.234,56');
  });

  it('parse de volta do texto mascarado preserva o valor (round-trip)', () => {
    expect(parseProductPrice(formatProductPriceInput('1599'))).toBe(15.99);
    expect(parseProductPrice(formatProductPriceInput('123456'))).toBe(1234.56);
    expect(parseProductPrice('1.234,56')).toBe(1234.56);
  });
});
