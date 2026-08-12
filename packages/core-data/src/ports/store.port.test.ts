import { describe, expect, it } from 'vitest';

import { validarHorariosSemanais } from './store.port';

/**
 * Story 4.7 (AC1, AC3) — [IDS] CREATE. Testa a função pura isolada de sua
 * dupla de consumidores (adapters mock/Supabase, `store.mock.test.ts`/
 * `store.supabase.test.ts`, que testam o efeito ponta-a-ponta de rejeitar
 * `updateHorarios` sem persistir).
 */
describe('validarHorariosSemanais (Story 4.7, AC1)', () => {
  it('null quando todos os dias fechados', () => {
    const horarios = Array.from({ length: 7 }, (_, dia_semana) => ({
      dia_semana,
      aberto: false,
      hora_abre: null,
      hora_fecha: null,
    }));
    expect(validarHorariosSemanais(horarios)).toBeNull();
  });

  it('null quando aberto=true com hora_abre < hora_fecha válidos', () => {
    expect(
      validarHorariosSemanais([{ dia_semana: 1, aberto: true, hora_abre: '08:00', hora_fecha: '18:00' }]),
    ).toBeNull();
  });

  it('mensagem honesta quando aberto=true e hora_abre >= hora_fecha', () => {
    const erro = validarHorariosSemanais([{ dia_semana: 2, aberto: true, hora_abre: '18:00', hora_fecha: '08:00' }]);
    expect(erro).toMatch(/hora_abre/);
  });

  it('mensagem honesta quando aberto=true e hora_abre === hora_fecha (CHECK exige estritamente menor)', () => {
    const erro = validarHorariosSemanais([{ dia_semana: 2, aberto: true, hora_abre: '09:00', hora_fecha: '09:00' }]);
    expect(erro).not.toBeNull();
  });

  it('mensagem honesta quando aberto=true e hora_abre/hora_fecha ausentes (null)', () => {
    const erro = validarHorariosSemanais([{ dia_semana: 3, aberto: true, hora_abre: null, hora_fecha: null }]);
    expect(erro).toMatch(/inválido/);
  });

  it('mensagem honesta quando o formato não é hh:mm', () => {
    const erro = validarHorariosSemanais([{ dia_semana: 4, aberto: true, hora_abre: '8:00', hora_fecha: '18:00' }]);
    expect(erro).toMatch(/inválido/);
  });

  it('ignora hora_abre/hora_fecha quando aberto=false, mesmo se inconsistentes', () => {
    expect(
      validarHorariosSemanais([{ dia_semana: 5, aberto: false, hora_abre: '20:00', hora_fecha: '08:00' }]),
    ).toBeNull();
  });

  it('reporta o PRIMEIRO dia inválido encontrado', () => {
    const erro = validarHorariosSemanais([
      { dia_semana: 1, aberto: true, hora_abre: '08:00', hora_fecha: '18:00' },
      { dia_semana: 2, aberto: true, hora_abre: '18:00', hora_fecha: '08:00' },
      { dia_semana: 3, aberto: true, hora_abre: '18:00', hora_fecha: '08:00' },
    ]);
    expect(erro).toMatch(/dia_semana=2/);
  });
});
