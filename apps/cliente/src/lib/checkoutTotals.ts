import type { Cotacao } from '@keepit/core-data';
/** Valores para apresentação; a cotação em centavos é a única fonte de totais. */
export interface CheckoutTotals {
  subtotalReais: number;
  taxaDeslocamentoReais: number;
  taxaServicoReais: number;
  totalReais: number;
}

/** Somente apresentação: o servidor já calculou cada valor em centavos. */
export function checkoutTotalsFromQuote(cotacao: Cotacao): CheckoutTotals {
  return { subtotalReais: cotacao.subtotalCentavos / 100, taxaDeslocamentoReais: cotacao.freteCentavos / 100,
    taxaServicoReais: cotacao.taxas.servicoCentavos / 100, totalReais: cotacao.totalCentavos / 100 };
}
