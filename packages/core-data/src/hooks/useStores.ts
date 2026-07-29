import { getDataClient } from '../index';
import type { Estabelecimento } from '../ports/store.port';
import { useAsyncResource, type AsyncResourceState } from './useAsyncResource';

export function useStores(hubId: string): AsyncResourceState<Estabelecimento[]> {
  const client = getDataClient();
  return useAsyncResource<Estabelecimento[]>(() => client.store.listByHub(hubId), [], [hubId]);
}
