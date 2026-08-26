import { describe, expect, it } from 'vitest';

import { deriveLojaEstado, validarHorariosSemanais } from './store.port';

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

/**
 * Story 5.3 (AC1, AC3, AC4) — `deriveLojaEstado` relocada de `store.mock.ts`
 * (Stories 0.2/1.10) para esta port, `[IDS] ADAPT`, fonte única reaproveitada
 * pelos adapters mock e Supabase (`store.mock.ts#getState`,
 * `store.supabase.ts#getState`). Testes movidos de `store.mock.test.ts`
 * (mesmo padrão de `validarHorariosSemanais` acima: função pura testada
 * isolada de seus consumidores) + casos de borda exata (hora_abre/hora_fecha)
 * exigidos pela Story.
 */
describe('deriveLojaEstado (Story 5.3, AC1, AC3, AC4)', () => {
  const baseLoja = {
    id: 'x',
    nome_fantasia: 'x',
    categoria: 'x',
    descricao: null,
    foto_fachada_url: null,
    endereco: 'x',
    lat: 0,
    lng: 0,
    raio_atendimento_km: 1,
    tempo_medio_entrega_min: 10,
    taxa_deslocamento_reais: 0,
    ticket_minimo_reais: null,
    status: 'ativo' as const,
    motivo_rejeicao: null,
    motivo_suspensao: null,
    pausado_manualmente: false,
    horarios: [{ dia_semana: 3, aberto: true, hora_abre: '09:00', hora_fecha: '18:00' }],
  };

  it('returns "pausada" when pausado_manualmente = true, even inside horário (AC3)', () => {
    const wednesdayNoon = new Date('2026-07-29T12:00:00'); // wednesday
    const estado = deriveLojaEstado({ ...baseLoja, pausado_manualmente: true }, wednesdayNoon);
    expect(estado).toBe('pausada');
  });

  it('returns "aberta" within the configured horário', () => {
    const wednesdayNoon = new Date('2026-07-29T12:00:00');
    expect(deriveLojaEstado(baseLoja, wednesdayNoon)).toBe('aberta');
  });

  it('returns "fechada" outside the configured horário', () => {
    const wednesdayNight = new Date('2026-07-29T22:00:00');
    expect(deriveLojaEstado(baseLoja, wednesdayNight)).toBe('fechada');
  });

  it('returns "fechada" on a day without a horário entry', () => {
    const thursdayNoon = new Date('2026-07-30T12:00:00'); // no horário seeded for this day
    expect(deriveLojaEstado(baseLoja, thursdayNoon)).toBe('fechada');
  });

  it('borda exata: hora_atual === hora_abre → "aberta" (limite inclusivo, AC4)', () => {
    const exatamenteAbre = new Date('2026-07-29T09:00:00');
    expect(deriveLojaEstado(baseLoja, exatamenteAbre)).toBe('aberta');
  });

  it('borda exata: hora_atual === hora_fecha → "fechada" (limite exclusivo, AC4)', () => {
    const exatamenteFecha = new Date('2026-07-29T18:00:00');
    expect(deriveLojaEstado(baseLoja, exatamenteFecha)).toBe('fechada');
  });

  it('um minuto antes de hora_fecha ainda é "aberta" (borda)', () => {
    const umMinutoAntes = new Date('2026-07-29T17:59:00');
    expect(deriveLojaEstado(baseLoja, umMinutoAntes)).toBe('aberta');
  });
});
