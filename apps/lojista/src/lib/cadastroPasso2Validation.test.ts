import { describe, expect, it } from 'vitest';

import {
  isCadastroPasso2Valido,
  parseCoordenadaOpcional,
  validateCadastroPasso2,
  type CadastroPasso2ValidationInput,
} from './cadastroPasso2Validation';

function baseInput(overrides: Partial<CadastroPasso2ValidationInput> = {}): CadastroPasso2ValidationInput {
  return {
    raio_atendimento_km: 3,
    tempo_medio_entrega_min: 30,
    taxa_deslocamento_reais: 5,
    ticket_minimo_reais: null,
    lat: null,
    lng: null,
    ...overrides,
  };
}

describe('validateCadastroPasso2 (Story 3.4, AC2)', () => {
  it('aceita um formulário válido com lat/lng em branco (geo adiado)', () => {
    const errors = validateCadastroPasso2(baseInput());
    expect(errors).toEqual({});
    expect(isCadastroPasso2Valido(errors)).toBe(true);
  });

  it('aceita um formulário válido com ticket mínimo em branco (usa o global)', () => {
    const errors = validateCadastroPasso2(baseInput({ ticket_minimo_reais: null }));
    expect(errors.ticket_minimo_reais).toBeUndefined();
  });

  describe('raio_atendimento_km (1-15)', () => {
    it('rejeita abaixo do mínimo', () => {
      expect(validateCadastroPasso2(baseInput({ raio_atendimento_km: 0.5 })).raio_atendimento_km).toBeDefined();
    });
    it('rejeita acima do máximo', () => {
      expect(validateCadastroPasso2(baseInput({ raio_atendimento_km: 15.1 })).raio_atendimento_km).toBeDefined();
    });
    it('aceita os limites (1 e 15)', () => {
      expect(validateCadastroPasso2(baseInput({ raio_atendimento_km: 1 })).raio_atendimento_km).toBeUndefined();
      expect(validateCadastroPasso2(baseInput({ raio_atendimento_km: 15 })).raio_atendimento_km).toBeUndefined();
    });
  });

  describe('tempo_medio_entrega_min (5-120)', () => {
    it('rejeita abaixo do mínimo', () => {
      expect(validateCadastroPasso2(baseInput({ tempo_medio_entrega_min: 4 })).tempo_medio_entrega_min).toBeDefined();
    });
    it('rejeita acima do máximo', () => {
      expect(validateCadastroPasso2(baseInput({ tempo_medio_entrega_min: 121 })).tempo_medio_entrega_min).toBeDefined();
    });
    it('aceita os limites (5 e 120)', () => {
      expect(validateCadastroPasso2(baseInput({ tempo_medio_entrega_min: 5 })).tempo_medio_entrega_min).toBeUndefined();
      expect(validateCadastroPasso2(baseInput({ tempo_medio_entrega_min: 120 })).tempo_medio_entrega_min).toBeUndefined();
    });
  });

  describe('taxa_deslocamento_reais (0-30)', () => {
    it('rejeita negativo', () => {
      expect(validateCadastroPasso2(baseInput({ taxa_deslocamento_reais: -1 })).taxa_deslocamento_reais).toBeDefined();
    });
    it('rejeita acima do máximo', () => {
      expect(validateCadastroPasso2(baseInput({ taxa_deslocamento_reais: 30.5 })).taxa_deslocamento_reais).toBeDefined();
    });
    it('aceita os limites (0 e 30)', () => {
      expect(validateCadastroPasso2(baseInput({ taxa_deslocamento_reais: 0 })).taxa_deslocamento_reais).toBeUndefined();
      expect(validateCadastroPasso2(baseInput({ taxa_deslocamento_reais: 30 })).taxa_deslocamento_reais).toBeUndefined();
    });
  });

  describe('ticket_minimo_reais (opcional, >= 5 se informado)', () => {
    it('rejeita informado abaixo de 5', () => {
      expect(validateCadastroPasso2(baseInput({ ticket_minimo_reais: 4.99 })).ticket_minimo_reais).toBeDefined();
    });
    it('aceita exatamente 5', () => {
      expect(validateCadastroPasso2(baseInput({ ticket_minimo_reais: 5 })).ticket_minimo_reais).toBeUndefined();
    });
    it('aceita null (em branco = usa o global)', () => {
      expect(validateCadastroPasso2(baseInput({ ticket_minimo_reais: null })).ticket_minimo_reais).toBeUndefined();
    });
  });

  describe('coerência de geo — "ambas ou nenhuma" (ajuste @po, 2026-08-12)', () => {
    it('aceita ambas em branco', () => {
      const errors = validateCadastroPasso2(baseInput({ lat: null, lng: null }));
      expect(errors.geo).toBeUndefined();
    });

    it('aceita ambas informadas', () => {
      const errors = validateCadastroPasso2(baseInput({ lat: -23.5505, lng: -46.6333 }));
      expect(errors.geo).toBeUndefined();
    });

    it('rejeita só latitude informada', () => {
      const errors = validateCadastroPasso2(baseInput({ lat: -23.5505, lng: null }));
      expect(errors.geo).toBeDefined();
    });

    it('rejeita só longitude informada', () => {
      const errors = validateCadastroPasso2(baseInput({ lat: null, lng: -46.6333 }));
      expect(errors.geo).toBeDefined();
    });

    it('rejeita latitude não numérica (NaN) sem empilhar erro de geo', () => {
      const errors = validateCadastroPasso2(baseInput({ lat: Number.NaN, lng: null }));
      expect(errors.lat).toBeDefined();
      expect(errors.geo).toBeUndefined();
    });
  });
});

describe('parseCoordenadaOpcional', () => {
  it('retorna null para string vazia ou só espaços', () => {
    expect(parseCoordenadaOpcional('')).toBeNull();
    expect(parseCoordenadaOpcional('   ')).toBeNull();
  });

  it('faz parse de número com ponto decimal', () => {
    expect(parseCoordenadaOpcional('-23.5505')).toBe(-23.5505);
  });

  it('faz parse de número com vírgula decimal', () => {
    expect(parseCoordenadaOpcional('-23,5505')).toBe(-23.5505);
  });

  it('retorna NaN para texto não numérico (não silenciosamente null)', () => {
    expect(Number.isNaN(parseCoordenadaOpcional('abc'))).toBe(true);
  });
});
