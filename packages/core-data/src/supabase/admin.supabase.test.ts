import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import { createAdminSupabase } from './admin.supabase';

/**
 * Story 3.7 (AC2, AC3, AC4) — `pendingStores`/`pendingStoreDetail`.
 * Stories 3.8/3.9 (AC1-AC4) — `approve`/`reject`. Junto com
 * `pendingStores`/`pendingStoreDetail`, são os ÚNICOS métodos de
 * `admin.supabase.ts` que não lançam `NotImplementedError` (os demais
 * seguem cobertos pelo teste genérico de esqueleto em
 * `supabase-adapters.test.ts`). Mesmo padrão de fake client encadeável de
 * `store.supabase.test.ts`/`lojista-auth.supabase.test.ts`.
 */

type QueryResult = { data: unknown; error: unknown };
type RpcResult = { data: unknown; error: { message: string } | null };

function makeQueryBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function fakeClient(options: {
  estabelecimentos?: QueryResult[];
  estabelecimentosHorarios?: QueryResult[];
  createSignedUrl?: (path: string, expiresIn: number) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
  rpc?: (fn: string, args: unknown) => Promise<RpcResult>;
}) {
  const queues: Record<string, QueryResult[]> = {
    estabelecimentos: [...(options.estabelecimentos ?? [])],
    estabelecimentos_horarios: [...(options.estabelecimentosHorarios ?? [])],
  };
  const from = vi.fn((table: string) => {
    const result = queues[table]?.shift() ?? { data: null, error: null };
    return makeQueryBuilder(result);
  });
  const createSignedUrl =
    options.createSignedUrl ?? vi.fn(async () => ({ data: { signedUrl: 'https://signed.example/never-called' }, error: null }));
  const storage = { from: vi.fn(() => ({ createSignedUrl })) };
  const rpc = vi.fn(async (fn: string, args: unknown) => {
    if (fn === 'obter_estabelecimentos_privados') {
      const result = queues.estabelecimentos?.shift() ?? { data: [], error: null };
      return { ...result, data: result.data == null ? null : Array.isArray(result.data) ? result.data : [result.data] };
    }
    return options.rpc ? options.rpc(fn, args) : { data: null, error: null };
  });
  return { client: { from, storage, rpc } as unknown as SupabaseClient<Database>, from, rpc };
}

const ROW_ATIVO_APOS_APROVACAO = {
  id: 'estab-1',
  nome_fantasia: 'Padoca Nova',
  cnpj: '11.222.333/0001-81',
  categoria: 'alimentacao',
  descricao: null,
  foto_fachada_url: null,
  endereco: 'Rua Nova, 10',
  lat: null,
  lng: null,
  raio_atendimento_km: null,
  tempo_medio_entrega_min: 25,
  taxa_deslocamento_reais: 4,
  ticket_minimo_reais: null,
  chave_pix: 'contato@padocanova.com.br',
  chave_pix_tipo: 'email',
  status: 'ativo',
  motivo_rejeicao: null,
  motivo_suspensao: null,
  pausado_manualmente: false,
  responsavel_nome: 'Fulano de Tal',
  telefone: '(11) 91234-5678',
  dados_receita: null,
  criado_em: '2026-08-10T09:00:00.000Z',
  aprovado_em: '2026-08-12T10:00:00.000Z',
  aprovado_por: 'admin-uid-1',
};

const ROW_REJEITADO = {
  ...ROW_ATIVO_APOS_APROVACAO,
  status: 'rejeitado',
  motivo_rejeicao: 'CNPJ divergente do informado',
  aprovado_em: null,
  aprovado_por: null,
};

const ROW_EM_ANALISE = {
  id: 'estab-1',
  nome_fantasia: 'Padoca Nova',
  cnpj: '11.222.333/0001-81',
  categoria: 'alimentacao',
  descricao: null,
  foto_fachada_url: 'uid-1/fachada.jpg',
  endereco: 'Rua Nova, 10',
  lat: null,
  lng: null,
  raio_atendimento_km: null,
  tempo_medio_entrega_min: 25,
  taxa_deslocamento_reais: 4,
  ticket_minimo_reais: null,
  chave_pix: 'contato@padocanova.com.br',
  chave_pix_tipo: 'email',
  status: 'em_analise',
  motivo_rejeicao: null,
  motivo_suspensao: null,
  pausado_manualmente: false,
  responsavel_nome: 'Fulano de Tal',
  telefone: '(11) 91234-5678',
  dados_receita: null,
  criado_em: '2026-08-10T09:00:00.000Z',
  aprovado_em: null,
  aprovado_por: null,
};

const HORARIO_SEGUNDA = { estabelecimento_id: 'estab-1', dia_semana: 1, aberto: true, hora_abre: '09:00', hora_fecha: '18:00' };

describe('admin.supabase.ts — pendingStores (Story 3.7, AC2, AC4)', () => {
  it('mapeia as linhas retornadas para EstabelecimentoAdmin, incluindo horarios', async () => {
    const { client, rpc } = fakeClient({
      estabelecimentos: [{ data: [ROW_EM_ANALISE], error: null }],
      estabelecimentosHorarios: [{ data: [HORARIO_SEGUNDA], error: null }],
    });

    const port = createAdminSupabase(client);
    const pendentes = await port.pendingStores();

    expect(rpc).toHaveBeenCalledWith('obter_estabelecimentos_privados', { p_id: null });
    expect(pendentes).toHaveLength(1);
    expect(pendentes[0]).toMatchObject({
      id: 'estab-1',
      nome_fantasia: 'Padoca Nova',
      cnpj: '11.222.333/0001-81',
      telefone: '(11) 91234-5678',
      responsavel_nome: 'Fulano de Tal',
      criado_em: '2026-08-10T09:00:00.000Z',
      status: 'em_analise',
    });
    expect(pendentes[0].horarios).toEqual([{ dia_semana: 1, aberto: true, hora_abre: '09:00', hora_fecha: '18:00' }]);
    // Lista (AC2) não gera URL assinada por item — `undefined`, não `null`.
    expect(pendentes[0].foto_fachada_url_assinada).toBeUndefined();
  });

  it('solicita dados privados pela RPC autorizada e filtra somente pendentes', async () => {
    const { client, rpc } = fakeClient({ estabelecimentos: [{ data: [ROW_EM_ANALISE, ROW_ATIVO_APOS_APROVACAO], error: null }] });
    const pendentes = await createAdminSupabase(client).pendingStores();
    expect(rpc).toHaveBeenCalledWith('obter_estabelecimentos_privados', { p_id: null });
    expect(pendentes.map((row) => row.status)).toEqual(['em_analise']);
  });

  it('RLS bloqueando um não-admin resolve em lista vazia — nunca um erro nem vazamento parcial (AC4)', async () => {
    const { client } = fakeClient({ estabelecimentos: [{ data: [], error: null }] });
    const port = createAdminSupabase(client);
    await expect(port.pendingStores()).resolves.toEqual([]);
  });

  it('propaga o erro do SDK sem sucesso fictício', async () => {
    const { client } = fakeClient({ estabelecimentos: [{ data: null, error: new Error('network down') }] });
    const port = createAdminSupabase(client);
    await expect(port.pendingStores()).rejects.toThrow('network down');
  });
});

