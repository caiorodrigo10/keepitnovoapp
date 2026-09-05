import { getDataClient } from '@keepit/core-data';
import type { OrderChangeEvent, Pedido } from '@keepit/core-data';

export type OrdersSnapshot = {
  data: Pedido[];
  loading: boolean;
  error: Error | null;
};

type OrdersListener = () => void;
type FetchMine = (clienteId: string) => Promise<Pedido[]>;
type SubscribeChanges = (listener: (event: OrderChangeEvent) => void) => () => void;

export type OrdersResource = {
  getSnapshot: (clienteId: string) => OrdersSnapshot;
  subscribe: (clienteId: string, listener: OrdersListener) => () => void;
  load: (clienteId: string) => Promise<void>;
  invalidate: (clienteId?: string) => Promise<void>;
  clear: (clienteId?: string) => void;
};

const emptySnapshot = (): OrdersSnapshot => ({ data: [], loading: false, error: null });

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

export function createOrdersResource(fetchMine: FetchMine, subscribeChanges?: SubscribeChanges): OrdersResource {
  const snapshots = new Map<string, OrdersSnapshot>();
  const listeners = new Map<string, Set<OrdersListener>>();
  const generations = new Map<string, number>();
  const inFlight = new Map<string, { generation: number; promise: Promise<void> }>();

  const generationFor = (clienteId: string): number => generations.get(clienteId) ?? 0;

  const getSnapshot = (clienteId: string): OrdersSnapshot => {
    const current = snapshots.get(clienteId);
    if (current) {
      return current;
    }
    const initial = emptySnapshot();
    snapshots.set(clienteId, initial);
    return initial;
  };

  const publish = (clienteId: string, next: OrdersSnapshot): void => {
    snapshots.set(clienteId, { ...next, data: [...next.data] });
    listeners.get(clienteId)?.forEach((listener) => listener());
  };

  const load = (clienteId: string): Promise<void> => {
    const generation = generationFor(clienteId);
    const currentRequest = inFlight.get(clienteId);
    if (currentRequest?.generation === generation) {
      return currentRequest.promise;
    }

    const current = getSnapshot(clienteId);
    publish(clienteId, { data: current.data, loading: true, error: null });

    let request: Promise<Pedido[]>;
    try {
      request = fetchMine(clienteId);
    } catch (error) {
      request = Promise.reject(error);
    }

    const promise = request
      .then((orders) => {
        if (generationFor(clienteId) === generation) {
          publish(clienteId, { data: orders, loading: false, error: null });
        }
      })
      .catch((error: unknown) => {
        if (generationFor(clienteId) === generation) {
          publish(clienteId, { data: getSnapshot(clienteId).data, loading: false, error: toError(error) });
        }
      })
      .finally(() => {
        if (inFlight.get(clienteId)?.promise === promise) {
          inFlight.delete(clienteId);
        }
      });

    inFlight.set(clienteId, { generation, promise });
    return promise;
  };

  const invalidate = (clienteId?: string): Promise<void> => {
    const clienteIds = clienteId ? [clienteId] : [...snapshots.keys()];
    return Promise.all(
      clienteIds.map((id) => {
        generations.set(id, generationFor(id) + 1);
        return load(id);
      }),
    ).then(() => undefined);
  };

  const clear = (clienteId?: string): void => {
    const clienteIds = clienteId ? [clienteId] : [...snapshots.keys()];
    clienteIds.forEach((id) => {
      generations.set(id, generationFor(id) + 1);
      inFlight.delete(id);
      publish(id, emptySnapshot());
    });
  };

  const resource: OrdersResource = {
    getSnapshot,
    subscribe(clienteId, listener) {
      const clienteListeners = listeners.get(clienteId) ?? new Set<OrdersListener>();
      clienteListeners.add(listener);
      listeners.set(clienteId, clienteListeners);
      getSnapshot(clienteId);
      return () => {
        clienteListeners.delete(listener);
        if (clienteListeners.size === 0) {
          listeners.delete(clienteId);
        }
      };
    },
    load,
    invalidate,
    clear,
  };

  subscribeChanges?.((event) => {
    void invalidate(event.clienteId);
  });

  return resource;
}

let sharedOrdersResource: OrdersResource | null = null;

export function getOrdersResource(): OrdersResource {
  if (!sharedOrdersResource) {
    const order = getDataClient().order;
    sharedOrdersResource = createOrdersResource(
      (clienteId) => order.listMine(clienteId),
      order.subscribeChanges?.bind(order),
    );
  }
  return sharedOrdersResource;
}

export const invalidatePedidos = (clienteId?: string): Promise<void> => getOrdersResource().invalidate(clienteId);

export const clearPedidosResource = (clienteId?: string): void => getOrdersResource().clear(clienteId);
