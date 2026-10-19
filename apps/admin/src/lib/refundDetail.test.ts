import { describe, expect, it, vi } from 'vitest';
import type { DataClient, ReembolsoPendente } from '@keepit/core-data';

import { loadRefundDetail } from './refundDetail';

describe('loadRefundDetail', () => {
  it('carrega reembolso sem pedido sem consultar pedido ou pagamento inexistente', async () => {
    const refund: ReembolsoPendente = {
      id: 'refund-sem-pedido', pedido_id: null, motivo: 'cancelamento_admin',
      valor_a_estornar_reais: 10, valor_ao_lojista_reais: 0, forma_pagamento: null,
      status: 'pendente_admin', criado_em: '2026-10-01T10:00:00.000Z', estado_reserva: 'ativa',
    };
    const getById = vi.fn();
    const inspectPayment = vi.fn();
    const client = {
      admin: { refundQueue: { list: vi.fn(async () => [refund]) }, inspectPayment },
      order: { getById },
    } as unknown as Pick<DataClient, 'admin' | 'order'>;

    await expect(loadRefundDetail(client, refund.id)).resolves.toEqual({
      reembolso: refund, pedido: null, payment: null, restanteCentavos: null,
    });
    expect(getById).not.toHaveBeenCalled();
    expect(inspectPayment).not.toHaveBeenCalled();
  });
});