describe('admin.supabase.ts — pendingStoreDetail (Story 3.7, AC3)', () => {
  it('retorna null quando o id não existe — honesto, sem lançar', async () => {
    const { client } = fakeClient({ estabelecimentos: [{ data: null, error: null }] });
    const port = createAdminSupabase(client);
    await expect(port.pendingStoreDetail('inexistente')).resolves.toBeNull();
  });

  it('gera URL assinada quando foto_fachada_url está presente (AC3)', async () => {
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://signed.example/uid-1/fachada.jpg?token=abc' }, error: null }));
    const { client } = fakeClient({
      estabelecimentos: [{ data: ROW_EM_ANALISE, error: null }],
      estabelecimentosHorarios: [{ data: [HORARIO_SEGUNDA], error: null }],
      createSignedUrl,
    });

    const port = createAdminSupabase(client);
    const detalhe = await port.pendingStoreDetail('estab-1');

    expect(createSignedUrl).toHaveBeenCalledWith('uid-1/fachada.jpg', 300);
    expect(detalhe?.foto_fachada_url_assinada).toBe('https://signed.example/uid-1/fachada.jpg?token=abc');
  });

  it('não chama Storage quando foto_fachada_url é null — sem tentar assinar um path inexistente', async () => {
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'nunca chamado' }, error: null }));
    const { client } = fakeClient({
      estabelecimentos: [{ data: { ...ROW_EM_ANALISE, foto_fachada_url: null }, error: null }],
      estabelecimentosHorarios: [{ data: [], error: null }],
      createSignedUrl,
    });

    const port = createAdminSupabase(client);
    const detalhe = await port.pendingStoreDetail('estab-1');

    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(detalhe?.foto_fachada_url_assinada).toBeNull();
  });

  it('dados_receita null é exibido honestamente como null — nunca um dado inventado (AC3)', async () => {
    const { client } = fakeClient({
      estabelecimentos: [{ data: ROW_EM_ANALISE, error: null }],
      estabelecimentosHorarios: [{ data: [], error: null }],
    });
    const port = createAdminSupabase(client);
    const detalhe = await port.pendingStoreDetail('estab-1');
    expect(detalhe?.dados_receita).toBeNull();
  });

  it('[FIX REL-001] degrada graciosamente quando createSignedUrl retorna erro — detalhe completo, foto null, nunca lança', async () => {
    const createSignedUrl = vi.fn(async () => ({ data: null, error: new Error('object not found') }));
    const { client } = fakeClient({
      estabelecimentos: [{ data: ROW_EM_ANALISE, error: null }],
      estabelecimentosHorarios: [{ data: [HORARIO_SEGUNDA], error: null }],
      createSignedUrl,
    });

    const port = createAdminSupabase(client);
    const detalhe = await port.pendingStoreDetail('estab-1');

    expect(detalhe).not.toBeNull();
    expect(detalhe?.foto_fachada_url_assinada).toBeNull();
    // Restante do detalhe intacto — não derruba a tela por causa da foto.
    expect(detalhe).toMatchObject({
      id: 'estab-1',
      nome_fantasia: 'Padoca Nova',
      cnpj: '11.222.333/0001-81',
      responsavel_nome: 'Fulano de Tal',
      telefone: '(11) 91234-5678',
      chave_pix: 'contato@padocanova.com.br',
    });
    expect(detalhe?.horarios).toEqual([{ dia_semana: 1, aberto: true, hora_abre: '09:00', hora_fecha: '18:00' }]);
  });

  it('[FIX REL-001] degrada graciosamente quando createSignedUrl lança (ex.: RLS de storage negando) — foto null, resto intacto', async () => {
    const createSignedUrl = vi.fn(async () => {
      throw new Error('StorageApiError: new row violates row-level security policy');
    });
    const { client } = fakeClient({
      estabelecimentos: [{ data: ROW_EM_ANALISE, error: null }],
      estabelecimentosHorarios: [{ data: [], error: null }],
      createSignedUrl,
    });

    const port = createAdminSupabase(client);
    const detalhe = await port.pendingStoreDetail('estab-1');

    expect(detalhe).not.toBeNull();
    expect(detalhe?.foto_fachada_url_assinada).toBeNull();
    expect(detalhe?.dados_receita).toBeNull();
    expect(detalhe?.cnpj).toBe('11.222.333/0001-81');
  });

  it('propaga erro da query principal (estabelecimentos) sem sucesso fictício — só a assinatura da foto é não-fatal', async () => {
    const { client } = fakeClient({ estabelecimentos: [{ data: null, error: new Error('network down') }] });
    const port = createAdminSupabase(client);
    await expect(port.pendingStoreDetail('estab-1')).rejects.toThrow('network down');
  });
});

describe('admin.supabase.ts — approve (Story 3.8, AC1-AC4)', () => {
  it('sucesso: chama a RPC aprovar_lojista com p_estab_id e devolve o estabelecimento relido (status ativo, aprovado_em/aprovado_por)', async () => {
    const { client, rpc } = fakeClient({
      rpc: async () => ({ data: 'estab-1', error: null }),
      estabelecimentos: [{ data: ROW_ATIVO_APOS_APROVACAO, error: null }],
      estabelecimentosHorarios: [{ data: [], error: null }],
    });

    const port = createAdminSupabase(client);
    const resultado = await port.approve('estab-1');

    expect(rpc).toHaveBeenCalledWith('aprovar_lojista', { p_estab_id: 'estab-1' });
    expect(resultado).toMatchObject({
      id: 'estab-1',
      status: 'ativo',
    });
    // AC4 — trilha auditável: `aprovado_em`/`aprovado_por` vêm da releitura pós-RPC.
    expect((resultado as unknown as { aprovado_em: string | null }).aprovado_em).toBe('2026-08-12T10:00:00.000Z');
    expect((resultado as unknown as { aprovado_por: string | null }).aprovado_por).toBe('admin-uid-1');
  });

  it('AUTENTICACAO_NECESSARIA — rejeita com AutenticacaoNecessariaError, sem sucesso simulado e sem reler o banco', async () => {
    const { client, from } = fakeClient({
      rpc: async () => ({ data: null, error: { message: 'AUTENTICACAO_NECESSARIA' } }),
    });
    const port = createAdminSupabase(client);

    await expect(port.approve('estab-1')).rejects.toThrow(/AUTENTICACAO_NECESSARIA/);
    // AC3 — sem atualização otimista: falha da RPC nunca dispara releitura/mutação local.
    expect(from).not.toHaveBeenCalled();
  });

  it('ACESSO_NEGADO — rejeita com AcessoNegadoError (is_admin() falso)', async () => {
    const { client } = fakeClient({ rpc: async () => ({ data: null, error: { message: 'ACESSO_NEGADO' } }) });
    const port = createAdminSupabase(client);
    await expect(port.approve('estab-1')).rejects.toThrow(/ACESSO_NEGADO/);
  });

  it('ESTABELECIMENTO_NAO_ENCONTRADO — rejeita com EstabelecimentoNaoEncontradoError', async () => {
    const { client } = fakeClient({
      rpc: async () => ({ data: null, error: { message: 'ESTABELECIMENTO_NAO_ENCONTRADO' } }),
    });
    const port = createAdminSupabase(client);
    await expect(port.approve('id-inexistente')).rejects.toThrow(/ESTABELECIMENTO_NAO_ENCONTRADO/);
  });

  it('ESTADO_INVALIDO — lojista já não está em_analise (ex.: já ativo/rejeitado) rejeita com EstadoInvalidoError, sem mudar status', async () => {
    const { client, from } = fakeClient({ rpc: async () => ({ data: null, error: { message: 'ESTADO_INVALIDO' } }) });
    const port = createAdminSupabase(client);

    await expect(port.approve('estab-1')).rejects.toThrow(/ESTADO_INVALIDO/);
    expect(from).not.toHaveBeenCalled();
  });

  it('erro de rede/banco não nomeado propaga tal como recebido, sem simular sucesso', async () => {
    const { client } = fakeClient({ rpc: async () => ({ data: null, error: { message: 'network down' } }) });
    const port = createAdminSupabase(client);
    await expect(port.approve('estab-1')).rejects.toThrow('network down');
  });
});

