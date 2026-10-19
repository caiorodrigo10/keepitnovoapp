import type { DataClient, SupportPort } from '@keepit/core-data';

export async function decideSupportCase(
  client: Pick<DataClient, 'support' | 'order'>,
  input: Parameters<SupportPort['decidir']>[0],
) {
  const caso = await client.support.decidir(input);
  const pedido = await client.order.getById(caso.pedidoId);
  return { caso, pedido };
}
