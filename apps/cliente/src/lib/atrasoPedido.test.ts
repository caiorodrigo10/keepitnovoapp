import { describe, expect, it } from 'vitest';

import type { Pedido } from '@keepit/core-data';

import { isPedidoAtrasado } from './atrasoPedido';

type PedidoParcial = Pick<Pedido, 'status' | 'aceito_em' | 'tempo_estimado_min'>;

function pedido(overrides: Partial<PedidoParcial>): PedidoParcial {
  return {
    status: 'aceito',
    aceito_em: '2026-08-13T10:00:00.000Z',
    tempo_estimado_min: 20,
    ...overrides,
  };
}

describe('isPedidoAtrasado (Story 6.21, AC1, AC4 — limiar exato 2x tempo_estimado_min)', () => {
  it('false quando o status não é aceito/em_preparo', () => {
    expect(isPedidoAtrasado(pedido({ status: 'no_hub' }), new Date('2026-08-13T11:00:00.000Z'))).toBe(false);
  });

  it('false quando aceito_em ou tempo_estimado_min estão ausentes', () => {
    expect(isPedidoAtrasado(pedido({ aceito_em: null }), new Date('2026-08-13T11:00:00.000Z'))).toBe(false);
    expect(isPedidoAtrasado(pedido({ tempo_estimado_min: null }), new Date('2026-08-13T11:00:00.000Z'))).toBe(false);
  });

  it('true para status em_preparo (mesma condição de aceito)', () => {
    const depoisDoLimiar = new Date('2026-08-13T10:40:01.000Z');
    expect(isPedidoAtrasado(pedido({ status: 'em_preparo' }), depoisDoLimiar)).toBe(true);
  });

  it('limiar exato: 1.999x do tempo estimado ainda não é atraso', () => {
    // 2 * 20min = 40min. 1.999x = 39min58.8s.
    const antes = new Date('2026-08-13T10:39:58.000Z');
    expect(isPedidoAtrasado(pedido({}), antes)).toBe(false);
  });

  it('limiar exato: exatamente 2.0x NÃO é atraso ainda (condição é estritamente >)', () => {
    const exatamenteNoLimiar = new Date('2026-08-13T10:40:00.000Z');
    expect(isPedidoAtrasado(pedido({}), exatamenteNoLimiar)).toBe(false);
  });

  it('limiar exato: 2.001x do tempo estimado já é atraso', () => {
    const depois = new Date('2026-08-13T10:40:02.000Z');
    expect(isPedidoAtrasado(pedido({}), depois)).toBe(true);
  });
});
