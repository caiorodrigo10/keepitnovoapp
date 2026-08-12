import { describe, expect, it } from 'vitest';

import { resolveRotaPosLogin } from './loginRouting';

describe('resolveRotaPosLogin (Story 3.10, AC2-AC6)', () => {
  it('null (0 linhas) — retoma o wizard (AC4)', () => {
    expect(resolveRotaPosLogin(null)).toEqual({ tipo: 'retomarWizard' });
  });

  it('status em_analise — EmAnalise (AC2)', () => {
    expect(resolveRotaPosLogin({ status: 'em_analise', motivo_rejeicao: null })).toEqual({ tipo: 'emAnalise' });
  });

  it('status ativo — ativo (AC2)', () => {
    expect(resolveRotaPosLogin({ status: 'ativo', motivo_rejeicao: null })).toEqual({ tipo: 'ativo' });
  });

  it('status rejeitado — carrega motivo_rejeicao íntegro (AC3)', () => {
    expect(resolveRotaPosLogin({ status: 'rejeitado', motivo_rejeicao: 'CNPJ divergente' })).toEqual({
      tipo: 'rejeitado',
      motivoRejeicao: 'CNPJ divergente',
    });
  });

  it('status rejeitado sem motivo (edge case honesto — nunca inventa um motivo)', () => {
    expect(resolveRotaPosLogin({ status: 'rejeitado', motivo_rejeicao: null })).toEqual({
      tipo: 'rejeitado',
      motivoRejeicao: null,
    });
  });

  it('status suspenso — contaIndisponivel (AC5, tratamento defensivo)', () => {
    expect(resolveRotaPosLogin({ status: 'suspenso', motivo_rejeicao: null })).toEqual({ tipo: 'contaIndisponivel' });
  });
});