describe('admin.supabase.ts — reject (Story 3.9, AC1-AC4)', () => {
  it('sucesso: chama rejeitar_lojista com p_estab_id/p_motivo e devolve o estabelecimento relido (status rejeitado, motivo_rejeicao)', async () => {
    const { client, rpc } = fakeClient({
      rpc: async () => ({ data: 'estab-1', error: null }),
      estabelecimentos: [{ data: ROW_REJEITADO, error: null }],
      estabelecimentosHorarios: [{ data: [], error: null }],
    });

    const port = createAdminSupabase(client);
    const resultado = await port.reject('estab-1', 'CNPJ divergente do informado');

    expect(rpc).toHaveBeenCalledWith('rejeitar_lojista', {
      p_estab_id: 'estab-1',
      p_motivo: 'CNPJ divergente do informado',
    });
    expect(resultado).toMatchObject({
      id: 'estab-1',
      status: 'rejeitado',
      motivo_rejeicao: 'CNPJ divergente do informado',
    });
  });

  it('MOTIVO_OBRIGATORIO — motivo vazio (bypass do client) rejeita com MotivoObrigatorioError, sem mudar status', async () => {
    const { client, from } = fakeClient({
      rpc: async () => ({ data: null, error: { message: 'MOTIVO_OBRIGATORIO' } }),
    });
    const port = createAdminSupabase(client);

    await expect(port.reject('estab-1', '')).rejects.toThrow(/MOTIVO_OBRIGATORIO/);
    expect(from).not.toHaveBeenCalled();
  });

  it('AUTENTICACAO_NECESSARIA — rejeita com AutenticacaoNecessariaError', async () => {
    const { client } = fakeClient({
      rpc: async () => ({ data: null, error: { message: 'AUTENTICACAO_NECESSARIA' } }),
    });
    const port = createAdminSupabase(client);
    await expect(port.reject('estab-1', 'motivo válido')).rejects.toThrow(/AUTENTICACAO_NECESSARIA/);
  });

  it('ACESSO_NEGADO — rejeita com AcessoNegadoError', async () => {
    const { client } = fakeClient({ rpc: async () => ({ data: null, error: { message: 'ACESSO_NEGADO' } }) });
    const port = createAdminSupabase(client);
    await expect(port.reject('estab-1', 'motivo válido')).rejects.toThrow(/ACESSO_NEGADO/);
  });

  it('ESTABELECIMENTO_NAO_ENCONTRADO — rejeita com EstabelecimentoNaoEncontradoError', async () => {
    const { client } = fakeClient({
      rpc: async () => ({ data: null, error: { message: 'ESTABELECIMENTO_NAO_ENCONTRADO' } }),
    });
    const port = createAdminSupabase(client);
    await expect(port.reject('id-inexistente', 'motivo válido')).rejects.toThrow(/ESTABELECIMENTO_NAO_ENCONTRADO/);
  });

  it('ESTADO_INVALIDO — lojista já não está em_analise rejeita com EstadoInvalidoError, sem mudar status', async () => {
    const { client, from } = fakeClient({ rpc: async () => ({ data: null, error: { message: 'ESTADO_INVALIDO' } }) });
    const port = createAdminSupabase(client);

    await expect(port.reject('estab-1', 'motivo válido')).rejects.toThrow(/ESTADO_INVALIDO/);
    expect(from).not.toHaveBeenCalled();
  });

  it('erro de rede/banco não nomeado propaga tal como recebido, sem simular sucesso', async () => {
    const { client } = fakeClient({ rpc: async () => ({ data: null, error: { message: 'network down' } }) });
    const port = createAdminSupabase(client);
    await expect(port.reject('estab-1', 'motivo válido')).rejects.toThrow('network down');
  });
});

// =============================================================================
// Bloco 09 (Épico 8 — Operação Admin, Stories 8.1-8.9) — [IDS] REUSE do
// padrão de fake client encadeável, generalizado para múltiplas tabelas
// (`.order()`/`.gte()`/`.or()` adicionados como identidade na chain, mesmo
// espírito de `makeQueryBuilder` acima).
// =============================================================================

type TableQueue = Record<string, QueryResult[]>;

function makeChainableBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.or = vi.fn(() => builder);
  builder.gte = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.not = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.range = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function fakeTableClient(options: {
  tables?: TableQueue;
  rpc?: (fn: string, args: unknown) => Promise<RpcResult>;
  invoke?: (fn: string, args: unknown) => Promise<QueryResult>;
}) {
  const queues: TableQueue = { ...(options.tables ?? {}) };
  const from = vi.fn((table: string) => {
    const result = queues[table]?.shift() ?? { data: [], error: null };
    return makeChainableBuilder(result);
  });
  const rpc = vi.fn(async (fn: string, args: unknown) => {
    if (fn === 'obter_estabelecimentos_privados') {
      const result = queues.estabelecimentos?.shift() ?? { data: [], error: null };
      return { ...result, data: result.data == null ? null : Array.isArray(result.data) ? result.data : [result.data] };
    }
    return options.rpc ? options.rpc(fn, args) : { data: null, error: null };
  });
  const invoke = vi.fn(options.invoke ?? (async () => ({ data: null, error: null })));
  return { client: { from, rpc, functions: { invoke } } as unknown as SupabaseClient<Database>, from, rpc };
}

describe('admin.supabase.ts — refundQueue (Story 8.1, 8.2)', () => {
  it('reabre falha e libera reserva somente por RPC auditada com comprovação', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const { client } = fakeTableClient({ rpc });
    const port = createAdminSupabase(client);
    await port.refundQueue.reopen('refund-1', 'Gateway confirmou ausência de efeito');
    await port.refundQueue.release('refund-1', 'Gateway confirmou cancelamento');
    expect(rpc).toHaveBeenNthCalledWith(1, 'reabrir_execucao_reembolso', {
      p_lancamento_id: 'refund-1', p_comprovacao: 'Gateway confirmou ausência de efeito', p_operacao_id: expect.any(String),
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'liberar_reserva_reembolso', {
      p_lancamento_id: 'refund-1', p_comprovacao: 'Gateway confirmou cancelamento', p_operacao_id: expect.any(String),
    });
  });

  it('list mapeia lançamentos refund reais para ReembolsoPendente, excluindo pedido_id null (AC1, AC2, AC4, AC5)', async () => {
    const { client } = fakeTableClient({
      tables: {
        lancamentos_financeiros: [
          {
            data: [
              {
                id: 'lanc-1',
                estabelecimento_id: 'estab-1',
                pedido_id: 'pedido-1',
                tipo: 'refund',
                valor_centavos: -2900,
                status: 'pendente',
                criado_em: '2026-08-01T10:00:00.000Z',
                concluido_em: null,
                detalhe: 'Reembolso total (100%) por cancelamento forçado do admin. Motivo: teste',
                motivo_reembolso: 'pos_entrega', responsavel_reembolso: 'lojista',
                solicitacao_id: 'caso-1', asaas_id_externo: null, estado_reserva: 'ativa',
              },
              {
                id: 'lanc-2',
                estabelecimento_id: 'estab-2',
                pedido_id: null,
                tipo: 'refund',
                valor_centavos: -1000,
                status: 'pendente',
                criado_em: '2026-08-02T10:00:00.000Z',
                concluido_em: null,
                detalhe: null,
              },
            ],
            error: null,
          },
        ],
        pedidos: [{ data: [{ id: 'pedido-1', forma_pagamento: 'pix' }], error: null }],
      },
    });

    const port = createAdminSupabase(client);
    const fila = await port.refundQueue.list();

    expect(fila).toHaveLength(1);
    expect(fila[0]).toMatchObject({
      id: 'lanc-1',
      pedido_id: 'pedido-1',
      motivo: 'pos_entrega', responsavel: 'lojista', caso_id: 'caso-1',
      valor_a_estornar_reais: 29,
      valor_ao_lojista_reais: 0,
      forma_pagamento: 'pix',
      status: 'pendente_admin',
    });
  });

  it('list mapeia status ledger -> UI (pendente->pendente_admin, concluido->estornado, erro->erro)', async () => {
    const { client } = fakeTableClient({
      tables: {
        lancamentos_financeiros: [
          {
            data: [
              {
                id: 'lanc-concluido',
                estabelecimento_id: 'estab-1',
                pedido_id: 'pedido-1',
                tipo: 'refund',
                valor_centavos: -500,
                status: 'concluido',
                criado_em: '2026-08-01T10:00:00.000Z',
                concluido_em: '2026-08-02T10:00:00.000Z',
                detalhe: null,
              },
            ],
            error: null,
          },
        ],
        pedidos: [{ data: [{ id: 'pedido-1', forma_pagamento: 'cartao' }], error: null }],
      },
    });

    const port = createAdminSupabase(client);
    const fila = await port.refundQueue.list();
    expect(fila[0].status).toBe('estornado');
  });

  it('process confirma manualmente pela nova RPC com referência externa e relê o lançamento', async () => {
    const rpc = vi.fn(async () => ({ data: [{ lancamento_id: 'lanc-1' }], error: null }));
    const { client } = fakeTableClient({
      rpc,
      tables: {
        lancamentos_financeiros: [
          {
            data: {
              id: 'lanc-1',
              estabelecimento_id: 'estab-1',
              pedido_id: 'pedido-1',
              tipo: 'refund',
              valor_centavos: -500,
              status: 'concluido',
              criado_em: '2026-08-01T10:00:00.000Z',
              concluido_em: '2026-08-02T10:00:00.000Z',
              detalhe: null,
            },
            error: null,
          },
        ],
        pedidos: [{ data: [{ id: 'pedido-1', forma_pagamento: 'pix' }], error: null }],
      },
    });

    const port = createAdminSupabase(client);
    const resultado = await port.refundQueue.process('lanc-1', 'concluido', 'referência pix 123');

    expect(rpc).toHaveBeenCalledWith('registrar_execucao_reembolso', {
      p_lancamento_id: 'lanc-1',
      p_resultado: 'concluido',
      p_referencia: 'referência pix 123',
      p_operacao_id: expect.any(String),
      p_detalhe: null,
    });
    expect(resultado.status).toBe('estornado');
  });

  it.each([
    ['AUTENTICACAO_NECESSARIA', /AUTENTICACAO_NECESSARIA/],
    ['NAO_AUTORIZADO', /NAO_AUTORIZADO/],
    ['RESULTADO_INVALIDO', /RESULTADO_INVALIDO/],
    ['LANCAMENTO_NAO_ENCONTRADO', /LANCAMENTO_NAO_ENCONTRADO/],
    ['TIPO_INVALIDO', /TIPO_INVALIDO/],
    ['ESTADO_INVALIDO', /ESTADO_INVALIDO/],
  ])('process — %s rejeita com o erro nomeado correspondente, nunca sucesso fictício', async (code, matcher) => {
    const { client } = fakeTableClient({ rpc: async () => ({ data: null, error: { message: code } }) });
    const port = createAdminSupabase(client);
    await expect(port.refundQueue.process('lanc-1', 'concluido', 'ref-1')).rejects.toThrow(matcher);
  });

  it('process(resultado="erro") nunca simula sucesso — RPC chamada com p_resultado=erro', async () => {
    const rpc = vi.fn(async () => ({ data: [{ lancamento_id: 'lanc-1' }], error: null }));
    const { client } = fakeTableClient({
      rpc,
      tables: {
        lancamentos_financeiros: [
          {
            data: {
              id: 'lanc-1',
              estabelecimento_id: 'estab-1',
              pedido_id: 'pedido-1',
              tipo: 'refund',
              valor_centavos: -500,
              status: 'erro',
              criado_em: '2026-08-01T10:00:00.000Z',
              concluido_em: '2026-08-02T10:00:00.000Z',
              detalhe: 'PIX falhou',
            },
            error: null,
          },
        ],
        pedidos: [{ data: [{ id: 'pedido-1', forma_pagamento: 'pix' }], error: null }],
      },
    });

    const port = createAdminSupabase(client);
    const resultado = await port.refundQueue.process('lanc-1', 'erro', 'PIX falhou');

    expect(rpc).toHaveBeenCalledWith('registrar_execucao_reembolso', {
      p_lancamento_id: 'lanc-1',
      p_resultado: 'erro',
      p_referencia: null,
      p_operacao_id: expect.any(String),
      p_detalhe: 'PIX falhou',
    });
    expect(resultado.status).toBe('erro');
  });
});

