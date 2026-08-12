import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import { createStoreSupabase } from './store.supabase';

/**
 * Story 3.3 (AC2, AC4) — `checkCnpjDisponivel` é o ÚNICO método de
 * `store.supabase.ts` que não lança `NotImplementedError` (coberto
 * separadamente de `supabase-adapters.test.ts`, que só testa o padrão
 * genérico de stub). Ver JSDoc do método em `store.supabase.ts` para o
 * porquê do seam honesto.
 */
describe('store.supabase.ts — checkCnpjDisponivel (Story 3.3, AC2, AC4)', () => {
  it('resolve sempre true — SEAM HONESTO até estabelecimentos existir (Stories 3.4/3.5)', async () => {
    const port = createStoreSupabase();
    await expect(port.checkCnpjDisponivel('11.222.333/0001-81')).resolves.toBe(true);
  });

  it('resolve true independente do CNPJ informado (nenhuma lógica de duplicidade real ainda)', async () => {
    const port = createStoreSupabase();
    await expect(port.checkCnpjDisponivel('45.234.567/0001-60')).resolves.toBe(true);
    await expect(port.checkCnpjDisponivel('00000000000000')).resolves.toBe(true);
  });

  it('NÃO toca o SupabaseClient — nenhuma tentativa de consultar a tabela estabelecimentos inexistente', async () => {
    const from = vi.fn();
    const fakeClient = { from } as unknown as SupabaseClient<Database>;

    const port = createStoreSupabase(fakeClient);
    await port.checkCnpjDisponivel('11.222.333/0001-81');

    expect(from).not.toHaveBeenCalled();
  });
});

/**
 * Stories 4.7/4.8 — [IDS] REUSE do padrão de query builder encadeável já
 * estabelecido em `product.supabase.test.ts` (Stories 4.3-4.6), estendido
 * para suportar 2 tabelas por chamada (`estabelecimentos` +
 * `estabelecimentos_horarios`, como `getById`/`setPausadoManualmente` já
 * fazem).
 */
type QueryResult = { data: unknown; error: unknown };

function makeQueryBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.upsert = vi.fn(async () => result);
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function fakeClient(results: { estabelecimentos?: QueryResult; estabelecimentos_horarios?: QueryResult }): {
  client: SupabaseClient<Database>;
  from: (table: string) => unknown;
  builders: { estabelecimentos: Record<string, unknown>; estabelecimentos_horarios: Record<string, unknown> };
} {
  const builders = {
    estabelecimentos: makeQueryBuilder(results.estabelecimentos ?? { data: null, error: null }),
    estabelecimentos_horarios: makeQueryBuilder(results.estabelecimentos_horarios ?? { data: [], error: null }),
  };
  const from = vi.fn((table: string) => builders[table as 'estabelecimentos' | 'estabelecimentos_horarios']);
  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, from, builders };
}

const ESTABELECIMENTO_ROW = {
  id: 'estab-1',
  nome_fantasia: 'Farmácia Vida',
  categoria: 'farmacia',
  descricao: null,
  foto_fachada_url: null,
  endereco: 'Rua X, 100',
  lat: -23.5,
  lng: -46.6,
  raio_atendimento_km: 3,
  tempo_medio_entrega_min: 30,
  taxa_deslocamento_reais: 5,
  ticket_minimo_reais: null,
  status: 'ativo',
  motivo_rejeicao: null,
  motivo_suspensao: null,
  pausado_manualmente: false,
};

const HORARIOS_ROWS = [
  { dia_semana: 0, aberto: false, hora_abre: null, hora_fecha: null },
  { dia_semana: 1, aberto: true, hora_abre: '09:00', hora_fecha: '18:00' },
];

describe('store.supabase.ts — getById (Stories 4.7/4.8, AUTO-DECISION escopo estreito)', () => {
  it('devolve o Estabelecimento real com horarios ordenados por dia_semana', async () => {
    const { client, builders } = fakeClient({
      estabelecimentos: { data: ESTABELECIMENTO_ROW, error: null },
      estabelecimentos_horarios: { data: [HORARIOS_ROWS[1], HORARIOS_ROWS[0]], error: null },
    });
    const port = createStoreSupabase(client);

    const estabelecimento = await port.getById('estab-1');

    expect(builders.estabelecimentos.eq).toHaveBeenCalledWith('id', 'estab-1');
    expect(builders.estabelecimentos_horarios.eq).toHaveBeenCalledWith('estabelecimento_id', 'estab-1');
    expect(estabelecimento?.id).toBe('estab-1');
    expect(estabelecimento?.pausado_manualmente).toBe(false);
    expect(estabelecimento?.horarios).toEqual([HORARIOS_ROWS[0], HORARIOS_ROWS[1]]);
  });

  it('devolve null quando o id não existe / RLS bloqueia (sem lançar)', async () => {
    const { client } = fakeClient({ estabelecimentos: { data: null, error: null } });
    const port = createStoreSupabase(client);

    await expect(port.getById('estab-de-outro-dono')).resolves.toBeNull();
  });

  it('propaga o erro do SDK sem sucesso fictício', async () => {
    const { client } = fakeClient({ estabelecimentos: { data: null, error: new Error('network error') } });
    const port = createStoreSupabase(client);

    await expect(port.getById('estab-1')).rejects.toThrow(/network error/);
  });
});

