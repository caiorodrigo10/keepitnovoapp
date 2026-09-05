import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthPort } from '../ports/auth.port';
import type { HubFavoritesPort, StoreFavoritesPort } from '../ports/favorites.port';
import { createAuthMock } from './auth.mock';
import { createMockDb, type MockDb } from './db';
import { createFavoritesMock } from './favorites.mock';

type FavoritePort = HubFavoritesPort | StoreFavoritesPort;

describe('favorites.mock (contrato comum) — Story 12.11', () => {
  let db: MockDb;
  let auth: AuthPort;
  let favoriteHubs: HubFavoritesPort;
  let favoriteStores: StoreFavoritesPort;

  beforeEach(async () => {
    db = createMockDb();
    ({ favoriteHubs, favoriteStores } = createFavoritesMock(db));
    auth = createAuthMock(db);
    await auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 });
    db.onClienteMutation = vi.fn(async () => undefined);
  });

  it.each([
    ['hubs', () => favoriteHubs],
    ['lojas', () => favoriteStores],
  ])('mantém favorite/unfavorite idempotentes para %s', async (_label, resolvePort) => {
    const port: FavoritePort = resolvePort();

    await port.favorite('resource-a', { delayMs: 0 });
    await port.favorite('resource-a', { delayMs: 0 });
    expect(await port.list({ delayMs: 0 })).toEqual(['resource-a']);
    expect(await port.has('resource-a', { delayMs: 0 })).toBe(true);

    await port.unfavorite('resource-a', { delayMs: 0 });
    await port.unfavorite('resource-a', { delayMs: 0 });
    expect(await port.list({ delayMs: 0 })).toEqual([]);
  });

  it('mantém hubs e lojas em coleções separadas', async () => {
    await favoriteHubs.favorite('hub-centro', { delayMs: 0 });
    await favoriteStores.favorite('estab-farmacia-vida', { delayMs: 0 });

    expect(await favoriteHubs.list({ delayMs: 0 })).toEqual(['hub-centro']);
    expect(await favoriteStores.list({ delayMs: 0 })).toEqual(['estab-farmacia-vida']);
  });

  it('isola leitura e mutação quando a sessão alterna entre duas contas válidas', async () => {
    await favoriteHubs.favorite('hub-ana', { delayMs: 0 });
    await favoriteStores.favorite('store-ana', { delayMs: 0 });

    await auth.signUp(
      { nome: 'Bea', email: 'bea@example.com', senha: 'senha1234', telefone: null },
      { delayMs: 0 },
    );
    await favoriteHubs.favorite('hub-bea', { delayMs: 0 });
    await favoriteStores.favorite('store-bea', { delayMs: 0 });
    await favoriteHubs.unfavorite('hub-ana', { delayMs: 0 });

    expect(await favoriteHubs.list({ delayMs: 0 })).toEqual(['hub-bea']);
    expect(await favoriteStores.list({ delayMs: 0 })).toEqual(['store-bea']);

    await auth.signOut({ delayMs: 0 });
    await auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 });

    expect(await favoriteHubs.list({ delayMs: 0 })).toEqual(['hub-ana']);
    expect(await favoriteStores.list({ delayMs: 0 })).toEqual(['store-ana']);
  });

  it('devolve clones e persiste somente mutações efetivas', async () => {
    await favoriteHubs.favorite('hub-centro', { delayMs: 0 });
    await favoriteHubs.favorite('hub-centro', { delayMs: 0 });
    const listed = await favoriteHubs.list({ delayMs: 0 });
    listed.push('hub-injetado-pelo-consumidor');
    await favoriteHubs.unfavorite('hub-centro', { delayMs: 0 });
    await favoriteHubs.unfavorite('hub-centro', { delayMs: 0 });

    expect(await favoriteHubs.list({ delayMs: 0 })).toEqual([]);
    expect(db.onClienteMutation).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['list', (port: FavoritePort) => port.list({ delayMs: 0 })],
    ['has', (port: FavoritePort) => port.has('resource-a', { delayMs: 0 })],
    ['favorite', (port: FavoritePort) => port.favorite('resource-a', { delayMs: 0 })],
    ['unfavorite', (port: FavoritePort) => port.unfavorite('resource-a', { delayMs: 0 })],
  ])('exige sessão autenticada em %s', async (_method, call) => {
    db.sessionClienteId = null;

    await expect(call(favoriteHubs)).rejects.toThrow(/sessão/i);
    await expect(call(favoriteStores)).rejects.toThrow(/sessão/i);
  });

  it('não permite que forceEmpty contorne a exigência de sessão', async () => {
    db.sessionClienteId = null;

    await expect(favoriteHubs.list({ delayMs: 0, forceEmpty: true })).rejects.toThrow(/sessão/i);
    await expect(favoriteStores.favorite('resource-a', { delayMs: 0, forceEmpty: true })).rejects.toThrow(/sessão/i);
  });
});
