import { describe, expect, it } from 'vitest';

import { presentPaymentInspection } from './paymentInspection';

describe('inspeção financeira do pedido', () => {
  it.each([
    ['criando', 'Criando cobrança'],
    ['pendente', 'Pendente'],
    ['confirmado', 'Confirmado'],
    ['recebido', 'Recebido'],
    ['recusado', 'Recusado'],
    ['expirado', 'Expirado'],
    ['reconciliacao', 'Em reconciliação'],
  ] as const)('apresenta o estado %s sem mascarar a tentativa', (estado, estadoLabel) => {
    expect(presentPaymentInspection({
      tentativaId: 'tentativa-1', pedidoId: 'pedido-1', forma: 'pix', estado,
      asaasPaymentId: null, criadoEm: '2026-09-30T10:00:00Z', pagoEm: null,
      valorPrevistoReais: 42.5, valorRecebidoReais: null, pendencia: null,
    }).estadoLabel).toBe(estadoLabel);
  });

  it('apresenta tentativa pendente como valor previsto, nunca como pago', () => {
    expect(presentPaymentInspection({
      tentativaId: 'tentativa-1', pedidoId: 'pedido-1', forma: 'pix', estado: 'pendente',
      asaasPaymentId: 'pay-1', criadoEm: '2026-09-30T10:00:00Z', pagoEm: null,
      valorPrevistoReais: 42.5, valorRecebidoReais: null, pendencia: null,
    })).toMatchObject({ estadoLabel: 'Pendente', valorLabel: 'Valor previsto', valorReais: 42.5, recebido: false });
  });

  it('só apresenta valor recebido quando a confirmação persistida o fornece', () => {
    expect(presentPaymentInspection({
      tentativaId: 'tentativa-1', pedidoId: 'pedido-1', forma: 'cartao', estado: 'recebido',
      asaasPaymentId: 'pay-1', criadoEm: '2026-09-30T10:00:00Z', pagoEm: '2026-09-30T10:01:00Z',
      valorPrevistoReais: 42.5, valorRecebidoReais: 42.5, pendencia: null,
    })).toMatchObject({ estadoLabel: 'Recebido', valorLabel: 'Valor recebido', valorReais: 42.5, recebido: true });
  });

  it('mantém a tentativa posterior em reconciliação visível sem rebaixar o pagamento recebido', () => {
    expect(presentPaymentInspection({
      tentativaId: 'tentativa-a', pedidoId: 'pedido-1', forma: 'pix', estado: 'recebido',
      asaasPaymentId: 'pay-a', criadoEm: '2026-09-30T10:00:00Z', pagoEm: '2026-09-30T10:03:00Z',
      valorPrevistoReais: 42.5, valorRecebidoReais: 42.5,
      pendencia: {
        tentativaId: 'tentativa-b', forma: 'pix', estado: 'reconciliacao',
        asaasPaymentId: 'pay-b', criadoEm: '2026-09-30T10:01:00Z',
      },
    })).toMatchObject({
      estadoLabel: 'Recebido',
      valorLabel: 'Valor recebido',
      valorReais: 42.5,
      pendencia: { tentativaId: 'tentativa-b', estadoLabel: 'Em reconciliação' },
    });
  });
});
