import type { HubFavoritesPort, StoreFavoritesPort } from '../ports/favorites.port';
import type { AsyncCallOptions } from '../types';
import { simulateAsync } from './async-helpers';
import type { MockDb } from './db';

type FavoritePort = HubFavoritesPort | StoreFavoritesPort;

function requireClienteSession(db: MockDb): void {
  if (!db.sessionClienteId || !db.clientes.some((cliente) => cliente.id === db.sessionClienteId)) {
    throw new Error('[mock] Favoritos exigem uma sessão de cliente autenticada.');
  }
}

function simulateAuthenticated<T>(
  db: MockDb,
  resultFactory: () => T | Promise<T>,
  emptyValue: T,
  options?: AsyncCallOptions,
): Promise<T> {
  return simulateAsync(
    () => {
      requireClienteSession(db);
      if (options?.forceError) {
        throw new Error('[mock] Erro simulado via AsyncCallOptions.forceError');
      }
      return options?.forceEmpty ? emptyValue : resultFactory();
    },
    emptyValue,
    options ? { ...options, forceError: false, forceEmpty: false } : undefined,
  );
}

function createFavoritePort(db: MockDb, values: () => string[]): FavoritePort {
  return {
    list(options?: AsyncCallOptions): Promise<string[]> {
      return simulateAuthenticated(
        db,
        () => [...values()],
        [],
        options,
      );
    },

    has(resourceId: string, options?: AsyncCallOptions): Promise<boolean> {
      return simulateAuthenticated(
        db,
        () => values().includes(resourceId),
        false,
        options,
      );
    },

    favorite(resourceId: string, options?: AsyncCallOptions): Promise<void> {
      return simulateAuthenticated(
        db,
        async () => {
          if (values().includes(resourceId)) return;
          values().push(resourceId);
          await db.onClienteMutation();
        },
        undefined,
        options,
      );
    },

    unfavorite(resourceId: string, options?: AsyncCallOptions): Promise<void> {
      return simulateAuthenticated(
        db,
        async () => {
          const index = values().indexOf(resourceId);
          if (index < 0) return;
          values().splice(index, 1);
          await db.onClienteMutation();
        },
        undefined,
        options,
      );
    },
  };
}

export function createFavoritesMock(db: MockDb): {
  favoriteHubs: HubFavoritesPort;
  favoriteStores: StoreFavoritesPort;
} {
  return {
    favoriteHubs: createFavoritePort(db, () => db.favoriteHubIds),
    favoriteStores: createFavoritePort(db, () => db.favoriteStoreIds),
  };
}
