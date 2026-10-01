import { describe, expect, it } from 'vitest';

import { anticipationIdentityLabel, presentFinancialPending } from './financialLabels';

describe('anticipationIdentityLabel', () => {
  it('expõe IDs da antecipação, cobrança e pedido para correlação administrativa', () => {
    expect(anticipationIdentityLabel({
      anticipationId: 'ant-asaas-1',
      paymentId: 'pay-1',
      orderId: 'pedido-1',
    })).toBe('Antecipação ant-asaas-1 · Cobrança pay-1 · Pedido pedido-1');
  });
});

describe('presentFinancialPending', () => {
  it('sinaliza somente casos abertos há mais de um dia útil', () => {
    const base = {
      id: 'tentativa:tentativa-1', tipo: 'reconciliacao_pagamento' as const,
      pedidoId: 'pedido-1', operacaoId: 'tentativa-1', ultimoErro: null,
      referenciaExterna: null, acaoPermitida: 'reconciliar_pagamento' as const,
    };
    const agora = new Date('2026-10-01T12:00:00.000Z');

    expect(presentFinancialPending({ ...base, abertoEm: '2026-09-28T10:00:00.000Z' }, agora))
      .toMatchObject({ idadeLabel: '3 dias úteis', atrasada: true });
    expect(presentFinancialPending({ ...base, abertoEm: '2026-09-30T10:00:00.000Z' }, agora))
      .toMatchObject({ idadeLabel: '1 dia útil', atrasada: false });
  });

  it.each([
    ['consultar_divergencia', 'Consultar registros', null],
    ['tratar_reembolso', 'Tratar reembolso', '/reembolsos/refund-1'],
    ['revisar_repasse', 'Revisar repasse', '/repasses/repasse-1'],
  ] as const)('expõe somente a ação segura %s', (acaoPermitida, acaoLabel, acaoHref) => {
    const id = acaoPermitida === 'tratar_reembolso'
      ? 'reembolso:refund-1'
      : acaoPermitida === 'revisar_repasse' ? 'repasse:repasse-1' : 'evento:evento-1';
    expect(presentFinancialPending({
      id, tipo: acaoPermitida === 'tratar_reembolso' ? 'reembolso'
        : acaoPermitida === 'revisar_repasse' ? 'repasse_em_analise' : 'evento_divergente',
      pedidoId: null, operacaoId: 'op-1', abertoEm: '2026-10-01T10:00:00.000Z',
      ultimoErro: null, referenciaExterna: null, acaoPermitida,
    }, new Date('2026-10-01T12:00:00.000Z'))).toMatchObject({ acaoLabel, acaoHref });
  });
});
