import { describe, expect, it } from 'vitest';

import { formatCategoriaLoja } from './categoriaLojaPresentation';

describe('formatCategoriaLoja', () => {
  it('converte o valor persistido de conveniencia no rótulo legível', () => {
    expect(formatCategoriaLoja('conveniencia')).toBe('Conveniência');
  });

  it('converte a variação sem acento observada no aparelho', () => {
    expect(formatCategoriaLoja('Conveniencia')).toBe('Conveniência');
  });

  it('preserva uma categoria fora do mapa aberto', () => {
    expect(formatCategoriaLoja('artesanato')).toBe('artesanato');
  });
});
