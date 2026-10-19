import { describe, expect, it } from 'vitest';

import {
  AutenticacaoNecessariaError,
  CadastroJaProcessadoError,
  CnpjDuplicadoError,
  HorariosInvalidosError,
} from '@keepit/core-data';

import { createEmptyHorarios } from '../screens/auth/cadastroDraft';
import {
  FACHADA_PLACEHOLDER_URI,
  buildHorariosPayload,
  mapCadastroErrorToMessage,
  resolveFachadaUploadInput,
} from './cadastroPasso3Submit';

describe('buildHorariosPayload (Story 3.5, AC3)', () => {
  it('mantém os 7 dias com hora_abre/hora_fecha quando aberto = true', () => {
    const horarios = createEmptyHorarios();
    const payload = buildHorariosPayload(horarios);

    expect(payload).toHaveLength(7);
    payload.forEach((dia, index) => {
      expect(dia.dia_semana).toBe(index);
      if (dia.aberto) {
        expect(dia.hora_abre).toBe('09:00');
        expect(dia.hora_fecha).toBe('18:00');
      }
    });
  });

  it('força hora_abre/hora_fecha para "" quando aberto = false, mesmo com texto residual digitado', () => {
    const horarios = createEmptyHorarios().map((horario) =>
      horario.dia_semana === 0 ? { ...horario, aberto: false, hora_abre: '10:00', hora_fecha: '15:00' } : horario,
    );

    const payload = buildHorariosPayload(horarios);
    const domingo = payload.find((dia) => dia.dia_semana === 0);

    expect(domingo).toMatchObject({ aberto: false, hora_abre: '', hora_fecha: '' });
  });

  it('preserva sempre exatamente 7 entradas (contrato da RPC — HORARIOS_INVALIDOS se != 7)', () => {
    expect(buildHorariosPayload(createEmptyHorarios())).toHaveLength(7);
  });
});

describe('resolveFachadaUploadInput (Story 3.5, AC2)', () => {
  it('retorna null quando não há foto (draft.foto_fachada_url === null)', () => {
    expect(resolveFachadaUploadInput(null)).toBeNull();
  });

  it('retorna null para o marcador placeholder herdado da Story 0.8 — nunca finge um upload', () => {
    expect(resolveFachadaUploadInput(FACHADA_PLACEHOLDER_URI)).toBeNull();
  });

  it('reconhece um URI de arquivo real e infere a extensão', () => {
    expect(resolveFachadaUploadInput('file:///data/user/0/app/cache/fachada.png')).toEqual({
      uri: 'file:///data/user/0/app/cache/fachada.png',
      ext: 'png',
    });
  });

  it('cai no fallback "jpg" para extensão desconhecida/ausente', () => {
    expect(resolveFachadaUploadInput('file:///data/user/0/app/cache/fachada')).toEqual({
      uri: 'file:///data/user/0/app/cache/fachada',
      ext: 'jpg',
    });
  });

  it('reconhece webp e jpeg', () => {
    expect(resolveFachadaUploadInput('content://media/fachada.webp')?.ext).toBe('webp');
    expect(resolveFachadaUploadInput('content://media/fachada.jpeg')?.ext).toBe('jpeg');
  });
});

describe('mapCadastroErrorToMessage (Story 3.5, AC4 — mapeamento dos 4 erros nomeados da RPC)', () => {
  it('CnpjDuplicadoError → mensagem de CNPJ já cadastrado', () => {
    expect(mapCadastroErrorToMessage(new CnpjDuplicadoError())).toMatch(/CNPJ já está cadastrado/);
  });

  it('CadastroJaProcessadoError → mensagem de cadastro já analisado', () => {
    expect(mapCadastroErrorToMessage(new CadastroJaProcessadoError())).toMatch(/já foi analisado/);
  });

  it('AutenticacaoNecessariaError → mensagem de sessão expirada', () => {
    expect(mapCadastroErrorToMessage(new AutenticacaoNecessariaError())).toMatch(/sessão expirou/);
  });

  it('HorariosInvalidosError → mensagem sobre horários', () => {
    expect(mapCadastroErrorToMessage(new HorariosInvalidosError())).toMatch(/horários/);
  });

  it('erro genérico (rede/RLS/constraint) → mensagem genérica, sem simular sucesso', () => {
    expect(mapCadastroErrorToMessage(new Error('network error'))).toMatch(/Não foi possível enviar/);
  });
});
