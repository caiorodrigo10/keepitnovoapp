import { describe, expect, it, vi } from 'vitest';
import type { DataClient } from '@keepit/core-data';
import { createOrderFromQuote, type QuotedOrderInput } from './createOrderFromQuote';
const input: QuotedOrderInput = { source: 'supabase', cotacao: { id: 'q', taxas: { versao: 'v', comissaoBps: 1000, servicoCentavos: 350 }, subtotalCentavos: 10000, freteCentavos: 500, comissaoCentavos: 1000, totalCentavos: 10850, liquidoLojistaCentavos: 9500 }, clienteId: 'c', estabelecimentoId: 'e', hubId: 'h', forma: 'pix', nfSolicitada: true, itens: [{ produtoId: 'p', nome: 'Produto', precoSnapshotReais: 1, quantidade: 1 }] };
describe('criação a partir de cotação', () => {
  it('real usa apenas cotação e operação; falha não aciona pedido legado', async () => {
    const criar = vi.fn().mockRejectedValue(new Error('CHECKOUT_INDISPONIVEL'));
    const create = vi.fn();
    const client = { checkout: { criar }, order: { create } } as unknown as DataClient;
    await expect(createOrderFromQuote(client,input)).rejects.toThrow('CHECKOUT_INDISPONIVEL');
    expect(criar).toHaveBeenCalledWith({ cotacaoId: 'q', operacaoId: 'q', forma: 'pix', nfSolicitada: true });
    expect(create).not.toHaveBeenCalled();
  });
  it('demo explícita mantém fluxo antigo usando taxas da cotação', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'demo' });
    const criar = vi.fn();
    expect(await createOrderFromQuote({ checkout: { criar }, order: { create } } as unknown as DataClient, { ...input, source: 'mock' })).toEqual({ id: 'demo' });
    expect(create.mock.calls[0][0]).toMatchObject({ subtotal_produtos_reais: 100, taxa_deslocamento_reais: 5, taxa_keepit_reais: 10, taxa_servico_comprador_reais: 3.5, total_pago_reais: 108.5 });
    expect(criar).not.toHaveBeenCalled();
  });
});
