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
}): { client: SupabaseClient<Database>; from: (table: string) => unknown; rpc: (fn: string, args: unknown) => Promise<RpcResult> } {
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
  const rpc = vi.fn(options.rpc ?? (async () => ({ data: null, error: null })));
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
    const { client } = fakeClient({
      estabelecimentos: [{ data: [ROW_EM_ANALISE], error: null }],
      estabelecimentosHorarios: [{ data: [HORARIO_SEGUNDA], error: null }],
    });

    const port = createAdminSupabase(client);
    const pendentes = await port.pendingStores();

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

  it('filtra por status = em_analise via .eq() — não reimplementa a checagem no client', async () => {
    const eqSpy = vi.fn(() => ({ then: (resolve: (v: QueryResult) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) }));
    const selectSpy = vi.fn(() => ({ eq: eqSpy }));
    const fromSpy = vi.fn(() => ({ select: selectSpy }));
    const spyClient = { from: fromSpy, storage: { from: vi.fn() } } as unknown as SupabaseClient<Database>;

    await createAdminSupabase(spyClient).pendingStores();

    expect(fromSpy).toHaveBeenCalledWith('estabelecimentos');
    expect(eqSpy).toHaveBeenCalledWith('status', 'em_analise');
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
