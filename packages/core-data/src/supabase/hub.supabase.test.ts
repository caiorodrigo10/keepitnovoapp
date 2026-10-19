import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import { createHubSupabase } from './hub.supabase';

/**
 * Story 5.1 (AC3, AC4, AC5) — [IDS] REUSE do padrão de query builder
 * encadeável já estabelecido em `store.supabase.test.ts`/`product.supabase.test.ts`.
 */
type QueryResult = { data: unknown; error: unknown };

function makeQueryBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function fakeClient(results: { hubs?: QueryResult; hubs_horarios?: QueryResult }): {
  client: SupabaseClient<Database>;
  builders: { hubs: Record<string, unknown>; hubs_horarios: Record<string, unknown> };
} {
  const builders = {
    hubs: makeQueryBuilder(results.hubs ?? { data: [], error: null }),
    hubs_horarios: makeQueryBuilder(results.hubs_horarios ?? { data: [], error: null }),
  };
  const from = vi.fn((table: string) => builders[table as 'hubs' | 'hubs_horarios']);
  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, builders };
}

const HUB_ROW_A = {
  id: 'hub-b',
  nome: 'Hub Beta',
  endereco: 'Rua B, 200',
  lat: -23.5,
  lng: -46.6,
  ponto_referencia: null,
  foto_url: null,
  ativo: true,
};

const HUB_ROW_B = {
  id: 'hub-a',
  nome: 'Hub Alfa',
  endereco: 'Rua A, 100',
  lat: -23.4,
  lng: -46.5,
  ponto_referencia: 'Perto do mercado',
  foto_url: null,
  ativo: true,
};

describe('hub.supabase.ts — listNearby (Story 5.1, AC3, AC4)', () => {
  it('filtra ativo=true e ordena por nome ASC, com horarios mapeados por hub_id', async () => {
    const { client, builders } = fakeClient({
      hubs: { data: [HUB_ROW_A, HUB_ROW_B], error: null },
      hubs_horarios: {
        data: [
          { hub_id: 'hub-a', dia_semana: 1, aberto: true, hora_abre: '08:00', hora_fecha: '18:00' },
          { hub_id: 'hub-b', dia_semana: 0, aberto: false, hora_abre: null, hora_fecha: null },
        ],
        error: null,
      },
    });
    const port = createHubSupabase(client);

    const hubs = await port.listNearby();

    expect(builders.hubs.eq).toHaveBeenCalledWith('ativo', true);
    expect(builders.hubs.order).toHaveBeenCalledWith('nome', { ascending: true });
    expect(hubs.map((h) => h.id)).toEqual(['hub-b', 'hub-a']);
    expect(hubs.find((h) => h.id === 'hub-a')?.horarios).toEqual([
      { dia_semana: 1, aberto: true, hora_abre: '08:00', hora_fecha: '18:00' },
    ]);
  });

  it('resolve [] sem consultar hubs_horarios quando não há hubs ativos', async () => {
    const { client } = fakeClient({ hubs: { data: [], error: null } });
    const from = client.from as unknown as ReturnType<typeof vi.fn>;
    const port = createHubSupabase(client);

    const hubs = await port.listNearby();

    expect(hubs).toEqual([]);
    expect(from).not.toHaveBeenCalledWith('hubs_horarios');
  });

  it('propaga erro do SDK sem sucesso fictício', async () => {
    const { client } = fakeClient({ hubs: { data: null, error: new Error('network error') } });
    const port = createHubSupabase(client);

    await expect(port.listNearby()).rejects.toThrow(/network error/);
  });
});

describe('hub.supabase.ts — getById (Story 5.1, AC3, AC4, AC5)', () => {
  it('devolve o Hub real com horarios ordenados por dia_semana', async () => {
    const { client, builders } = fakeClient({
      hubs: { data: HUB_ROW_B, error: null },
      hubs_horarios: {
        data: [
          { dia_semana: 1, aberto: true, hora_abre: '08:00', hora_fecha: '18:00' },
          { dia_semana: 0, aberto: false, hora_abre: null, hora_fecha: null },
        ],
        error: null,
      },
    });
    const port = createHubSupabase(client);

    const hub = await port.getById('hub-a');

    expect(builders.hubs.eq).toHaveBeenCalledWith('id', 'hub-a');
    expect(builders.hubs_horarios.eq).toHaveBeenCalledWith('hub_id', 'hub-a');
    expect(hub?.id).toBe('hub-a');
    expect(hub?.horarios.map((h) => h.dia_semana)).toEqual([0, 1]);
  });

  it('devolve null quando o hub não existe / está inativo para não-admin (RLS) — sem lançar', async () => {
    const { client } = fakeClient({ hubs: { data: null, error: null } });
    const port = createHubSupabase(client);

    await expect(port.getById('hub-inexistente')).resolves.toBeNull();
  });

  it('propaga erro do SDK sem sucesso fictício', async () => {
    const { client } = fakeClient({ hubs: { data: null, error: new Error('network error') } });
    const port = createHubSupabase(client);

    await expect(port.getById('hub-a')).rejects.toThrow(/network error/);
  });
});
