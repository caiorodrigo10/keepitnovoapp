import { describe, expect, it } from 'vitest';

import type { EstabelecimentoHorario } from '@keepit/core-data';

import {
  ORDEM_DIAS_SEMANA,
  diaSemanaLabel,
  edicaoParaHorarios,
  horariosParaEdicao,
  validarHorariosEdicao,
} from './horariosEdicao';

const HORARIOS_FIXTURE: EstabelecimentoHorario[] = [
  { dia_semana: 0, aberto: false, hora_abre: null, hora_fecha: null },
  { dia_semana: 1, aberto: true, hora_abre: '08:00', hora_fecha: '18:00' },
  { dia_semana: 2, aberto: true, hora_abre: '08:00', hora_fecha: '18:00' },
  { dia_semana: 3, aberto: true, hora_abre: '08:00', hora_fecha: '18:00' },
  { dia_semana: 4, aberto: true, hora_abre: '08:00', hora_fecha: '18:00' },
  { dia_semana: 5, aberto: true, hora_abre: '08:00', hora_fecha: '18:00' },
  { dia_semana: 6, aberto: true, hora_abre: '09:00', hora_fecha: '13:00' },
];

describe('horariosParaEdicao (Story 4.7, AC1)', () => {
  it('devolve os 7 dias na ordem Seg → Dom', () => {
    const dias = horariosParaEdicao(HORARIOS_FIXTURE);
    expect(dias.map((d) => d.dia_semana)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(dias).toHaveLength(7);
  });

  it('converte hora_abre/hora_fecha null para string vazia (fechado)', () => {
    const dias = horariosParaEdicao(HORARIOS_FIXTURE);
    const domingo = dias.find((d) => d.dia_semana === 0);
    expect(domingo).toEqual({ dia_semana: 0, aberto: false, hora_abre: '', hora_fecha: '' });
  });

  it('dia ausente na fonte vira fechado em branco, sem inventar horário', () => {
    const dias = horariosParaEdicao(HORARIOS_FIXTURE.filter((h) => h.dia_semana !== 3));
    const quarta = dias.find((d) => d.dia_semana === 3);
    expect(quarta).toEqual({ dia_semana: 3, aberto: false, hora_abre: '', hora_fecha: '' });
  });
});

describe('edicaoParaHorarios (Story 4.7, AC3)', () => {
  it('round-trip com horariosParaEdicao preserva os dados', () => {
    const dias = horariosParaEdicao(HORARIOS_FIXTURE);
    const voltaram = edicaoParaHorarios(dias);
    const ordenados = [...voltaram].sort((a, b) => a.dia_semana - b.dia_semana);
    expect(ordenados).toEqual(HORARIOS_FIXTURE);
  });

  it('força hora_abre/hora_fecha para null quando aberto=false, mesmo com texto residual', () => {
    const [payload] = edicaoParaHorarios([{ dia_semana: 0, aberto: false, hora_abre: '09:00', hora_fecha: '18:00' }]);
    expect(payload).toEqual({ dia_semana: 0, aberto: false, hora_abre: null, hora_fecha: null });
  });
});

describe('validarHorariosEdicao (Story 4.7, AC1)', () => {
  it('null quando todos os dias válidos', () => {
    const dias = horariosParaEdicao(HORARIOS_FIXTURE);
    expect(validarHorariosEdicao(dias)).toBeNull();
  });

  it('mensagem com o nome do dia quando hora_abre >= hora_fecha', () => {
    const dias = horariosParaEdicao(HORARIOS_FIXTURE).map((d) =>
      d.dia_semana === 2 ? { ...d, hora_abre: '20:00', hora_fecha: '08:00' } : d,
    );
    expect(validarHorariosEdicao(dias)).toBe('Em Terça, o horário de abertura deve ser antes do fechamento.');
  });

  it('mensagem quando aberto=true e hh:mm em branco', () => {
    const dias = horariosParaEdicao(HORARIOS_FIXTURE).map((d) =>
      d.dia_semana === 1 ? { ...d, hora_abre: '', hora_fecha: '' } : d,
    );
    expect(validarHorariosEdicao(dias)).toMatch(/válido/);
  });

  it('mensagem quando formato não é hh:mm', () => {
    const dias = horariosParaEdicao(HORARIOS_FIXTURE).map((d) =>
      d.dia_semana === 5 ? { ...d, hora_abre: '8h', hora_fecha: '18:00' } : d,
    );
    expect(validarHorariosEdicao(dias)).toMatch(/válido/);
  });

  it('ignora dias fechados mesmo com texto inconsistente', () => {
    const dias = horariosParaEdicao(HORARIOS_FIXTURE).map((d) =>
      d.dia_semana === 0 ? { ...d, hora_abre: '20:00', hora_fecha: '08:00' } : d,
    );
    expect(validarHorariosEdicao(dias)).toBeNull();
  });
});

describe('diaSemanaLabel / ORDEM_DIAS_SEMANA', () => {
  it('rotula os 7 dias corretamente', () => {
    expect(ORDEM_DIAS_SEMANA.map(diaSemanaLabel)).toEqual([
      'Segunda',
      'Terça',
      'Quarta',
      'Quinta',
      'Sexta',
      'Sábado',
      'Domingo',
    ]);
  });
});
