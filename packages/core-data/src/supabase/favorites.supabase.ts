import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type { HubFavoritesPort, StoreFavoritesPort } from '../ports/favorites.port';
import type { AsyncCallOptions } from '../types';

interface FavoriteOperations {
  list(clienteId: string): Promise<string[]>;
  has(clienteId: string, resourceId: string): Promise<boolean>;
  favorite(clienteId: string, resourceId: string): Promise<void>;
  unfavorite(clienteId: string, resourceId: string): Promise<void>;
}

type FavoritePort = HubFavoritesPort | StoreFavoritesPort;

async function requireAuthenticatedUserId(client: SupabaseClient<Database>): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) {
    throw new Error('[core-data/supabase] Favoritos exigem uma sessão de cliente autenticada.');
  }
  return data.user.id;
}

function createFavoritePort(
  resolveClient: () => SupabaseClient<Database>,
  resolveOperations: (client: SupabaseClient<Database>) => FavoriteOperations,
): FavoritePort {
  return {
    async list(_options?: AsyncCallOptions): Promise<string[]> {
      const client = resolveClient();
      return resolveOperations(client).list(await requireAuthenticatedUserId(client));
    },
    async has(resourceId: string, _options?: AsyncCallOptions): Promise<boolean> {
      const client = resolveClient();
      return resolveOperations(client).has(await requireAuthenticatedUserId(client), resourceId);
    },
    async favorite(resourceId: string, _options?: AsyncCallOptions): Promise<void> {
      const client = resolveClient();
      await resolveOperations(client).favorite(await requireAuthenticatedUserId(client), resourceId);
    },
    async unfavorite(resourceId: string, _options?: AsyncCallOptions): Promise<void> {
      const client = resolveClient();
      await resolveOperations(client).unfavorite(await requireAuthenticatedUserId(client), resourceId);
    },
  };
}

function hubOperations(client: SupabaseClient<Database>): FavoriteOperations {
  return {
    async list(clienteId) {
      const { data, error } = await client
        .from('clientes_hubs_favoritos')
        .select('hub_id')
        .eq('cliente_id', clienteId);
      if (error) throw error;
      return data.map((row) => row.hub_id);
    },
    async has(clienteId, hubId) {
      const { data, error } = await client
        .from('clientes_hubs_favoritos')
        .select('hub_id')
        .eq('cliente_id', clienteId)
        .eq('hub_id', hubId)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },
    async favorite(clienteId, hubId) {
      const { error } = await client
        .from('clientes_hubs_favoritos')
        .upsert(
          { cliente_id: clienteId, hub_id: hubId },
          { onConflict: 'cliente_id,hub_id', ignoreDuplicates: true },
        );
      if (error) throw error;
    },
    async unfavorite(clienteId, hubId) {
      const { error } = await client
        .from('clientes_hubs_favoritos')
        .delete()
        .eq('cliente_id', clienteId)
        .eq('hub_id', hubId);
      if (error) throw error;
    },
  };
}

function storeOperations(client: SupabaseClient<Database>): FavoriteOperations {
  return {
    async list(clienteId) {
      const { data, error } = await client
        .from('clientes_estabelecimentos_favoritos')
        .select('estabelecimento_id')
        .eq('cliente_id', clienteId);
      if (error) throw error;
      return data.map((row) => row.estabelecimento_id);
    },
    async has(clienteId, estabelecimentoId) {
      const { data, error } = await client
        .from('clientes_estabelecimentos_favoritos')
        .select('estabelecimento_id')
        .eq('cliente_id', clienteId)
        .eq('estabelecimento_id', estabelecimentoId)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },
    async favorite(clienteId, estabelecimentoId) {
      const { error } = await client
        .from('clientes_estabelecimentos_favoritos')
        .upsert(
          { cliente_id: clienteId, estabelecimento_id: estabelecimentoId },
          { onConflict: 'cliente_id,estabelecimento_id', ignoreDuplicates: true },
        );
      if (error) throw error;
    },
    async unfavorite(clienteId, estabelecimentoId) {
      const { error } = await client
        .from('clientes_estabelecimentos_favoritos')
        .delete()
        .eq('cliente_id', clienteId)
        .eq('estabelecimento_id', estabelecimentoId);
      if (error) throw error;
    },
  };
}

export function createFavoritesSupabase(client?: SupabaseClient<Database>): {
  favoriteHubs: HubFavoritesPort;
  favoriteStores: StoreFavoritesPort;
} {
  let cachedClient = client ?? null;
  const resolveClient = (): SupabaseClient<Database> => cachedClient ?? (cachedClient = createClient());
  return {
    favoriteHubs: createFavoritePort(resolveClient, hubOperations),
    favoriteStores: createFavoritePort(resolveClient, storeOperations),
  };
}
