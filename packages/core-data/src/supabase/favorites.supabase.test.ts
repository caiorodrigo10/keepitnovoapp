import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { describe, expect, it, vi } from 'vitest';

import type { HubFavoritesPort, StoreFavoritesPort } from '../ports/favorites.port';
import { createFavoritesSupabase } from './favorites.supabase';

type FavoriteTable = 'clientes_hubs_favoritos' | 'clientes_estabelecimentos_favoritos';
type ResourceColumn = 'hub_id' | 'estabelecimento_id';
type FavoriteRow = { cliente_id: string; hub_id?: string; estabelecimento_id?: string };
type FavoritePort = HubFavoritesPort | StoreFavoritesPort;
type Operation = 'select' | 'upsert' | 'delete';

interface QueryRecord {
  table: FavoriteTable;
  operation: Operation;
  columns?: string;
  filters: Array<[string, string]>;
  values?: FavoriteRow;
  options?: { onConflict?: string; ignoreDuplicates?: boolean };
}

interface FakeClientOptions {
  userId?: string | null;
  authError?: Error;
  selectError?: Error;
  upsertError?: Error;
  deleteError?: Error;
}

function resourceColumnFor(table: FavoriteTable): ResourceColumn {
  return table === 'clientes_hubs_favoritos' ? 'hub_id' : 'estabelecimento_id';
}

function fakeClient(options: FakeClientOptions = {}) {
  const rows: Record<FavoriteTable, FavoriteRow[]> = {
    clientes_hubs_favoritos: [],
    clientes_estabelecimentos_favoritos: [],
  };
  const records: QueryRecord[] = [];
  const getUser = vi.fn(async () => ({
    data: { user: options.userId === null ? null : { id: options.userId ?? 'user-a' } },
    error: options.authError ?? null,
  }));

  const from = vi.fn((table: FavoriteTable) => {
    let operation: Operation = 'select';
    let columns: string | undefined;
    let values: FavoriteRow | undefined;
    let upsertOptions: QueryRecord['options'];
    const filters: Array<[string, string]> = [];

    const execute = async () => {
      const record: QueryRecord = { table, operation, filters: [...filters] };
      if (columns !== undefined) record.columns = columns;
      if (values !== undefined) record.values = values;
      if (upsertOptions !== undefined) record.options = upsertOptions;
      records.push(record);

      const injectedError =
        operation === 'select'
          ? options.selectError
          : operation === 'upsert'
            ? options.upsertError
            : options.deleteError;
      if (injectedError) return { data: null, error: injectedError };

      if (operation === 'select') {
        return {
          data: rows[table].filter((row) => filters.every(([column, value]) => row[column as keyof FavoriteRow] === value)),
          error: null,
        };
      }

      if (operation === 'upsert') {
        const resourceColumn = resourceColumnFor(table);
        const duplicate = rows[table].some(
          (row) => row.cliente_id === values?.cliente_id && row[resourceColumn] === values?.[resourceColumn],
        );
        if (!duplicate || !upsertOptions?.ignoreDuplicates) rows[table].push({ ...values! });
        return { data: null, error: null };
      }

      rows[table] = rows[table].filter(
        (row) => !filters.every(([column, value]) => row[column as keyof FavoriteRow] === value),
      );
      return { data: null, error: null };
    };

    const builder: Record<string, unknown> = {};
    builder.select = vi.fn((selectedColumns: string) => {
      operation = 'select';
      columns = selectedColumns;
      return builder;
    });
    builder.upsert = vi.fn((nextValues: FavoriteRow, nextOptions: QueryRecord['options']) => {
      operation = 'upsert';
      values = nextValues;
      upsertOptions = nextOptions;
      return execute();
    });
    builder.delete = vi.fn(() => {
      operation = 'delete';
      return builder;
    });
    builder.eq = vi.fn((column: string, value: string) => {
      filters.push([column, value]);
      return builder;
    });
    builder.maybeSingle = vi.fn(async () => {
      const result = await execute();
      return { ...result, data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data };
    });
    builder.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      execute().then(onFulfilled, onRejected);
    return builder;
  });

  return {
    client: { auth: { getUser }, from } as unknown as SupabaseClient<Database>,
    getUser,
    records,
  };
}

const ADAPTERS = [
  {
    label: 'hubs',
    table: 'clientes_hubs_favoritos' as const,
    resourceColumn: 'hub_id' as const,
    resolve: (client: SupabaseClient<Database>) => createFavoritesSupabase(client).favoriteHubs,
  },
  {
    label: 'lojas',
    table: 'clientes_estabelecimentos_favoritos' as const,
    resourceColumn: 'estabelecimento_id' as const,
    resolve: (client: SupabaseClient<Database>) => createFavoritesSupabase(client).favoriteStores,
  },
];

describe.each(ADAPTERS)('favorites.supabase — $label', ({ table, resourceColumn, resolve }) => {
  it('cumpre o contrato idempotente comum', async () => {
    const fake = fakeClient();
    const port: FavoritePort = resolve(fake.client);

    await port.favorite('resource-a', { delayMs: 0 });
    await port.favorite('resource-a', { delayMs: 0 });
    expect(await port.list({ delayMs: 0 })).toEqual(['resource-a']);
    expect(await port.has('resource-a', { delayMs: 0 })).toBe(true);

    await port.unfavorite('resource-a', { delayMs: 0 });
    await port.unfavorite('resource-a', { delayMs: 0 });
    expect(await port.list({ delayMs: 0 })).toEqual([]);
  });

  it('autentica, seleciona pelo usuário e faz upsert idempotente pela PK composta', async () => {
    const fake = fakeClient({ userId: 'user-owner' });
    const port = resolve(fake.client);

    await port.favorite('resource-a');
    await port.list();

    expect(fake.getUser).toHaveBeenCalledTimes(2);
    expect(fake.records).toContainEqual({
      table,
      operation: 'upsert',
      filters: [],
      values: { cliente_id: 'user-owner', [resourceColumn]: 'resource-a' },
      options: { onConflict: `cliente_id,${resourceColumn}`, ignoreDuplicates: true },
    });
    expect(fake.records).toContainEqual({
      table,
      operation: 'select',
      columns: resourceColumn,
      filters: [['cliente_id', 'user-owner']],
    });
  });

  it('restringe o DELETE ao usuário e ao recurso', async () => {
    const fake = fakeClient({ userId: 'user-owner' });
    const port = resolve(fake.client);

    await port.unfavorite('resource-a');

    expect(fake.records).toContainEqual({
      table,
      operation: 'delete',
      filters: [
        ['cliente_id', 'user-owner'],
        [resourceColumn, 'resource-a'],
      ],
    });
  });

  it('propaga erros de auth, ausência de sessão, query, upsert e delete sem fallback local', async () => {
    const authError = new Error('auth unavailable');
    const selectError = new Error('select unavailable');
    const upsertError = new Error('upsert unavailable');
    const deleteError = new Error('delete unavailable');

    await expect(resolve(fakeClient({ authError }).client).list()).rejects.toBe(authError);
    await expect(resolve(fakeClient({ userId: null }).client).list()).rejects.toThrow(/sessão/i);
    await expect(resolve(fakeClient({ selectError }).client).list()).rejects.toBe(selectError);
    await expect(resolve(fakeClient({ upsertError }).client).favorite('resource-a')).rejects.toBe(upsertError);
    await expect(resolve(fakeClient({ deleteError }).client).unfavorite('resource-a')).rejects.toBe(deleteError);
  });
});
