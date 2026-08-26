/**
 * Cálculo do resumo financeiro do Checkout (Story 6.2, AC5) — extraído de
 * `Checkout.tsx` como função pura para ser testável sem harness de teste de
 * componente React (gap de infra já documentado, ver `cartRules.ts`).
 *
 * Total = Subtotal + Taxa de deslocamento + Taxa de serviço. A taxa Keepit
 * (`businessConfig.taxaKeepitPercent`, cobrada do LOJISTA) NUNCA entra
 * aqui — este módulo não a importa nem a recebe como parâmetro, por
 * construção.
 */
export interface CheckoutTotals {
  subtotalReais: number;
  taxaDeslocamentoReais: number;
  taxaServicoReais: number;
  totalReais: number;
}

export function computeCheckoutTotals(
  subtotalReais: number,
  taxaDeslocamentoReais: number,
  taxaServicoReais: number,
): CheckoutTotals {
  return {
    subtotalReais,
    taxaDeslocamentoReais,
    taxaServicoReais,
    totalReais: subtotalReais + taxaDeslocamentoReais + taxaServicoReais,
  };
}
