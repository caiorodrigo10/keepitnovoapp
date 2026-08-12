import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import { createAdminSupabase } from './admin.supabase';

/**
 * Story 4.1 (AC1-AC6) — `hubsCrud.{list,getById,create,update,delete,uploadFoto}`.
 *
 * [IDS] CREATE — arquivo dedicado, não uma extensão do `fakeClient` de
 * `admin.supabase.test.ts` → (reason: aquele fake só resolve `select().eq()/
 * .in()/.maybeSingle()` para as tabelas `estabelecimentos`/
 * `estabelecimentos_horarios` — `hubsCrud` precisa de `.insert()`/`.update()`/
 * `.delete()`/`.order()`/`.single()` encadeáveis, além de `storage.upload`/
 * `getPublicUrl`. Estender o fake existente misturaria os dois domínios e
 * arriscaria quebrar os testes de aprovação/rejeição de lojista já
 * cobertos ali. O builder abaixo é genérico o bastante para as duas tabelas
 * novas (`hubs`/`hubs_horarios`), usando o mesmo padrão de fila por tabela
 * já estabelecido (Story 3.7).
 */

type QueryResult = { data: unknown; error: unknown };

function makeQueryBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.insert = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.delete = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  builder.single = vi.fn(async () => result);
  builder.then = (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function fakeClient(options: {
  hubs?: QueryResult[];
  hubsHorarios?: QueryResult[];
  upload?: (path: string, blob: unknown, opts: unknown) => Promise<{ data: unknown; error: unknown }>;
  getPublicUrl?: (path: string) => { data: { publicUrl: string } };
}): {
  client: SupabaseClient<Database>;
  from: (table: string) => unknown;
  upload: (path: string, blob: unknown, opts: unknown) => Promise<{ data: unknown; error: unknown }>;
} {
  const queues: Record<string, QueryResult[]> = {
    hubs: [...(options.hubs ?? [])],
    hubs_horarios: [...(options.hubsHorarios ?? [])],
  };
  const from = vi.fn((table: string) => {
    const result = queues[table]?.shift() ?? { data: null, error: null };
    return makeQueryBuilder(result);
  });
  const upload = vi.fn(options.upload ?? (async () => ({ data: { path: 'never-called' }, error: null })));
  const getPublicUrl =
    options.getPublicUrl ?? vi.fn((path: string) => ({ data: { publicUrl: `https://public.example/hubs/${path}` } }));
  const storage = { from: vi.fn(() => ({ upload, getPublicUrl })) };
  return { client: { from, storage } as unknown as SupabaseClient<Database>, from, upload };
}

const HUB_ROW = {
  id: 'hub-1',
  nome: 'Hub Centro',
  endereco: 'Rua das Flores, 123',
  lat: -23.55052,
  lng: -46.633308,
  ponto_referencia: 'Em frente à praça',
  foto_url: null,
  ativo: true,
};

const HORARIO_ROW = { hub_id: 'hub-1', dia_semana: 1, aberto: true, hora_abre: '08:00', hora_fecha: '20:00' };

describe('admin.supabase.ts — hubsCrud.list (Story 4.1, AC1)', () => {
  it('mapeia todas as linhas retornadas (RLS admin devolve ativos e inativos) incluindo horarios', async () => {
    const hubInativo = { ...HUB_ROW, id: 'hub-2', nome: 'Hub Jardins', ativo: false };
    const { client, from } = fakeClient({
      hubs: [{ data: [HUB_ROW, hubInativo], error: null }],
      hubsHorarios: [{ data: [HORARIO_ROW], error: null }],
    });

    const port = createAdminSupabase(client);
    const hubs = await port.hubsCrud.list();

    expect(from).toHaveBeenCalledWith('hubs');
    expect(hubs).toHaveLength(2);
    expect(hubs.find((h) => h.id === 'hub-2')?.ativo).toBe(false);
    expect(hubs.find((h) => h.id === 'hub-1')?.horarios).toEqual([
      { dia_semana: 1, aberto: true, hora_abre: '08:00', hora_fecha: '20:00' },
    ]);
  });

  it('lista vazia quando não há hubs — sem erro', async () => {
    const { client } = fakeClient({ hubs: [{ data: [], error: null }] });
    const port = createAdminSupabase(client);
    await expect(port.hubsCrud.list()).resolves.toEqual([]);
  });

  it('propaga o erro do SDK sem sucesso fictício', async () => {
    const { client } = fakeClient({ hubs: [{ data: null, error: new Error('network down') }] });
    const port = createAdminSupabase(client);
    await expect(port.hubsCrud.list()).rejects.toThrow('network down');
  });
});

describe('admin.supabase.ts — hubsCrud.getById (Story 4.1, AC1, AC4)', () => {
  it('resolve o hub com horarios quando o id existe', async () => {
    const { client } = fakeClient({
      hubs: [{ data: HUB_ROW, error: null }],
      hubsHorarios: [{ data: [HORARIO_ROW], error: null }],
    });
    const port = createAdminSupabase(client);
    const hub = await port.hubsCrud.getById('hub-1');
    expect(hub).toMatchObject({ id: 'hub-1', nome: 'Hub Centro' });
    expect(hub?.horarios).toHaveLength(1);
  });

  it('retorna null quando o id não existe — honesto, sem lançar', async () => {
    const { client } = fakeClient({ hubs: [{ data: null, error: null }] });
    const port = createAdminSupabase(client);
    await expect(port.hubsCrud.getById('inexistente')).resolves.toBeNull();
  });
});

describe('admin.supabase.ts — hubsCrud.create (Story 4.1, AC2, AC3)', () => {
  it('insere o hub e os horarios, devolvendo o Hub composto (AC3)', async () => {
    const { client, from } = fakeClient({
      hubs: [{ data: HUB_ROW, error: null }],
      hubsHorarios: [{ data: null, error: null }],
    });
    const port = createAdminSupabase(client);

    const hub = await port.hubsCrud.create({
      nome: 'Hub Centro',
      endereco: 'Rua das Flores, 123',
      lat: -23.55052,
      lng: -46.633308,
      ponto_referencia: 'Em frente à praça',
      horarios: [{ dia_semana: 1, aberto: true, hora_abre: '08:00', hora_fecha: '20:00' }],
    });

    expect(from).toHaveBeenCalledWith('hubs');
    expect(from).toHaveBeenCalledWith('hubs_horarios');
    expect(hub).toMatchObject({ id: 'hub-1', nome: 'Hub Centro', ativo: true });
    expect(hub.horarios).toEqual([{ dia_semana: 1, aberto: true, hora_abre: '08:00', hora_fecha: '20:00' }]);
  });

  it('sem horarios — não chama hubs_horarios', async () => {
    const { client, from } = fakeClient({ hubs: [{ data: HUB_ROW, error: null }] });
    const port = createAdminSupabase(client);

    await port.hubsCrud.create({
      nome: 'Hub Centro',
      endereco: 'Rua das Flores, 123',
      lat: -23.55052,
      lng: -46.633308,
      horarios: [],
    });

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('hubs');
  });

  it('propaga erro do INSERT em hubs sem sucesso fictício (ex.: RLS bloqueando não-admin)', async () => {
    const { client } = fakeClient({ hubs: [{ data: null, error: new Error('new row violates row-level security policy') }] });
    const port = createAdminSupabase(client);
    await expect(
      port.hubsCrud.create({ nome: 'Hub X', endereco: 'Rua X', lat: 0, lng: 0, horarios: [] }),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('admin.supabase.ts — hubsCrud.update (Story 4.1, AC1, AC4)', () => {
  it('aplica patch parcial (ativo: false) e relê o estado real — nunca ecoa o input', async () => {
    const hubDesativado = { ...HUB_ROW, ativo: false };
    const { client, from } = fakeClient({
      hubs: [{ data: null, error: null }, { data: hubDesativado, error: null }],
      hubsHorarios: [{ data: [], error: null }],
    });
    const port = createAdminSupabase(client);

    const updated = await port.hubsCrud.update('hub-1', { ativo: false });

    expect(from).toHaveBeenCalledWith('hubs');
    expect(updated.ativo).toBe(false);
  });

  it('reativa um hub inativo (ativo: true) — mesma rota, sem tratamento especial', async () => {
    const { client } = fakeClient({
      hubs: [{ data: null, error: null }, { data: HUB_ROW, error: null }],
      hubsHorarios: [{ data: [], error: null }],
    });
    const port = createAdminSupabase(client);

    const updated = await port.hubsCrud.update('hub-1', { ativo: true });
    expect(updated.ativo).toBe(true);
  });

  it('substitui horarios (delete + insert) quando informado, sem tocar hubs (nenhum outro campo no patch)', async () => {
    // Sequência real do adapter quando `input` só tem `horarios`: (1) DELETE
    // hubs_horarios, (2) INSERT hubs_horarios, (3) reread `hubs` (SELECT),
    // (4) reread `hubs_horarios` (SELECT) — `.from('hubs').update()` NUNCA
    // é chamado porque o patch fica vazio.
    const { client, from } = fakeClient({
      hubs: [{ data: HUB_ROW, error: null }],
      hubsHorarios: [
        { data: null, error: null }, // DELETE
        { data: null, error: null }, // INSERT
        { data: [HORARIO_ROW], error: null }, // reread
      ],
    });
    const port = createAdminSupabase(client);

    const updated = await port.hubsCrud.update('hub-1', {
      horarios: [{ dia_semana: 1, aberto: true, hora_abre: '08:00', hora_fecha: '20:00' }],
    });

    expect(from).toHaveBeenCalledWith('hubs_horarios');
    expect(from).toHaveBeenCalledTimes(4);
    expect(updated.horarios).toEqual([{ dia_semana: 1, aberto: true, hora_abre: '08:00', hora_fecha: '20:00' }]);
  });

  it('propaga erro do UPDATE sem sucesso fictício', async () => {
    const { client } = fakeClient({ hubs: [{ data: null, error: new Error('network down') }] });
    const port = createAdminSupabase(client);
    await expect(port.hubsCrud.update('hub-1', { nome: 'X' })).rejects.toThrow('network down');
  });
});

describe('admin.supabase.ts — hubsCrud.delete (Story 4.1, Dependencies)', () => {
  it('sucesso: chama DELETE filtrado por id', async () => {
    const { client, from } = fakeClient({ hubs: [{ data: null, error: null }] });
    const port = createAdminSupabase(client);
    await port.hubsCrud.delete('hub-1');
    expect(from).toHaveBeenCalledWith('hubs');
  });

  it('propaga erro de FK (pedidos.hub_id ON DELETE RESTRICT) sem capturar/traduzir', async () => {
    const { client } = fakeClient({
      hubs: [{ data: null, error: new Error('update or delete on table "hubs" violates foreign key constraint') }],
    });
    const port = createAdminSupabase(client);
    await expect(port.hubsCrud.delete('hub-1')).rejects.toThrow(/foreign key constraint/);
  });
});

describe('admin.supabase.ts — hubsCrud.uploadFoto (Story 4.1, AC2, AC6)', () => {
  // [IDS] REUSE do padrão `vi.stubGlobal('fetch', ...)` já usado em
  // `estabelecimento-cadastro.supabase.test.ts#uploadFachada` — evita
  // depender do runtime de teste resolver URIs de verdade (blob:/data:).

  it('faz upload para o bucket público hubs (path aleatório) e devolve a URL pública direta (nunca assinada)', async () => {
    const upload = vi.fn(async () => ({ data: { path: 'ok' }, error: null }));
    const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://public.example/hubs/${path}` } }));
    const { client } = fakeClient({ upload, getPublicUrl });
    const fakeBlob = { size: 10, type: 'image/jpeg' };
    const fetchMock = vi.fn(async (uri: string) => {
      expect(uri).toBe('blob:http://localhost/foto-hub');
      return { blob: async () => fakeBlob };
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const port = createAdminSupabase(client);
      const url = await port.hubsCrud.uploadFoto({ uri: 'blob:http://localhost/foto-hub', ext: 'jpg' });

      expect(fetchMock).toHaveBeenCalledWith('blob:http://localhost/foto-hub');
      expect(upload).toHaveBeenCalledWith(
        expect.stringMatching(/^[0-9a-f-]+\.jpg$/),
        fakeBlob,
        expect.objectContaining({ contentType: 'image/jpeg', upsert: true }),
      );
      expect(getPublicUrl).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]+\.jpg$/));
      expect(url).toMatch(/^https:\/\/public\.example\/hubs\//);
      expect(url).not.toMatch(/token=/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('propaga erro de upload (ex.: RLS de storage negando para não-admin) sem sucesso fictício', async () => {
    const upload = vi.fn(async () => ({ data: null, error: new Error('new row violates row-level security policy') }));
    const { client } = fakeClient({ upload });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => ({ size: 10, type: 'image/png' }) })),
    );

    try {
      const port = createAdminSupabase(client);
      await expect(port.hubsCrud.uploadFoto({ uri: 'blob:http://localhost/foto-hub', ext: 'png' })).rejects.toThrow(
        /row-level security/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
