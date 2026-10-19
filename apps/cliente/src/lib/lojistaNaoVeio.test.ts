import { describe, expect, it } from 'vitest';

import type { Pedido } from '@keepit/core-data';

import { podeReportarLojistaNaoVeio } from './lojistaNaoVeio';

type PedidoParcial = Pick<Pedido, 'status' | 'cliente_chegou_em' | 'tempo_estimado_min'>;

function pedido(overrides: Partial<PedidoParcial>): PedidoParcial {
  return {
    status: 'no_hub',
    cliente_chegou_em: '2026-08-13T10:00:00.000Z',
    tempo_estimado_min: 15,
    ...overrides,
  };
}

describe('podeReportarLojistaNaoVeio (Story 6.20, AC1)', () => {
  it('false quando o status não é no_hub', () => {
    expect(podeReportarLojistaNaoVeio(pedido({ status: 'aceito' }), new Date('2026-08-13T11:00:00.000Z'))).toBe(
      false,
    );
  });

  it('false quando cliente_chegou_em não está preenchido', () => {
    expect(
      podeReportarLojistaNaoVeio(pedido({ cliente_chegou_em: null }), new Date('2026-08-13T11:00:00.000Z')),
    ).toBe(false);
  });

  it('false antes do limiar (tempo_estimado_min=15 < esperaLojistaMaxMin=20 → usa 20min)', () => {
    // 19min59s depois — ainda dentro da janela de 20min.
    const now = new Date('2026-08-13T10:19:59.000Z');
    expect(podeReportarLojistaNaoVeio(pedido({}), now)).toBe(false);
  });

  it('true logo após o limiar de 20min (max(15,20)=20)', () => {
    const now = new Date('2026-08-13T10:20:01.000Z');
    expect(podeReportarLojistaNaoVeio(pedido({}), now)).toBe(true);
  });

  it('usa tempo_estimado_min quando ele é MAIOR que esperaLojistaMaxMin (max(30,20)=30)', () => {
    const antesDoLimiar = new Date('2026-08-13T10:29:59.000Z');
    const depoisDoLimiar = new Date('2026-08-13T10:30:01.000Z');
    expect(podeReportarLojistaNaoVeio(pedido({ tempo_estimado_min: 30 }), antesDoLimiar)).toBe(false);
    expect(podeReportarLojistaNaoVeio(pedido({ tempo_estimado_min: 30 }), depoisDoLimiar)).toBe(true);
  });

  it('trata tempo_estimado_min nulo como 0 (usa sempre esperaLojistaMaxMin=20)', () => {
    const depoisDoLimiar = new Date('2026-08-13T10:20:01.000Z');
    expect(podeReportarLojistaNaoVeio(pedido({ tempo_estimado_min: null }), depoisDoLimiar)).toBe(true);
  });
});