describe('admin.supabase.ts — payoutQueue (Story 8.9)', () => {
  it('list lê lancamentos_financeiros tipo=payout status=pendente e mapeia para Saque', async () => {
    const { client, from } = fakeTableClient({
      tables: {
        lancamentos_financeiros: [
          {
            data: [
              {
                id: 'payout-1',
                estabelecimento_id: 'estab-1',
                valor_centavos: 15000,
                status: 'pendente',
                criado_em: '2026-08-01T10:00:00.000Z',
                concluido_em: null,
              },
            ],
            error: null,
          },
        ],
      },
    });

    const port = createAdminSupabase(client);
    const fila = await port.payoutQueue.list();

    expect(from).toHaveBeenCalledWith('lancamentos_financeiros');
    expect(fila).toHaveLength(1);
    expect(fila[0]).toMatchObject({
      id: 'payout-1',
      estabelecimento_id: 'estab-1',
      valor_reais: 150,
      status: 'solicitado',
    });
  });

  it('process não chama RPC antiga para payout avulso', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const { client } = fakeTableClient({ rpc });
    const port = createAdminSupabase(client);
    await expect(port.payoutQueue.process('payout-1', 'concluido')).rejects.toThrow('SAQUES_DESATIVADOS_USE_REPASSE_SEMANAL');
    expect(rpc).not.toHaveBeenCalled();
  });

});

describe('admin.supabase.ts — listClientes/blockCliente/unblockCliente (Story 8.5)', () => {
  it('listClientes sem busca lista todos os clientes', async () => {
    const { client, from } = fakeTableClient({
      tables: {
        clientes: [
          {
            data: [
              { id: 'cliente-1', nome: 'Ana', telefone: '11999999999', cpf: null, bloqueado: false, motivo_bloqueio: null, criado_em: '2026-01-01T00:00:00.000Z' },
            ],
            error: null,
          },
        ],
      },
    });

    const port = createAdminSupabase(client);
    const clientes = await port.listClientes();

    expect(from).toHaveBeenCalledWith('clientes');
    expect(clientes).toHaveLength(1);
    expect(clientes[0].nome).toBe('Ana');
  });

  it('listClientes com busca aplica filtro .or() em nome/telefone', async () => {
    const { client } = fakeTableClient({ tables: { clientes: [{ data: [], error: null }] } });
    const port = createAdminSupabase(client);
    await expect(port.listClientes({ busca: 'ana souza' })).resolves.toEqual([]);
  });

  it('blockCliente chama bloquear_cliente e relê o cliente completo (Story 8.5 AC3)', async () => {
    const rpc = vi.fn(async () => ({ data: [{ cliente_id: 'cliente-1', bloqueado: true, bloqueado_em: '2026-08-01T00:00:00.000Z' }], error: null }));
    const { client } = fakeTableClient({
      rpc,
      tables: {
        clientes: [
          {
            data: { id: 'cliente-1', nome: 'Ana', telefone: '11999999999', cpf: null, bloqueado: true, motivo_bloqueio: 'fraude', criado_em: '2026-01-01T00:00:00.000Z' },
            error: null,
          },
        ],
      },
    });

    const port = createAdminSupabase(client);
    const cliente = await port.blockCliente('cliente-1', 'fraude');

    expect(rpc).toHaveBeenCalledWith('bloquear_cliente', { p_cliente_id: 'cliente-1', p_motivo: 'fraude' });
    expect(cliente.bloqueado).toBe(true);
    expect(cliente.motivo_bloqueio).toBe('fraude');
  });

  it('blockCliente — MOTIVO_OBRIGATORIO rejeita com MotivoObrigatorioError', async () => {
    const { client } = fakeTableClient({ rpc: async () => ({ data: null, error: { message: 'MOTIVO_OBRIGATORIO' } }) });
    const port = createAdminSupabase(client);
    await expect(port.blockCliente('cliente-1', '')).rejects.toThrow(/MOTIVO_OBRIGATORIO/);
  });

  it('unblockCliente chama desbloquear_cliente e relê o cliente completo (Story 8.5 AC5)', async () => {
    const rpc = vi.fn(async () => ({ data: [{ cliente_id: 'cliente-1', bloqueado: false }], error: null }));
    const { client } = fakeTableClient({
      rpc,
      tables: {
        clientes: [
          {
            data: { id: 'cliente-1', nome: 'Ana', telefone: '11999999999', cpf: null, bloqueado: false, motivo_bloqueio: null, criado_em: '2026-01-01T00:00:00.000Z' },
            error: null,
          },
        ],
      },
    });

    const port = createAdminSupabase(client);
    const cliente = await port.unblockCliente('cliente-1');

    expect(rpc).toHaveBeenCalledWith('desbloquear_cliente', { p_cliente_id: 'cliente-1' });
    expect(cliente.bloqueado).toBe(false);
  });

  it('unblockCliente — CLIENTE_NAO_ENCONTRADO rejeita com ClienteNaoEncontradoError', async () => {
    const { client } = fakeTableClient({ rpc: async () => ({ data: null, error: { message: 'CLIENTE_NAO_ENCONTRADO' } }) });
    const port = createAdminSupabase(client);
    await expect(port.unblockCliente('id-inexistente')).rejects.toThrow(/CLIENTE_NAO_ENCONTRADO/);
  });
});

