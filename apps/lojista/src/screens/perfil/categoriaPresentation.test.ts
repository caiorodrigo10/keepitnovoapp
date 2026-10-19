import { describe, expect, it } from 'vitest';

import { formatCategoriaLoja } from './categoriaPresentation';

describe('formatCategoriaLoja', () => {
  it('converte o valor persistido de conveniencia no rótulo legível', () => {
    expect(formatCategoriaLoja('conveniencia')).toBe('Conveniência');
  });

  it('preserva uma categoria fora do mapa aberto', () => {
    expect(formatCategoriaLoja('artesanato')).toBe('artesanato');
  });
});
