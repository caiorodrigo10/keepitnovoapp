import { describe, expect, it, vi } from 'vitest';
import type { DataClient } from '@keepit/core-data';
import { createOrderFromQuote, type QuotedOrderInput } from './createOrderFromQuote';
const input: QuotedOrderInput = { cotacao: { id: 'q', taxas: { versao: 'v', comissaoBps: 1000, servicoCentavos: 350 }, subtotalCentavos: 10000, freteCentavos: 500, comissaoCentavos: 1000, totalCentavos: 10850, liquidoLojistaCentavos: 9500 }, forma: 'pix', nfSolicitada: true };
describe('criação a partir de cotação', () => {
  it('real usa apenas cotação e operação; falha não aciona pedido legado', async () => {
    const criar = vi.fn().mockRejectedValue(new Error('CHECKOUT_INDISPONIVEL'));
    const create = vi.fn();
    const client = { checkout: { criar }, order: { create } } as unknown as DataClient;
    await expect(createOrderFromQuote(client,input)).rejects.toThrow('CHECKOUT_INDISPONIVEL');
    expect(criar).toHaveBeenCalledWith({ cotacaoId: 'q', operacaoId: 'q', forma: 'pix', nfSolicitada: true });
    expect(create).not.toHaveBeenCalled();
  });
  it('mock cria a partir da cotação, preservando o snapshot autoritativo de complementos', async () => {
    const criar = vi.fn().mockResolvedValue({ pedidoId: 'demo' });
    const create = vi.fn();
    expect(await createOrderFromQuote({ checkout: { criar }, order: { create } } as unknown as DataClient, input)).toEqual({ id: 'demo' });
    expect(criar).toHaveBeenCalledWith({ cotacaoId: 'q', operacaoId: 'q', forma: 'pix', nfSolicitada: true });
    expect(create).not.toHaveBeenCalled();
  });
});