describe('admin.supabase.ts — listAllEstabelecimentos/suspendLojista/reactivateLojista (Story 8.6)', () => {
  const ESTAB_ROW = {
    id: 'estab-1',
    nome_fantasia: 'Padoca Nova',
    categoria: 'alimentacao',
    descricao: null,
    foto_fachada_url: null,
    endereco: 'Rua Nova, 10',
    lat: null,
    lng: null,
    raio_atendimento_km: null,
    tempo_medio_entrega_min: 25,
    taxa_deslocamento_reais: 4,
    ticket_minimo_reais: null,
    status: 'suspenso',
    motivo_rejeicao: null,
    motivo_suspensao: null,
    pausado_manualmente: false,
  };

  it('listAllEstabelecimentos não filtra por status — admin vê ativos, suspensos, em_analise, rejeitados', async () => {
    const { client, from } = fakeTableClient({
      tables: {
        estabelecimentos: [{ data: [{ ...ESTAB_ROW, status: 'suspenso' }], error: null }],
        estabelecimentos_horarios: [{ data: [], error: null }],
      },
    });

    const port = createAdminSupabase(client);
    const todos = await port.listAllEstabelecimentos();

    expect(from).not.toHaveBeenCalledWith('estabelecimentos');
    expect(todos.some((e) => e.status === 'suspenso')).toBe(true);
  });

  it('suspendLojista chama suspender_lojista com os args corretos e relê o estabelecimento (Story 8.6 AC1-AC3)', async () => {
    const rpc = vi.fn(async () => ({ data: [{ estabelecimento_id: 'estab-1', status: 'suspenso', suspenso_em: '2026-08-01T00:00:00.000Z' }], error: null }));
    const { client } = fakeTableClient({
      rpc,
      tables: {
        estabelecimentos: [{ data: { ...ESTAB_ROW, motivo_suspensao: 'Reincidência' }, error: null }],
        estabelecimentos_horarios: [{ data: [], error: null }],
      },
    });

    const port = createAdminSupabase(client);
    const resultado = await port.suspendLojista('estab-1', 'Reincidência');

    expect(rpc).toHaveBeenCalledWith('suspender_lojista', { p_estabelecimento_id: 'estab-1', p_motivo: 'Reincidência' });
    expect(resultado.status).toBe('suspenso');
    expect(resultado.motivo_suspensao).toBe('Reincidência');
  });

  it('suspendLojista — ESTADO_INVALIDO (já suspenso/em_analise/rejeitado) rejeita sem mudar status', async () => {
    const { client } = fakeTableClient({ rpc: async () => ({ data: null, error: { message: 'ESTADO_INVALIDO' } }) });
    const port = createAdminSupabase(client);
    await expect(port.suspendLojista('estab-1', 'motivo')).rejects.toThrow(/ESTADO_INVALIDO/);
  });

  it('reactivateLojista chama reativar_lojista e relê o estabelecimento (Story 8.6 AC4 — capacidade nova)', async () => {
    const rpc = vi.fn(async () => ({ data: [{ estabelecimento_id: 'estab-1', status: 'ativo' }], error: null }));
    const { client } = fakeTableClient({
      rpc,
      tables: {
        estabelecimentos: [{ data: { ...ESTAB_ROW, status: 'ativo', motivo_suspensao: null }, error: null }],
        estabelecimentos_horarios: [{ data: [], error: null }],
      },
    });

    const port = createAdminSupabase(client);
    const resultado = await port.reactivateLojista('estab-1');

    expect(rpc).toHaveBeenCalledWith('reativar_lojista', { p_estabelecimento_id: 'estab-1' });
    expect(resultado.status).toBe('ativo');
  });

  it('reactivateLojista — ESTADO_INVALIDO (não estava suspenso) rejeita, nunca promove em_analise/rejeitado', async () => {
    const { client } = fakeTableClient({ rpc: async () => ({ data: null, error: { message: 'ESTADO_INVALIDO' } }) });
    const port = createAdminSupabase(client);
    await expect(port.reactivateLojista('estab-1')).rejects.toThrow(/ESTADO_INVALIDO/);
  });
});

describe('admin.supabase.ts — lojistaQualityView/lojistaOrderCounts (Story 8.8)', () => {
  it('lojistaQualityView lê estabelecimentos_falhas e trata detalhes null como string vazia (nunca dado inventado)', async () => {
    const { client, from } = fakeTableClient({
      tables: {
        estabelecimentos_falhas: [
          {
            data: [
              { id: 'falha-1', estabelecimento_id: 'estab-1', pedido_id: null, tipo: 'chargeback', detalhes: null, criado_em: '2026-08-01T00:00:00.000Z' },
            ],
            error: null,
          },
        ],
      },
    });

    const port = createAdminSupabase(client);
    const falhas = await port.lojistaQualityView('estab-1');

    expect(from).toHaveBeenCalledWith('estabelecimentos_falhas');
    expect(falhas[0].detalhes).toBe('');
  });

  it('lojistaQualityView resolve lista vazia para lojista sem falhas — nunca erro', async () => {
    const { client } = fakeTableClient({ tables: { estabelecimentos_falhas: [{ data: [], error: null }] } });
    const port = createAdminSupabase(client);
    await expect(port.lojistaQualityView('estab-sem-falhas')).resolves.toEqual([]);
  });

  it('lojistaOrderCounts agrega pedidos em entregues/cancelados/noShow', async () => {
    const { client } = fakeTableClient({
      tables: {
        pedidos: [
          {
            data: [
              { status: 'entregue' },
              { status: 'entregue' },
              { status: 'cancelado_admin' },
              { status: 'nao_retirado' },
              { status: 'aceito' },
            ],
            error: null,
          },
        ],
      },
    });

    const port = createAdminSupabase(client);
    const counts = await port.lojistaOrderCounts('estab-1');
    expect(counts).toEqual({ entregues: 2, cancelados: 1, noShow: 1 });
  });
});

