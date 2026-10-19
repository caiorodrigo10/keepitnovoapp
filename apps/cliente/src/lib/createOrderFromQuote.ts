import type { Cotacao, DataClient, Forma } from '@keepit/core-data';
export interface QuotedOrderInput {
  cotacao: Cotacao;
  forma: Forma;
  nfSolicitada: boolean;
}
/** Cria somente pela cotação autoritativa, que já contém os complementos selecionados. */
export async function createOrderFromQuote(client: Pick<DataClient, 'checkout'>, input: QuotedOrderInput): Promise<{ id: string }> {
  const q = input.cotacao;
  const result = await client.checkout.criar({
    cotacaoId: q.id,
    operacaoId: q.id,
    forma: input.forma,
    nfSolicitada: input.nfSolicitada,
  });
  return { id: result.pedidoId };
}
