import { describe, expect, it } from 'vitest';

import { CATEGORIA_OPTIONS, CATEGORIA_PRODUTO_OPTIONS } from './business-rules';

describe('CATEGORIA_OPTIONS (Story 3.4, AC1)', () => {
  it('includes the categories listed by the Épico 3 (Story 3.4, AC1)', () => {
    const values = CATEGORIA_OPTIONS.map((option) => option.value);
    expect(values).toEqual(
      expect.arrayContaining(['alimentacao', 'farmacia', 'vestuario', 'conveniencia', 'higiene', 'cuidados']),
    );
  });

  it('keeps the pre-existing fixture categories (mercado, pet) — não remove correspondência com fixtures reais', () => {
    const values = CATEGORIA_OPTIONS.map((option) => option.value);
    expect(values).toEqual(expect.arrayContaining(['mercado', 'pet']));
  });

  it('has no duplicate values', () => {
    const values = CATEGORIA_OPTIONS.map((option) => option.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('has a non-empty label for every option', () => {
    for (const option of CATEGORIA_OPTIONS) {
      expect(option.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('CATEGORIA_PRODUTO_OPTIONS (Story 4.4, AC1)', () => {
  it('keeps every categoria_produto value already used by real fixtures (produtos.ts) — não remove correspondência', () => {
    const values = CATEGORIA_PRODUTO_OPTIONS.map((option) => option.value);
    expect(values).toEqual(
      expect.arrayContaining(['medicamentos', 'cuidados', 'suplementos', 'vestuario', 'bebidas', 'snacks']),
    );
  });

  it('includes the new categories cited by the Épico 4 text not yet covered by fixtures', () => {
    const values = CATEGORIA_PRODUTO_OPTIONS.map((option) => option.value);
    expect(values).toEqual(expect.arrayContaining(['higiene', 'alimentos']));
  });

  it('has no duplicate values', () => {
    const values = CATEGORIA_PRODUTO_OPTIONS.map((option) => option.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('has a non-empty label for every option', () => {
    for (const option of CATEGORIA_PRODUTO_OPTIONS) {
      expect(option.label.trim().length).toBeGreaterThan(0);
    }
  });
});
