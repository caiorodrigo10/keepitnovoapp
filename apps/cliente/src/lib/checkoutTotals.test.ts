import { describe, expect, it } from 'vitest';

import { businessConfig } from '@keepit/config';

import { computeCheckoutTotals } from './checkoutTotals';

describe('computeCheckoutTotals (Story 6.2, AC2-AC5)', () => {
  it('soma subtotal + taxa de deslocamento + taxa de serviço quando a loja tem taxa_deslocamento_reais > 0', () => {
    const totals = computeCheckoutTotals(64.4, 5, 2.9);

    expect(totals.subtotalReais).toBe(64.4);
    expect(totals.taxaDeslocamentoReais).toBe(5);
    expect(totals.taxaServicoReais).toBe(2.9);
    expect(totals.totalReais).toBeCloseTo(72.3, 2);
  });

  it('soma corretamente quando taxa_deslocamento_reais é 0', () => {
    const totals = computeCheckoutTotals(64.4, 0, 2.9);

    expect(totals.totalReais).toBeCloseTo(67.3, 2);
  });

  it('usa businessConfig.taxaServicoCompradorReais (2.90, PROVISÓRIA) — nunca hard-coded', () => {
    const totals = computeCheckoutTotals(100, 0, businessConfig.taxaServicoCompradorReais);

    expect(totals.taxaServicoReais).toBe(2.9);
    expect(totals.totalReais).toBeCloseTo(102.9, 2);
  });

  it('o total NUNCA inclui a taxa Keepit (taxaKeepitPercent) — função não recebe/lê esse valor', () => {
    // computeCheckoutTotals só aceita 3 parâmetros (subtotal/deslocamento/
    // serviço) — não há forma de `taxaKeepitPercent` entrar nesta soma por
    // construção da assinatura da função.
    expect(computeCheckoutTotals.length).toBe(3);
  });
});
