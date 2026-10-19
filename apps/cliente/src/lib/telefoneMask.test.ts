import { describe, expect, it } from 'vitest';

import { isTelefoneBRValido, maskTelefoneBR } from './telefoneMask';

/**
 * [IDS] CREATE — Story 2.2, Task 5. Segue o padrão de `onboardingFlag.test.ts`
 * (vitest, describe/it). Sem dependência de RN — módulo puro.
 */
describe('telefoneMask', () => {
  describe('maskTelefoneBR', () => {
    it('retorna string vazia para entrada vazia', () => {
      expect(maskTelefoneBR('')).toBe('');
    });

    it('mascara dígitos parciais (só DDD)', () => {
      expect(maskTelefoneBR('11')).toBe('(11');
    });

    it('mascara dígitos parciais (DDD + início do número)', () => {
      expect(maskTelefoneBR('1191')).toBe('(11) 91');
    });

    it('mascara número completo com 8 dígitos (fixo)', () => {
      expect(maskTelefoneBR('1112345678')).toBe('(11) 1234-5678');
    });

    it('mascara número completo com 9 dígitos (celular)', () => {
      expect(maskTelefoneBR('11912345678')).toBe('(11) 91234-5678');
    });

    it('ignora caracteres não-dígitos na entrada', () => {
      expect(maskTelefoneBR('(11) 91234-5678')).toBe('(11) 91234-5678');
    });

    it('limita a 11 dígitos, descartando excesso', () => {
      expect(maskTelefoneBR('119123456789999')).toBe('(11) 91234-5678');
    });

    it('descarta o DDI 55 em entrada colada com +55 (13 dígitos, celular)', () => {
      expect(maskTelefoneBR('+55 11 91234-5678')).toBe('(11) 91234-5678');
    });

    it('descarta o DDI 55 em entrada colada com +55 (12 dígitos, fixo)', () => {
      expect(maskTelefoneBR('+55 11 3333-4444')).toBe('(11) 3333-4444');
    });

    it('não descarta o 55 quando é DDD legítimo (Santa Maria/RS, 11 dígitos)', () => {
      expect(maskTelefoneBR('55991234567')).toBe('(55) 99123-4567');
    });
  });

  describe('isTelefoneBRValido', () => {
    it('retorna true para string vazia (telefone é opcional)', () => {
      expect(isTelefoneBRValido('')).toBe(true);
    });

    it('retorna true para string só com espaços (telefone é opcional)', () => {
      expect(isTelefoneBRValido('   ')).toBe(true);
    });

    it('retorna true para formato completo de 9 dígitos (celular)', () => {
      expect(isTelefoneBRValido('(11) 91234-5678')).toBe(true);
    });

    it('retorna true para formato completo de 8 dígitos (fixo)', () => {
      expect(isTelefoneBRValido('(11) 1234-5678')).toBe(true);
    });

    it('retorna false para formato incompleto (faltando dígitos)', () => {
      expect(isTelefoneBRValido('(11) 91234')).toBe(false);
    });

    it('retorna false para entrada com letras', () => {
      expect(isTelefoneBRValido('(11) abcd-5678')).toBe(false);
    });

    it('retorna false para dígitos sem máscara', () => {
      expect(isTelefoneBRValido('11912345678')).toBe(false);
    });

    it('retorna false para excesso de dígitos', () => {
      expect(isTelefoneBRValido('(11) 912345-6789')).toBe(false);
    });

    it('round-trip: telefone colado com DDI, mascarado, é válido', () => {
      expect(isTelefoneBRValido(maskTelefoneBR('+55 11 91234-5678'))).toBe(true);
    });
  });
});
