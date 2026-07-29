import { beforeEach, describe, expect, it } from 'vitest';

import type { HubPort } from '../ports/hub.port';
import { createMockDb, type MockDb } from './db';
import { createHubMock } from './hub.mock';

describe('hub.mock (contract)', () => {
  let db: MockDb;
  let port: HubPort;

  beforeEach(() => {
    db = createMockDb();
    port = createHubMock(db);
  });

  it('listNearby resolves with an array of Hub matching the shape', async () => {
    const hubs = await port.listNearby({ delayMs: 1 });
    expect(hubs.length).toBeGreaterThan(0);
    expect(hubs[0]).toMatchObject({
      nome: expect.any(String),
      lat: expect.any(Number),
      lng: expect.any(Number),
      ativo: true,
    });
    expect(hubs[0].horarios).toHaveLength(7);
  });

  it('getById returns null for unknown id', async () => {
    await expect(port.getById('does-not-exist', { delayMs: 1 })).resolves.toBeNull();
  });

  it('getById returns the seeded "Hub Centro" fixture', async () => {
    const hub = await port.getById('hub-centro', { delayMs: 1 });
    expect(hub?.nome).toBe('Hub Centro');
  });

  it('is genuinely asynchronous — does not resolve on the same tick', () => {
    let resolved = false;
    const promise = port.listNearby({ delayMs: 0 }).then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    return promise;
  });

  it('forceError rejects the Promise', async () => {
    await expect(port.listNearby({ forceError: true, delayMs: 1 })).rejects.toThrow();
  });

  it('forceEmpty resolves with an empty array', async () => {
    await expect(port.listNearby({ forceEmpty: true, delayMs: 1 })).resolves.toEqual([]);
  });
});