describe('admin.supabase.ts — financialDashboard (Story 8.7)', () => {
  it('agrega GMV/receita/ranking de pedidos entregues + contagens/taxa de sucesso do período, nada hardcoded', async () => {
    const { client } = fakeTableClient({
      tables: {
        pedidos: [
          {
            data: [
              { estabelecimento_id: 'estab-1', total_pago_reais: 107.9, subtotal_produtos_reais: 100,
                taxa_deslocamento_reais: 5, taxa_keepit_reais: 10, taxa_servico_comprador_reais: 2.9,
                entregue_em: '2026-08-05T00:00:00.000Z' },
            ],
            error: null,
          },
          {
            data: [{ status: 'entregue' }, { status: 'cancelado' }, { status: 'nao_retirado' }],
            error: null,
          },
          { data: [{ total_pago_reais: 107.9 }], error: null },
        ],
        estabelecimentos: [{ data: [{ id: 'estab-1', nome_fantasia: 'Padoca' }], error: null }],
        lancamentos_financeiros: [{ data: [
          { tipo: 'charge', valor_centavos: 10790, status: 'concluido', criado_em: '2026-08-05', concluido_em: null },
          { tipo: 'merchant_credit', valor_centavos: 9500, status: 'concluido', criado_em: '2026-08-05', concluido_em: null },
          { tipo: 'payout', valor_centavos: -3000, status: 'concluido', criado_em: '2026-08-06', concluido_em: '2026-08-06' },
        ], error: null }],
      },
    });

    const port = createAdminSupabase(client);
    const dashboard = await port.financialDashboard(30);

    expect(dashboard.gmvReais).toBe(107.9);
    expect(dashboard.recebidoClientesReais).toBe(107.9);
    expect(dashboard.receitaKeepitReais).toBe(12.9);
    expect(dashboard.dividaLojistasReais).toBe(65);
    expect(dashboard.ranking).toEqual([{ estabelecimento_id: 'estab-1', nome_fantasia: 'Padoca', gmvReais: 107.9, pedidosEntregues: 1 }]);
    expect(dashboard.pedidosTotais).toBe(3);
    expect(dashboard.pedidosEntregues).toBe(1);
    expect(dashboard.pedidosCancelados).toBe(1);
    expect(dashboard.pedidosNoShow).toBe(1);
    expect(dashboard.taxaSucessoPercent).toBeCloseTo(33.3, 1);
  });

  it('período sem pedidos resolve zeros honestos, nunca NaN/Infinity', async () => {
    const { client } = fakeTableClient({
      tables: {
        pedidos: [
          { data: [], error: null },
          { data: [], error: null },
        ],
      },
    });

    const port = createAdminSupabase(client);
    const dashboard = await port.financialDashboard(7);

    expect(dashboard.gmvReais).toBe(0);
    expect(dashboard.ranking).toEqual([]);
    expect(dashboard.taxaSucessoPercent).toBe(0);
    expect(Number.isFinite(dashboard.taxaSucessoPercent)).toBe(true);
  });

  it('expõe tentativas em reconciliação e antecipações com custos para o Admin', async () => {
    const { client } = fakeTableClient({
      tables: {
        pedidos: [{ data: [], error: null }, { data: [], error: null }],
        tentativas_pagamento: [{ data: [{
          id: 'tentativa-1', pedido_id: 'pedido-1', operacao_id: 'operacao-1', forma: 'cartao', estado: 'reconciliacao',
          asaas_payment_id: null, criado_em: '2026-09-30T10:00:00.000Z',
        }], error: null }],
        eventos_pagamento: [{ data: [{
          evento_externo_id: 'evt-1', tipo: 'PAYMENT_RECEIVED', cobranca_id: 'pay-1', pedido_id: 'pedido-1',
          tentativa_id: 'tentativa-1', resultado: 'vinculo_nao_encontrado',
          erro_codigo: 'COBRANCA_DESCONHECIDA', recebido_em: '2026-09-30T10:05:00.000Z',
        }, {
          evento_externo_id: 'evt-sem-vinculo', tipo: 'PAYMENT_FUTURE_EVENT', cobranca_id: 'pay-desconhecido',
          pedido_id: null, tentativa_id: null, resultado: 'vinculo_nao_encontrado',
          erro_codigo: 'COBRANCA_DESCONHECIDA', recebido_em: '2026-09-30T10:06:00.000Z',
        }], error: null }, { data: [{
          evento_externo_id: 'evt-sem-vinculo', tipo: 'PAYMENT_FUTURE_EVENT', cobranca_id: 'pay-desconhecido',
          pedido_id: null, tentativa_id: null, resultado: 'vinculo_nao_encontrado',
          erro_codigo: 'COBRANCA_DESCONHECIDA', recebido_em: '2026-09-30T10:06:00.000Z',
        }, {
          evento_externo_id: 'evt-1', tipo: 'PAYMENT_RECEIVED', cobranca_id: 'pay-1', pedido_id: 'pedido-1',
          tentativa_id: 'tentativa-1', resultado: 'vinculo_nao_encontrado',
          erro_codigo: 'COBRANCA_DESCONHECIDA', recebido_em: '2026-09-30T10:05:00.000Z',
        }], error: null }],
        ocorrencias_pagamento: [{ data: [{
          id: 'oc-1', pedido_id: 'pedido-2', tipo: 'chargeback', estado: 'pendente',
          referencia_externa: 'pay-2', detalhe: 'Responsabilidade aguarda decisão administrativa.',
          criado_em: '2026-09-30T10:07:00.000Z',
        }, {
          id: 'oc-2', pedido_id: 'pedido-2', tipo: 'pagamento_adicional', estado: 'pendente',
          referencia_externa: 'pay-3', detalhe: 'Segunda cobrança requer devolução administrativa.',
          criado_em: '2026-09-30T10:08:00.000Z',
        }], error: null }],
        antecipacoes_recebiveis: [{ data: [{
          id: 'ant-local-1', antecipacao_externa_id: 'ant-asaas-1', pedido_id: 'pedido-2',
          cobranca_id: 'pay-2', estado: 'PENDING', valor_centavos: 10_000,
          tarifa_centavos: 250, liquido_centavos: 9_750, data_credito: null,
          atualizado_em: '2026-09-30T11:00:00.000Z',
        }], error: null }],
      },
    });

    const dashboard = await createAdminSupabase(client).financialDashboard(30);

    expect((dashboard as unknown as { reconciliacoes: unknown }).reconciliacoes).toEqual([{
      tentativaId: 'tentativa-1', operacaoId: 'operacao-1', pedidoId: 'pedido-1', forma: 'cartao', estado: 'reconciliacao',
      asaasPaymentId: null, criadoEm: '2026-09-30T10:00:00.000Z',
      ultimoResultado: 'vinculo_nao_encontrado', ultimoErro: 'COBRANCA_DESCONHECIDA',
    }]);
    expect((dashboard as unknown as { antecipacoes: unknown }).antecipacoes).toEqual([{
      id: 'ant-local-1', antecipacaoExternaId: 'ant-asaas-1', pedidoId: 'pedido-2', cobrancaId: 'pay-2',
      estado: 'PENDING', valorCentavos: 10_000, tarifaCentavos: 250, liquidoCentavos: 9_750,
      dataCredito: null, atualizadoEm: '2026-09-30T11:00:00.000Z',
    }]);
    expect((dashboard as unknown as { eventosComErro: unknown }).eventosComErro).toEqual([
      expect.objectContaining({ eventoExternoId: 'evt-sem-vinculo', erro: 'COBRANCA_DESCONHECIDA' }),
      expect.objectContaining({ eventoExternoId: 'evt-1', tentativaId: 'tentativa-1' }),
    ]);
    expect((dashboard as unknown as { ocorrenciasPagamento: unknown }).ocorrenciasPagamento).toEqual([
      expect.objectContaining({ id: 'oc-1', tipo: 'chargeback', estado: 'pendente' }),
      expect.objectContaining({ id: 'oc-2', tipo: 'pagamento_adicional', estado: 'pendente' }),
    ]);
  });

  it('reúne todas as classes de pendência financeira com vínculo e ação segura', async () => {
    const { client } = fakeTableClient({
      tables: {
        pedidos: [{ data: [], error: null }, { data: [], error: null }],
        tentativas_pagamento: [{ data: [{
          id: 'tentativa-sem-id', pedido_id: 'pedido-1', operacao_id: 'operacao-sem-id', forma: 'pix', estado: 'reconciliacao',
          asaas_payment_id: null, criado_em: '2026-09-28T10:00:00.000Z',
        }, {
          id: 'tentativa-com-id', pedido_id: 'pedido-2', operacao_id: 'operacao-com-id', forma: 'cartao', estado: 'reconciliacao',
          asaas_payment_id: 'pay-2', criado_em: '2026-09-29T10:00:00.000Z',
        }], error: null }],
        eventos_pagamento: [{ data: [{
          evento_externo_id: 'evt-tentativa-ok', tipo: 'PAYMENT_UPDATED', cobranca_id: 'pay-2',
          tentativa_id: 'tentativa-com-id', pedido_id: 'pedido-2', resultado: 'ignorado',
          erro_codigo: null, recebido_em: '2026-09-30T11:00:00.000Z',
        }, {
          evento_externo_id: 'evt-divergente', tipo: 'PAYMENT_RECEIVED', cobranca_id: 'pay-3',
          tentativa_id: null, pedido_id: 'pedido-3', resultado: 'vinculo_nao_encontrado',
          erro_codigo: 'COBRANCA_DESCONHECIDA', recebido_em: '2026-09-30T09:00:00.000Z',
        }, {
          evento_externo_id: 'evt-tentativa', tipo: 'PAYMENT_UPDATED', cobranca_id: 'pay-2',
          tentativa_id: 'tentativa-com-id', pedido_id: 'pedido-2', resultado: 'conciliacao_necessaria',
          erro_codigo: 'STATUS_INESPERADO', recebido_em: '2026-09-30T10:00:00.000Z',
        }], error: null }],
        lancamentos_financeiros: [{ data: [{
          id: 'refund-pendente', estabelecimento_id: 'estab-1', pedido_id: 'pedido-4', tipo: 'refund',
          valor_centavos: -500, status: 'pendente', criado_em: '2026-09-29T11:00:00.000Z',
          concluido_em: null, detalhe: null, asaas_id_externo: null, estado_reserva: 'ativa',
        }, {
          id: 'refund-erro', estabelecimento_id: 'estab-1', pedido_id: 'pedido-5', tipo: 'refund',
          valor_centavos: -700, status: 'erro', criado_em: '2026-09-29T12:00:00.000Z',
          concluido_em: null, detalhe: 'Resposta perdida após envio', asaas_id_externo: 'refund-ext-5', estado_reserva: 'ativa',
        }, {
          id: 'refund-sem-pedido', estabelecimento_id: 'estab-1', pedido_id: null, tipo: 'refund',
          valor_centavos: -900, status: 'pendente', criado_em: '2026-09-29T13:00:00.000Z',
          concluido_em: null, detalhe: null, asaas_id_externo: 'refund-ext-sem-pedido', estado_reserva: 'ativa',
        }], error: null }],
        repasses: [{ data: [{
          id: 'repasse-1', estado: 'em_analise', preparado_em: '2026-09-27T10:00:00.000Z', referencia: null,
        }], error: null }],
        repasse_eventos: [{ data: [{
          repasse_id: 'repasse-1', operacao_id: 'operacao-repasse-1', tipo: 'analise',
          motivo: 'Resposta bancária perdida', referencia: null, criado_em: '2026-09-30T08:00:00.000Z',
        }, {
          repasse_id: 'repasse-1', operacao_id: 'operacao-repasse-inicial', tipo: 'analise',
          motivo: 'Análise aberta', referencia: null, criado_em: '2026-09-28T08:00:00.000Z',
        }], error: null }],
      },
    });

    const dashboard = await createAdminSupabase(client).financialDashboard(30);

    expect(dashboard.pendenciasFinanceiras).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'tentativa:tentativa-sem-id', tipo: 'reconciliacao_pagamento', pedidoId: 'pedido-1',
        operacaoId: 'operacao-sem-id', referenciaExterna: null, ultimoResultado: null,
        acaoPermitida: 'reconciliar_pagamento',
      }),
      expect.objectContaining({
        id: 'tentativa:tentativa-com-id', tipo: 'reconciliacao_pagamento', pedidoId: 'pedido-2',
        operacaoId: 'operacao-com-id', referenciaExterna: 'pay-2', ultimoResultado: 'ignorado',
        ultimoErro: 'STATUS_INESPERADO',
      }),
      expect.objectContaining({
        id: 'evento:evt-divergente', tipo: 'evento_divergente', pedidoId: 'pedido-3',
        operacaoId: 'evt-divergente', referenciaExterna: 'pay-3', ultimoResultado: 'vinculo_nao_encontrado',
        ultimoErro: 'COBRANCA_DESCONHECIDA',
        acaoPermitida: 'consultar_divergencia',
      }),
      expect.objectContaining({
        id: 'reembolso:refund-pendente', tipo: 'reembolso', pedidoId: 'pedido-4',
        operacaoId: 'refund-pendente', ultimoResultado: 'pendente', ultimoErro: null,
        acaoPermitida: 'tratar_reembolso',
      }),
      expect.objectContaining({
        id: 'reembolso:refund-erro', tipo: 'reembolso', pedidoId: 'pedido-5',
        operacaoId: 'refund-erro', referenciaExterna: 'refund-ext-5', ultimoResultado: 'erro',
        ultimoErro: 'Resposta perdida após envio',
      }),
      expect.objectContaining({
        id: 'reembolso:refund-sem-pedido', tipo: 'reembolso', pedidoId: null,
        operacaoId: 'refund-sem-pedido', ultimoResultado: 'pendente', referenciaExterna: 'refund-ext-sem-pedido',
        acaoPermitida: 'tratar_reembolso',
      }),
      expect.objectContaining({
        id: 'repasse:repasse-1', tipo: 'repasse_em_analise', pedidoId: null,
        operacaoId: 'operacao-repasse-1', abertoEm: '2026-09-28T08:00:00.000Z',
        ultimoResultado: 'Resposta bancária perdida', ultimoErro: 'Resposta bancária perdida',
        acaoPermitida: 'revisar_repasse',
      }),
    ]));
  });

  it('mantém na fila somente a divergência mais recente ainda aberta e vinculada a pedido', async () => {
    const { client } = fakeTableClient({
      tables: {
        pedidos: [{ data: [], error: null }, { data: [], error: null }],
        eventos_pagamento: [{ data: [{
          evento_externo_id: 'evt-resolvido', tipo: 'PAYMENT_UPDATED', cobranca_id: 'pay-resolvido',
          tentativa_id: null, pedido_id: 'pedido-resolvido', resultado: 'recebido', erro_codigo: null,
          recebido_em: '2026-09-30T11:00:00.000Z',
        }, {
          evento_externo_id: 'evt-erro-antigo', tipo: 'PAYMENT_RECEIVED', cobranca_id: 'pay-resolvido',
          tentativa_id: 'tentativa-resolvida', pedido_id: 'pedido-resolvido', resultado: 'vinculo_nao_encontrado',
          erro_codigo: 'COBRANCA_DESCONHECIDA', recebido_em: '2026-09-30T10:00:00.000Z',
        }, {
          evento_externo_id: 'evt-aberto', tipo: 'PAYMENT_RECEIVED', cobranca_id: 'pay-aberto',
          tentativa_id: null, pedido_id: 'pedido-aberto', resultado: 'conciliacao_necessaria',
          erro_codigo: 'STATUS_INESPERADO', recebido_em: '2026-09-30T09:00:00.000Z',
        }, {
          evento_externo_id: 'evt-sem-pedido', tipo: 'PAYMENT_RECEIVED', cobranca_id: 'pay-sem-pedido',
          tentativa_id: null, pedido_id: null, resultado: 'vinculo_nao_encontrado',
          erro_codigo: 'COBRANCA_DESCONHECIDA', recebido_em: '2026-09-30T08:00:00.000Z',
        }], error: null }],
      },
    });

    const dashboard = await createAdminSupabase(client).financialDashboard(30);

    expect(dashboard.pendenciasFinanceiras.filter((item) => item.tipo === 'evento_divergente')).toEqual([{
      id: 'evento:evt-aberto', tipo: 'evento_divergente', pedidoId: 'pedido-aberto',
      operacaoId: 'evt-aberto', abertoEm: '2026-09-30T09:00:00.000Z',
      ultimoResultado: 'conciliacao_necessaria', ultimoErro: 'STATUS_INESPERADO',
      referenciaExterna: 'pay-aberto', acaoPermitida: 'consultar_divergencia',
    }]);
  });

  it('pagina a fila até o fim para nenhuma pendência desaparecer no limite do servidor', async () => {
    const primeiraPagina = Array.from({ length: 1_000 }, (_, index) => ({
      id: `tentativa-${index}`, pedido_id: `pedido-${index}`, operacao_id: `operacao-${index}`, forma: 'pix', estado: 'reconciliacao',
      asaas_payment_id: null, criado_em: '2026-09-30T10:00:00.000Z',
    }));
    const ultimaPagina = [{
      id: 'tentativa-1000', pedido_id: 'pedido-1000', operacao_id: 'operacao-1000', forma: 'cartao', estado: 'reconciliacao',
      asaas_payment_id: 'pay-1000', criado_em: '2026-09-30T09:00:00.000Z',
    }];
    const { client } = fakeTableClient({
      tables: {
        pedidos: [{ data: [], error: null }, { data: [], error: null }],
        tentativas_pagamento: [
          { data: primeiraPagina, error: null },
          { data: ultimaPagina, error: null },
        ],
      },
    });

    const dashboard = await createAdminSupabase(client).financialDashboard(30);

    expect(dashboard.pendenciasFinanceiras.filter((item) => item.tipo === 'reconciliacao_pagamento')).toHaveLength(1_001);
    expect(dashboard.pendenciasFinanceiras).toContainEqual(expect.objectContaining({
      id: 'tentativa:tentativa-1000', referenciaExterna: 'pay-1000',
    }));
  });

  it('pagina divergências, reembolsos e repasses em análise sem ocultar a última página', async () => {
    const eventos = Array.from({ length: 1_001 }, (_, index) => ({
      evento_externo_id: `evt-${index}`, tipo: 'PAYMENT_UPDATED', cobranca_id: `pay-${index}`,
      tentativa_id: null, pedido_id: `pedido-evento-${index}`, resultado: 'conciliacao_necessaria',
      erro_codigo: 'VINCULO_DIVERGENTE', recebido_em: '2026-09-30T10:00:00.000Z',
    }));
    const reembolsos = Array.from({ length: 1_001 }, (_, index) => ({
      id: `refund-${index}`, estabelecimento_id: 'estab-1', pedido_id: `pedido-refund-${index}`,
      tipo: 'refund', valor_centavos: -100, status: 'pendente', criado_em: '2026-09-30T10:00:00.000Z',
      concluido_em: null, detalhe: null, asaas_id_externo: null, estado_reserva: 'ativa',
    }));
    const repasses = Array.from({ length: 1_001 }, (_, index) => ({
      id: `repasse-${index}`, estado: 'em_analise', preparado_em: '2026-09-30T10:00:00.000Z',
    }));
    const { client } = fakeTableClient({
      tables: {
        pedidos: [{ data: [], error: null }, { data: [], error: null }],
        eventos_pagamento: [
          { data: eventos.slice(0, 1_000), error: null },
          { data: eventos.slice(1_000), error: null },
        ],
        lancamentos_financeiros: [
          { data: reembolsos.slice(0, 1_000), error: null },
          { data: reembolsos.slice(1_000), error: null },
        ],
        repasses: [
          { data: repasses.slice(0, 1_000), error: null },
          { data: repasses.slice(1_000), error: null },
        ],
      },
    });

    const dashboard = await createAdminSupabase(client).financialDashboard(30);

    expect(dashboard.pendenciasFinanceiras).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'evento:evt-1000' }),
      expect.objectContaining({ id: 'reembolso:refund-1000' }),
      expect.objectContaining({ id: 'repasse:repasse-1000' }),
    ]));
  });

  it('pagina todo o histórico necessário para fechar divergências e busca eventos das tentativas exibidas', async () => {
    const { client, from } = fakeTableClient({
      tables: {
        pedidos: [{ data: [], error: null }, { data: [], error: null }],
        tentativas_pagamento: [{ data: [{
          id: 'tentativa-1', pedido_id: 'pedido-1', operacao_id: 'operacao-1', forma: 'cartao', estado: 'reconciliacao',
          asaas_payment_id: null, criado_em: '2026-09-30T10:00:00.000Z',
        }], error: null }],
        eventos_pagamento: [{ data: [], error: null }, { data: [], error: null }],
      },
    });

    await createAdminSupabase(client).financialDashboard(30);

    const eventCallIndexes = from.mock.calls
      .map((args, index) => ({ table: args[0], index }))
      .filter(({ table }) => table === 'eventos_pagamento')
      .map(({ index }) => index);
    expect(eventCallIndexes).toHaveLength(2);
    const latestBuilder = from.mock.results[eventCallIndexes[0]!]?.value as {
      in: ReturnType<typeof vi.fn>; range: ReturnType<typeof vi.fn>;
    };
    const historyBuilder = from.mock.results[eventCallIndexes[1]!]?.value as {
      order: ReturnType<typeof vi.fn>; range: ReturnType<typeof vi.fn>;
    };
    expect(latestBuilder.in).toHaveBeenCalledWith('tentativa_id', ['tentativa-1']);
    expect(latestBuilder.range).toHaveBeenCalledWith(0, 999);
    expect(historyBuilder.order).toHaveBeenCalledWith('recebido_em', { ascending: false });
    expect(historyBuilder.range).toHaveBeenCalledWith(0, 999);
  });

  it('reconcilia manualmente uma tentativa pela Edge Function sem criar cobrança', async () => {
    const invoke = vi.fn(async () => ({
      data: { ok: true, resultado: 'recebido', pedido_id: 'pedido-1' }, error: null,
    }));
    const { client } = fakeTableClient({ invoke });

    const result = await (createAdminSupabase(client) as unknown as {
      reconcilePayment(id: string): Promise<unknown>;
    }).reconcilePayment('tentativa-1');

    expect(invoke).toHaveBeenCalledWith('reconcile-payment', { body: { tentativaId: 'tentativa-1' } });
    expect(result).toEqual({ resultado: 'recebido', pedidoId: 'pedido-1' });
  });
});

