import { expect, it } from 'vitest';
import { checkoutTotalsFromQuote } from './checkoutTotals';

it('projeta centavos de uma cotação sem recalcular a partir do carrinho', () => {
  expect(checkoutTotalsFromQuote({ id: 'q', taxas: { versao: 'v', comissaoBps: 1234, servicoCentavos: 567 }, subtotalCentavos: 10000, freteCentavos: 500, comissaoCentavos: 1234, totalCentavos: 11067, liquidoLojistaCentavos: 9266 })).toEqual({ subtotalReais: 100, taxaDeslocamentoReais: 5, taxaServicoReais: 5.67, totalReais: 110.67 });
});
