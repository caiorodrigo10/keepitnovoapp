import { getDataClient } from '../index';
import type { Pedido } from '../ports/order.port';
import { useAsyncResource, type AsyncResourceState } from './useAsyncResource';

export function useOrders(clienteId: string): AsyncResourceState<Pedido[]> {
  const client = getDataClient();
  return useAsyncResource<Pedido[]>(() => client.order.listMine(clienteId), [], [clienteId]);
}
