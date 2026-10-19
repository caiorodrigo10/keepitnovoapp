import { describe, expect, it } from 'vitest';

import { getEquipePresentation } from './equipePresentation';

describe('getEquipePresentation', () => {
  it('exibe estado vazio quando não há fonte confiável de membros', () => {
    expect(getEquipePresentation()).toEqual({
      membros: [],
      mensagemVazia: 'Nenhum membro',
    });
  });
});
