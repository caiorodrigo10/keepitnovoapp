import { describe, expect, it, vi } from 'vitest';
import { createCheckoutQuoteResource } from './checkoutQuoteResource';
import type { Cotacao } from '@keepit/core-data';
const input = { estabelecimentoId: 'loja', hubId: 'hub', itens: [{ produtoId: 'p', quantidade: 1 }] };
const quote: Cotacao = { id: 'q', taxas: { versao: 'v', comissaoBps: 1000, servicoCentavos: 290 }, subtotalCentavos: 10000, freteCentavos: 500, comissaoCentavos: 1000, totalCentavos: 10790, liquidoLojistaCentavos: 9500 };
describe('cotação carregada no app', () => {
  it('falha fecha o pagamento e limpa a cotação anterior', async () => {
    const publish = vi.fn();
    const cotar = vi.fn().mockResolvedValueOnce(quote).mockRejectedValueOnce({ message: 'MINIMO_NAO_ATINGIDO' });
    const resource = createCheckoutQuoteResource(cotar,publish);
    await resource.load(input);
    expect(publish).toHaveBeenLastCalledWith({ data: quote, loading: false, error: null });
    await resource.load(input);
    expect(publish).toHaveBeenLastCalledWith({ data: null, loading: false, error: 'O valor dos produtos está abaixo do pedido mínimo da loja.' });
  });
  it('resposta da conta/carrinho anterior não substitui cotação atual', async () => {
    let resolve!: (value: Cotacao) => void;
    const cotar = vi.fn().mockImplementationOnce(() => new Promise<Cotacao>((r) => { resolve = r; })).mockResolvedValueOnce({ ...quote, id: 'nova' });
    const publish = vi.fn(); const resource = createCheckoutQuoteResource(cotar,publish);
    const old = resource.load(input);
    resource.cancel();
    await resource.load({ ...input, hubId: 'outro' });
    resolve(quote); await old;
    expect(publish).toHaveBeenLastCalledWith({ data: { ...quote, id: 'nova' }, loading: false, error: null });
  });
});