describe('admin.supabase.ts — listAllOrders/forceCancelOrder (Story 8.3, 8.4)', () => {
  const PEDIDO_ROW_BASE = {
    id: 'pedido-1',
    numero: 1,
    cliente_id: 'cliente-1',
    estabelecimento_id: 'estab-1',
    hub_id: 'hub-1',
    status: 'aceito',
    pin_texto: '1234',
    tentativas_pin: 0,
    pin_bloqueado_ate: null,
    tempo_estimado_min: 20,
    criado_em: '2026-08-01T00:00:00.000Z',
    aceito_em: '2026-08-01T00:05:00.000Z',
    saiu_hub_em: null,
    entregue_em: null,
    cancelado_em: null,
    subtotal_produtos_reais: 50,
    taxa_deslocamento_reais: 5,
    taxa_keepit_reais: 5,
    taxa_servico_comprador_reais: 2.9,
    total_pago_reais: 62.9,
    motivo_recusa: null,
    motivo_cancelamento: null,
    motivo_nao_retirado: null,
    forma_pagamento: 'pix',
  };

  it('listAllOrders sem filtro lista todos (RLS admin já cobre), ordenado por criado_em desc', async () => {
    const { client, from } = fakeTableClient({
      tables: {
        pedidos: [{ data: [PEDIDO_ROW_BASE], error: null }],
        pedidos_itens: [{ data: [], error: null }],
      },
    });

    const port = createAdminSupabase(client);
    const pedidos = await port.listAllOrders();

    expect(from).toHaveBeenCalledWith('pedidos');
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].id).toBe('pedido-1');
  });

  it('listAllOrders com filtro de status aplica .eq() no client (AC2)', async () => {
    const { client } = fakeTableClient({
      tables: {
        pedidos: [{ data: [{ ...PEDIDO_ROW_BASE, status: 'aguardando_aceite' }], error: null }],
        pedidos_itens: [{ data: [], error: null }],
      },
    });

    const port = createAdminSupabase(client);
    const pedidos = await port.listAllOrders({ status: 'aguardando_aceite' });
    expect(pedidos.every((p) => p.status === 'aguardando_aceite')).toBe(true);
  });

  it('forceCancelOrder chama forcar_cancelamento_pedido com os args corretos e relê o pedido (Story 8.4 AC1-AC4)', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ pedido_id: 'pedido-1', status: 'cancelado_admin', refund_id: 'refund-1', refund_centavos: -6290 }],
      error: null,
    }));
    const { client } = fakeTableClient({
      rpc,
      tables: {
        pedidos: [{ data: { ...PEDIDO_ROW_BASE, status: 'cancelado_admin', motivo_cancelamento: 'Suspeita de fraude', cancelado_em: '2026-08-02T00:00:00.000Z' }, error: null }],
        pedidos_itens: [{ data: [], error: null }],
      },
    });

    const port = createAdminSupabase(client);
    const pedido = await port.forceCancelOrder('pedido-1', 'Suspeita de fraude');

    expect(rpc).toHaveBeenCalledWith('forcar_cancelamento_pedido', { p_pedido_id: 'pedido-1', p_motivo: 'Suspeita de fraude' });
    expect(pedido.status).toBe('cancelado_admin');
    expect(pedido.motivo_cancelamento).toBe('Suspeita de fraude');
  });

  it.each([
    ['AUTENTICACAO_NECESSARIA', /AUTENTICACAO_NECESSARIA/],
    ['NAO_AUTORIZADO', /NAO_AUTORIZADO/],
    ['MOTIVO_OBRIGATORIO', /MOTIVO_OBRIGATORIO/],
    ['PEDIDO_NAO_ENCONTRADO', /PEDIDO_NAO_ENCONTRADO/],
    ['ESTADO_INVALIDO', /ESTADO_INVALIDO/],
  ])('forceCancelOrder — %s rejeita com o erro nomeado correspondente (nunca cancelado_admin sem refund, nem refund órfão)', async (code, matcher) => {
    const { client } = fakeTableClient({ rpc: async () => ({ data: null, error: { message: code } }) });
    const port = createAdminSupabase(client);
    await expect(port.forceCancelOrder('pedido-1', 'motivo')).rejects.toThrow(matcher);
  });
});
