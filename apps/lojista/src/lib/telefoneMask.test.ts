import { describe, expect, it } from 'vitest';

import { isTelefoneBRValido, maskTelefoneBR } from './telefoneMask';

describe('telefoneMask (Lojista, Story 3.2)', () => {
  it('maskTelefoneBR aplica a máscara progressiva de 9 dígitos', () => {
    expect(maskTelefoneBR('11912345678')).toBe('(11) 91234-5678');
  });

  it('maskTelefoneBR descarta DDI 55 em entradas de 13 dígitos', () => {
    expect(maskTelefoneBR('5511912345678')).toBe('(11) 91234-5678');
  });

  it('isTelefoneBRValido aceita telefone completo com DDD + 9 dígitos', () => {
    expect(isTelefoneBRValido('(11) 91234-5678')).toBe(true);
  });

  it('isTelefoneBRValido rejeita string vazia — telefone é OBRIGATÓRIO no Passo 1 do Lojista (AC1), diferente do Cliente', () => {
    expect(isTelefoneBRValido('')).toBe(false);
    expect(isTelefoneBRValido('   ')).toBe(false);
  });

  it('isTelefoneBRValido rejeita telefone incompleto', () => {
    expect(isTelefoneBRValido('(11) 1234')).toBe(false);
  });
});