describe('store.supabase.ts — setPausadoManualmente (Story 4.8, AC1, AC2, AC4)', () => {
  it('faz UPDATE pausado_manualmente=true e relê o Estabelecimento real (nunca ecoa o input)', async () => {
    const { client, builders } = fakeClient({
      estabelecimentos: { data: { ...ESTABELECIMENTO_ROW, pausado_manualmente: true }, error: null },
    });
    const port = createStoreSupabase(client);

    const atualizado = await port.setPausadoManualmente('estab-1', true);

    expect(builders.estabelecimentos.update).toHaveBeenCalledWith({ pausado_manualmente: true });
    expect(builders.estabelecimentos.eq).toHaveBeenCalledWith('id', 'estab-1');
    expect(atualizado.pausado_manualmente).toBe(true);
  });

  it('reverte pausado_manualmente=false com o mesmo mecanismo (AC4)', async () => {
    const { client, builders } = fakeClient({
      estabelecimentos: { data: { ...ESTABELECIMENTO_ROW, pausado_manualmente: false }, error: null },
    });
    const port = createStoreSupabase(client);

    const atualizado = await port.setPausadoManualmente('estab-1', false);

    expect(builders.estabelecimentos.update).toHaveBeenCalledWith({ pausado_manualmente: false });
    expect(atualizado.pausado_manualmente).toBe(false);
  });

  it('RLS bloqueando UPDATE de estabelecimento de outro dono — 0 linhas afetadas, releitura rejeita (AC2)', async () => {
    const { client } = fakeClient({ estabelecimentos: { data: null, error: null } });
    const port = createStoreSupabase(client);

    await expect(port.setPausadoManualmente('estab-de-outro-dono', true)).rejects.toThrow(/não encontrou a linha/);
  });

  it('propaga erro do SDK no UPDATE sem sucesso fictício', async () => {
    const { client } = fakeClient({ estabelecimentos: { data: null, error: { message: 'connection refused' } } });
    const port = createStoreSupabase(client);

    await expect(port.setPausadoManualmente('estab-1', true)).rejects.toMatchObject({
      message: 'connection refused',
    });
  });
});

describe('store.supabase.ts — updateHorarios (Story 4.7, AC1, AC3)', () => {
  const HORARIOS_VALIDOS = [
    { dia_semana: 0, aberto: false, hora_abre: null, hora_fecha: null },
    { dia_semana: 1, aberto: true, hora_abre: '08:00', hora_fecha: '18:00' },
  ];

  it('faz UPSERT das linhas (onConflict estabelecimento_id,dia_semana) e relê os horarios reais', async () => {
    const { client, builders } = fakeClient({
      estabelecimentos_horarios: { data: HORARIOS_VALIDOS, error: null },
    });
    const port = createStoreSupabase(client);

    const resultado = await port.updateHorarios('estab-1', HORARIOS_VALIDOS);

    expect(builders.estabelecimentos_horarios.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ estabelecimento_id: 'estab-1', dia_semana: 1, hora_abre: '08:00', hora_fecha: '18:00' }),
        expect.objectContaining({ estabelecimento_id: 'estab-1', dia_semana: 0, hora_abre: null, hora_fecha: null }),
      ]),
      { onConflict: 'estabelecimento_id,dia_semana' },
    );
    expect(resultado).toEqual(HORARIOS_VALIDOS);
  });

  it('rejeita ANTES de tocar a rede quando aberto=true e hora_abre >= hora_fecha (defesa em profundidade, AC1)', async () => {
    const { client, builders } = fakeClient({});
    const port = createStoreSupabase(client);

    await expect(
      port.updateHorarios('estab-1', [{ dia_semana: 1, aberto: true, hora_abre: '18:00', hora_fecha: '08:00' }]),
    ).rejects.toThrow(/hora_abre/);
    expect(builders.estabelecimentos_horarios.upsert).not.toHaveBeenCalled();
  });

  it('propaga violação do CHECK do banco sem sucesso fictício', async () => {
    const { client } = fakeClient({
      estabelecimentos_horarios: {
        data: null,
        error: { message: 'new row for relation "estabelecimentos_horarios" violates check constraint' },
      },
    });
    const port = createStoreSupabase(client);

    await expect(
      port.updateHorarios('estab-1', [{ dia_semana: 1, aberto: true, hora_abre: '08:00', hora_fecha: '18:00' }]),
    ).rejects.toMatchObject({ message: expect.stringMatching(/check constraint/) });
  });
});
