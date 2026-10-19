import { getDataClient } from '../index';
import type { Hub } from '../ports/hub.port';
import { useAsyncResource, type AsyncResourceState } from './useAsyncResource';

export function useHubs(): AsyncResourceState<Hub[]> {
  const client = getDataClient();
  return useAsyncResource<Hub[]>(() => client.hub.listNearby(), []);
}
