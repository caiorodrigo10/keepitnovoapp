import { describe, expect, it } from 'vitest';

import { anticipationIdentityLabel } from './financialLabels';

describe('anticipationIdentityLabel', () => {
  it('expõe IDs da antecipação, cobrança e pedido para correlação administrativa', () => {
    expect(anticipationIdentityLabel({
      anticipationId: 'ant-asaas-1',
      paymentId: 'pay-1',
      orderId: 'pedido-1',
    })).toBe('Antecipação ant-asaas-1 · Cobrança pay-1 · Pedido pedido-1');
  });
});
