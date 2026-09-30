import type { Cotacao, DataClient, Forma } from '@keepit/core-data';
export interface QuotedOrderInput {
  source: 'supabase' | 'mock'; cotacao: Cotacao; clienteId: string; estabelecimentoId: string; hubId: string; forma: Forma; nfSolicitada: boolean;
  itens: Array<{ produtoId: string; nome: string; precoSnapshotReais: number; quantidade: number }>;
}
export async function createOrderFromQuote(client: Pick<DataClient, 'checkout' | 'order'>, input: QuotedOrderInput): Promise<{ id: string }> {
  const q = input.cotacao;
  if (input.source === 'supabase') {
    const result = await client.checkout.criar({ cotacaoId: q.id, operacaoId: q.id, forma: input.forma, nfSolicitada: input.nfSolicitada });
    return { id: result.pedidoId };
  }
  // Compatibilidade exclusiva da demo; será substituída com pagamentos no plano 02.
  return client.order.create({
    cliente_id: input.clienteId, estabelecimento_id: input.estabelecimentoId, hub_id: input.hubId,
    itens: input.itens.map((i) => ({ produto_id: i.produtoId, nome_snapshot: i.nome, preco_unitario_reais: i.precoSnapshotReais, quantidade: i.quantidade })),
    forma_pagamento: input.forma, nf_solicitada: input.nfSolicitada,
    subtotal_produtos_reais: q.subtotalCentavos / 100, taxa_deslocamento_reais: q.freteCentavos / 100,
    taxa_keepit_reais: q.comissaoCentavos / 100, taxa_servico_comprador_reais: q.taxas.servicoCentavos / 100, total_pago_reais: q.totalCentavos / 100,
  });
}
