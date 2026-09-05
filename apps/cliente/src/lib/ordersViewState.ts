import type { Pedido, QaSimulationState } from '@keepit/core-data';

export type OrdersViewSnapshot = {
  data: Pedido[];
  loading: boolean;
  error: Error | null;
};

export type OrdersViewState =
  | { kind: 'loading' | 'error' | 'empty' }
  | { kind: 'content'; pedidos: Pedido[] };

export function resolveOrdersViewState(
  snapshot: OrdersViewSnapshot,
  simulation: QaSimulationState,
): OrdersViewState {
  if (simulation === 'loading') {
    return { kind: 'loading' };
  }
  if (simulation === 'error') {
    return { kind: 'error' };
  }
  if (simulation === 'empty') {
    return { kind: 'empty' };
  }
  if (snapshot.loading) {
    return { kind: 'loading' };
  }
  if (snapshot.error) {
    return { kind: 'error' };
  }
  if (snapshot.data.length === 0) {
    return { kind: 'empty' };
  }
  return { kind: 'content', pedidos: snapshot.data };
}
