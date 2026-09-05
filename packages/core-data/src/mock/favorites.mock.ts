import type { HubFavoritesPort, StoreFavoritesPort } from '../ports/favorites.port';
import type { AsyncCallOptions } from '../types';
import { simulateAsync } from './async-helpers';
import type { MockDb } from './db';

type FavoritePort = HubFavoritesPort | StoreFavoritesPort;
type FavoriteMutation = () => () => void;

const favoriteMutationByDb = new WeakMap<
  MockDb,
  (mutate: FavoriteMutation) => Promise<boolean>
>();

export function connectMockFavoriteMutation(
  db: MockDb,
  run: (mutate: FavoriteMutation) => Promise<boolean>,
): void {
  favoriteMutationByDb.set(db, run);
}

async function runMockFavoriteMutation(db: MockDb, mutate: FavoriteMutation): Promise<void> {
  const run = favoriteMutationByDb.get(db);
  if (run) {
    const persisted = await run(mutate);
    if (!persisted) {
      throw new Error('[mock] Não foi possível persistir a mutação de favoritos.');
    }
    return;
  }

  const rollback = mutate();
  try {
    await db.onClienteMutation();
  } catch (error) {
    rollback();
    throw error;
  }
}

function requireClienteSession(db: MockDb): string {
  if (!db.sessionClienteId || !db.clientes.some((cliente) => cliente.id === db.sessionClienteId)) {
    throw new Error('[mock] Favoritos exigem uma sessão de cliente autenticada.');
  }
  return db.sessionClienteId;
}

function simulateAuthenticated<T>(
  db: MockDb,
  resultFactory: (clienteId: string) => T | Promise<T>,
  emptyValue: T,
  options?: AsyncCallOptions,
): Promise<T> {
  return simulateAsync(
    () => {
      const clienteId = requireClienteSession(db);
      if (options?.forceError) {
        throw new Error('[mock] Erro simulado via AsyncCallOptions.forceError');
      }
      return options?.forceEmpty ? emptyValue : resultFactory(clienteId);
    },
    emptyValue,
    options ? { ...options, forceError: false, forceEmpty: false } : undefined,
  );
}

function createFavoritePort(db: MockDb, valuesByClienteId: () => Record<string, string[]>): FavoritePort {
  return {
    list(options?: AsyncCallOptions): Promise<string[]> {
      return simulateAuthenticated(
        db,
        (clienteId) => [...(valuesByClienteId()[clienteId] ?? [])],
        [],
        options,
      );
    },

    has(resourceId: string, options?: AsyncCallOptions): Promise<boolean> {
      return simulateAuthenticated(
        db,
        (clienteId) => valuesByClienteId()[clienteId]?.includes(resourceId) ?? false,
        false,
        options,
      );
    },

    favorite(resourceId: string, options?: AsyncCallOptions): Promise<void> {
      return simulateAuthenticated(
        db,
        async (clienteId) => {
          const values = valuesByClienteId()[clienteId] ?? [];
          if (values.includes(resourceId)) return;
          await runMockFavoriteMutation(db, () => {
            const valuesByCliente = valuesByClienteId();
            const current = valuesByCliente[clienteId] ?? [];
            const previous = valuesByCliente[clienteId];
            if (current.includes(resourceId)) return () => undefined;
            valuesByCliente[clienteId] = [...current, resourceId];
            return () => {
              if (previous) {
                valuesByCliente[clienteId] = previous;
              } else {
                delete valuesByCliente[clienteId];
              }
            };
          });
        },
        undefined,
        options,
      );
    },

    unfavorite(resourceId: string, options?: AsyncCallOptions): Promise<void> {
      return simulateAuthenticated(
        db,
        async (clienteId) => {
          const values = valuesByClienteId()[clienteId] ?? [];
          const index = values.indexOf(resourceId);
          if (index < 0) return;
          await runMockFavoriteMutation(db, () => {
            const valuesByCliente = valuesByClienteId();
            const current = valuesByCliente[clienteId] ?? [];
            const previous = valuesByCliente[clienteId];
            const next = current.filter((id) => id !== resourceId);
            if (next.length === current.length) return () => undefined;
            if (next.length === 0) {
              delete valuesByCliente[clienteId];
            } else {
              valuesByCliente[clienteId] = next;
            }
            return () => {
              if (previous) valuesByCliente[clienteId] = previous;
            };
          });
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
    favoriteHubs: createFavoritePort(db, () => db.favoriteHubIdsByClienteId),
    favoriteStores: createFavoritePort(db, () => db.favoriteStoreIdsByClienteId),
  };
}
