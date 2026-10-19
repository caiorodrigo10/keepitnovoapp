import type { Hub, HubPort } from '../ports/hub.port';
import type { AsyncCallOptions } from '../types';
import { simulateAsync } from './async-helpers';
import type { MockDb } from './db';

export function createHubMock(db: MockDb): HubPort {
  return {
    listNearby(options?: AsyncCallOptions): Promise<Hub[]> {
      return simulateAsync(() => db.hubs.filter((h) => h.ativo), [], options);
    },

    getById(id: string, options?: AsyncCallOptions): Promise<Hub | null> {
      return simulateAsync(() => db.hubs.find((h) => h.id === id) ?? null, null, options);
    },
  };
}
