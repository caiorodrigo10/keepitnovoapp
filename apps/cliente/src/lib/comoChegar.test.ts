import { describe, expect, it } from 'vitest';

import { comoChegarLabel, comoChegarUrl } from './comoChegar';

describe('comoChegarUrl (Story 6.7, AC2)', () => {
  it('null quando indisponível, mesmo com um número presente', () => {
    expect(comoChegarUrl(false, '5511999999999')).toBeNull();
  });

  it('null quando disponível mas sem número (estado atual — WA-001 pendente)', () => {
    expect(comoChegarUrl(true, null)).toBeNull();
  });

  it('monta a URL wa.me só quando disponível E com número', () => {
    expect(comoChegarUrl(true, '5511999999999')).toBe('https://wa.me/5511999999999');
  });
});

describe('comoChegarLabel (Story 6.7, AC2)', () => {
  it('rótulo simples quando disponível', () => {
    expect(comoChegarLabel(true)).toBe('Como chegar');
  });

  it('rótulo honesto "(em breve)" quando indisponível', () => {
    expect(comoChegarLabel(false)).toBe('Como chegar (em breve)');
  });
});
