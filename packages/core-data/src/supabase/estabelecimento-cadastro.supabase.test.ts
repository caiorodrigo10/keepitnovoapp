import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import type { CriarEstabelecimentoInput } from '../ports/estabelecimento-cadastro.port';
import {
  AutenticacaoNecessariaError,
  CadastroJaProcessadoError,
  CnpjDuplicadoError,
  HorariosInvalidosError,
} from './estabelecimento-cadastro-errors';
import { createEstabelecimentoCadastroSupabase } from './estabelecimento-cadastro.supabase';

const HORARIOS = Array.from({ length: 7 }, (_, dia_semana) => ({
  dia_semana,
  aberto: dia_semana !== 0,
  hora_abre: dia_semana !== 0 ? '09:00' : '',
  hora_fecha: dia_semana !== 0 ? '18:00' : '',
}));

const INPUT: CriarEstabelecimentoInput = {
  nome_fantasia: 'Farmácia Vida',
  cnpj: '11.222.333/0001-44',
  responsavel_nome: 'Fulano de Tal',
  telefone: '(11) 91234-5678',
  categoria: 'farmacia',
  endereco: 'Rua das Flores, 100',
  lat: null,
  lng: null,
  raio_atendimento_km: 3,
  tempo_medio_entrega_min: 30,
  taxa_deslocamento_reais: 0,
  ticket_minimo_reais: null,
  chave_pix: 'contato@farmaciavida.com.br',
  chave_pix_tipo: 'email',
  foto_fachada_url: null,
  descricao: null,
  horarios: HORARIOS,
};

function fakeClientForRpc(
  rpcImpl: (fn: string, args: unknown) => Promise<{ data: unknown; error: unknown }>,
): SupabaseClient<Database> {
  return { rpc: rpcImpl } as unknown as SupabaseClient<Database>;
}

describe('estabelecimento-cadastro.supabase.ts — criarCadastro (Story 3.5, AC3, AC4)', () => {
  it('chama a RPC criar_estabelecimento_completo com todos os p_* mapeados 1:1', async () => {
    let capturedFn: string | undefined;
    let capturedArgs: unknown;
    const client = fakeClientForRpc(async (fn, args) => {
      capturedFn = fn;
      capturedArgs = args;
      return { data: 'estab-uuid-1', error: null };
    });

    const port = createEstabelecimentoCadastroSupabase(client);
    const resultado = await port.criarCadastro(INPUT);

    expect(capturedFn).toBe('criar_estabelecimento_completo');
    expect(capturedArgs).toMatchObject({
      p_nome_fantasia: INPUT.nome_fantasia,
      p_cnpj: INPUT.cnpj,
      p_responsavel_nome: INPUT.responsavel_nome,
      p_telefone: INPUT.telefone,
      p_categoria: INPUT.categoria,
      p_endereco: INPUT.endereco,
      p_lat: null,
      p_lng: null,
      p_raio_atendimento_km: 3,
      p_tempo_medio_entrega_min: 30,
      p_taxa_deslocamento_reais: 0,
      p_ticket_minimo_reais: null,
      p_chave_pix: INPUT.chave_pix,
      p_chave_pix_tipo: 'email',
      p_foto_fachada_url: null,
      p_descricao: null,
    });
    expect((capturedArgs as { p_horarios: unknown }).p_horarios).toEqual(HORARIOS);
    expect(resultado).toEqual({ id: 'estab-uuid-1' });
  });

  it('mapeia AUTENTICACAO_NECESSARIA para AutenticacaoNecessariaError', async () => {
    const client = fakeClientForRpc(async () => ({
      data: null,
      error: { message: 'AUTENTICACAO_NECESSARIA', code: 'P0001' },
    }));
    const port = createEstabelecimentoCadastroSupabase(client);
    await expect(port.criarCadastro(INPUT)).rejects.toBeInstanceOf(AutenticacaoNecessariaError);
  });

  it('mapeia HORARIOS_INVALIDOS para HorariosInvalidosError', async () => {
    const client = fakeClientForRpc(async () => ({
      data: null,
      error: { message: 'HORARIOS_INVALIDOS', code: 'P0001' },
    }));
    const port = createEstabelecimentoCadastroSupabase(client);
    await expect(port.criarCadastro(INPUT)).rejects.toBeInstanceOf(HorariosInvalidosError);
  });

  it('mapeia CADASTRO_JA_PROCESSADO para CadastroJaProcessadoError', async () => {
    const client = fakeClientForRpc(async () => ({
      data: null,
      error: { message: 'CADASTRO_JA_PROCESSADO', code: 'P0001' },
    }));
    const port = createEstabelecimentoCadastroSupabase(client);
    await expect(port.criarCadastro(INPUT)).rejects.toBeInstanceOf(CadastroJaProcessadoError);
  });

  it('mapeia CNPJ_DUPLICADO para CnpjDuplicadoError', async () => {
    const client = fakeClientForRpc(async () => ({
      data: null,
      error: { message: 'CNPJ_DUPLICADO', code: 'P0001' },
    }));
    const port = createEstabelecimentoCadastroSupabase(client);
    await expect(port.criarCadastro(INPUT)).rejects.toBeInstanceOf(CnpjDuplicadoError);
  });

  it('propaga qualquer outro erro sem mascarar e sem sucesso simulado (AC4)', async () => {
    const client = fakeClientForRpc(async () => ({
      data: null,
      error: { message: 'connection refused', code: '08006' },
    }));
    const port = createEstabelecimentoCadastroSupabase(client);
    await expect(port.criarCadastro(INPUT)).rejects.not.toBeInstanceOf(AutenticacaoNecessariaError);
    await expect(port.criarCadastro(INPUT)).rejects.not.toBeInstanceOf(CnpjDuplicadoError);
    await expect(port.criarCadastro(INPUT)).rejects.toMatchObject({ message: 'connection refused' });
  });
});

describe('estabelecimento-cadastro.supabase.ts — uploadFachada (Story 3.5, AC2)', () => {
  function fakeClientForUpload(options: { userId?: string | null; uploadError?: unknown }) {
    const upload = vi.fn(async () => ({ data: { path: 'ok' }, error: options.uploadError ?? null }));
    const client = {
      auth: {
        getUser: async () =>
          options.userId
            ? { data: { user: { id: options.userId } }, error: null }
            : { data: { user: null }, error: null },
      },
      storage: {
        from: () => ({ upload }),
      },
    } as unknown as SupabaseClient<Database>;
    return { client, upload };
  }

  it('rejeita com AutenticacaoNecessariaError sem usuário autenticado', async () => {
    const { client } = fakeClientForUpload({ userId: null });
    const port = createEstabelecimentoCadastroSupabase(client);

    // fetch não deve nem ser chamado antes da checagem de sessão — não
    // precisamos mockar `global.fetch` neste caso.
    await expect(
      port.uploadFachada({ uri: 'file:///tmp/fachada.jpg', ext: 'jpg' }),
    ).rejects.toBeInstanceOf(AutenticacaoNecessariaError);
  });

  it('faz upload para o path `${uid}/fachada.<ext>` e retorna o path (não uma URL assinada)', async () => {
    const { client, upload } = fakeClientForUpload({ userId: 'user-lojista-1' });
    const fakeBlob = { size: 10, type: 'image/jpeg' };
    const fetchMock = vi.fn(async () => ({ blob: async () => fakeBlob }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const port = createEstabelecimentoCadastroSupabase(client);
      const path = await port.uploadFachada({ uri: 'file:///tmp/fachada.jpg', ext: 'jpg' });

      expect(fetchMock).toHaveBeenCalledWith('file:///tmp/fachada.jpg');
      expect(upload).toHaveBeenCalledWith(
        'user-lojista-1/fachada.jpg',
        fakeBlob,
        expect.objectContaining({ contentType: 'image/jpeg', upsert: true }),
      );
      expect(path).toBe('user-lojista-1/fachada.jpg');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('propaga erro de upload do Storage sem sucesso simulado', async () => {
    const { client } = fakeClientForUpload({ userId: 'user-lojista-2', uploadError: { message: 'bucket cheio' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => ({}) })),
    );

    try {
      const port = createEstabelecimentoCadastroSupabase(client);
      await expect(port.uploadFachada({ uri: 'file:///tmp/fachada.jpg', ext: 'jpg' })).rejects.toMatchObject({
        message: 'bucket cheio',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('estabelecimento-cadastro.supabase.ts — getMeuEstabelecimento (Story 3.10, AC2-AC6)', () => {
  function makeQueryBuilder(result: { data: unknown; error: unknown }) {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => result);
    return builder;
  }

  function fakeClientForOwn(options: {
    userId?: string | null;
    userError?: unknown;
    queryResult?: { data: unknown; error: unknown };
  }) {
    const builder = makeQueryBuilder(options.queryResult ?? { data: null, error: null });
    const from = vi.fn((_table: string) => builder);
    const client = {
      auth: {
        getUser: async () =>
          options.userError
            ? { data: { user: null }, error: options.userError }
            : options.userId
              ? { data: { user: { id: options.userId } }, error: null }
              : { data: { user: null }, error: null },
      },
      from,
    } as unknown as SupabaseClient<Database>;
    return { client, from, eq: builder.eq as unknown as ReturnType<typeof vi.fn> };
  }

  it('resolve null sem sessão (nunca consulta a tabela)', async () => {
    const { client, from } = fakeClientForOwn({ userId: null });
    const port = createEstabelecimentoCadastroSupabase(client);

    const resultado = await port.getMeuEstabelecimento();

    expect(resultado).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('propaga erro real de auth.getUser()', async () => {
    const { client } = fakeClientForOwn({ userError: { message: 'token expirado' } });
    const port = createEstabelecimentoCadastroSupabase(client);
    await expect(port.getMeuEstabelecimento()).rejects.toMatchObject({ message: 'token expirado' });
  });

  it('filtra por dono_user_id = auth.uid() (AC6 — nunca a loja ativa de outro dono)', async () => {
    const { client, eq } = fakeClientForOwn({
      userId: 'user-lojista-1',
      queryResult: { data: { status: 'em_analise', motivo_rejeicao: null }, error: null },
    });
    const port = createEstabelecimentoCadastroSupabase(client);

    await port.getMeuEstabelecimento();

    expect(eq).toHaveBeenCalledWith('dono_user_id', 'user-lojista-1');
  });

  it('resolve null quando não há nenhuma linha (AC4 — "0 linhas" nunca é erro)', async () => {
    const { client } = fakeClientForOwn({
      userId: 'user-lojista-2',
      queryResult: { data: null, error: null },
    });
    const port = createEstabelecimentoCadastroSupabase(client);

    await expect(port.getMeuEstabelecimento()).resolves.toBeNull();
  });

  it('resolve status + motivo_rejeicao íntegro quando há uma linha (AC2, AC3)', async () => {
    const { client } = fakeClientForOwn({
      userId: 'user-lojista-3',
      queryResult: { data: { status: 'rejeitado', motivo_rejeicao: 'CNPJ divergente' }, error: null },
    });
    const port = createEstabelecimentoCadastroSupabase(client);

    await expect(port.getMeuEstabelecimento()).resolves.toEqual({
      status: 'rejeitado',
      motivo_rejeicao: 'CNPJ divergente',
    });
  });

  it('propaga erro real da query (rede/RLS) — nunca confundido com "0 linhas" (AC6)', async () => {
    const { client } = fakeClientForOwn({
      userId: 'user-lojista-4',
      queryResult: { data: null, error: { message: 'connection refused' } },
    });
    const port = createEstabelecimentoCadastroSupabase(client);

    await expect(port.getMeuEstabelecimento()).rejects.toMatchObject({ message: 'connection refused' });
  });
});

describe('estabelecimento-cadastro.supabase.ts — getMeuPerfil (Story 3.11, AC1, AC4)', () => {
  const HORARIOS_ROWS = [
    { dia_semana: 1, aberto: true, hora_abre: '09:00', hora_fecha: '18:00' },
    { dia_semana: 0, aberto: false, hora_abre: null, hora_fecha: null },
  ];

  function fakeClientForPerfil(options: {
    userId?: string | null;
    userError?: unknown;
    perfilResult?: { data: unknown; error: unknown };
    horariosResult?: { data: unknown; error: unknown };
    signedUrlResult?: { data: unknown; error: unknown };
  }) {
    const perfilBuilder: Record<string, unknown> = {};
    perfilBuilder.select = vi.fn(() => perfilBuilder);
    perfilBuilder.eq = vi.fn(() => perfilBuilder);
    perfilBuilder.maybeSingle = vi.fn(
      async () => options.perfilResult ?? { data: null, error: null },
    );

    const horariosBuilder: Record<string, unknown> = {};
    horariosBuilder.select = vi.fn(() => horariosBuilder);
    horariosBuilder.eq = vi.fn(async () => options.horariosResult ?? { data: [], error: null });

    const from = vi.fn((table: string) => (table === 'estabelecimentos' ? perfilBuilder : horariosBuilder));

    const createSignedUrl = vi.fn(
      async () => options.signedUrlResult ?? { data: { signedUrl: 'https://signed.example/foto.jpg' }, error: null },
    );
    const storage = { from: vi.fn(() => ({ createSignedUrl })) };

    const client = {
      auth: {
        getUser: async () =>
          options.userError
            ? { data: { user: null }, error: options.userError }
            : options.userId
              ? { data: { user: { id: options.userId } }, error: null }
              : { data: { user: null }, error: null },
      },
      from,
      storage,
    } as unknown as SupabaseClient<Database>;

    return { client, from, createSignedUrl, perfilEq: perfilBuilder.eq as ReturnType<typeof vi.fn> };
  }

  it('resolve null sem sessão (nunca consulta a tabela)', async () => {
    const { client, from } = fakeClientForPerfil({ userId: null });
    const port = createEstabelecimentoCadastroSupabase(client);

    await expect(port.getMeuPerfil()).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('resolve null quando não há nenhuma linha (0 linhas, nunca erro)', async () => {
    const { client } = fakeClientForPerfil({
      userId: 'user-lojista-1',
      perfilResult: { data: null, error: null },
    });
    const port = createEstabelecimentoCadastroSupabase(client);

    await expect(port.getMeuPerfil()).resolves.toBeNull();
  });

  it('filtra por dono_user_id = auth.uid() (mesma defesa de getMeuEstabelecimento)', async () => {
    const { client, perfilEq } = fakeClientForPerfil({
      userId: 'user-lojista-2',
      perfilResult: {
        data: {
          id: 'estab-1',
          nome_fantasia: 'Farmácia Vida',
          categoria: 'farmacia',
          descricao: 'desc',
          foto_fachada_url: null,
        },
        error: null,
      },
    });
    const port = createEstabelecimentoCadastroSupabase(client);

    await port.getMeuPerfil();

    expect(perfilEq).toHaveBeenCalledWith('dono_user_id', 'user-lojista-2');
  });

  it('prefill correto (nome_fantasia, categoria, descricao, horarios ordenados) sem foto', async () => {
    const { client } = fakeClientForPerfil({
      userId: 'user-lojista-3',
      perfilResult: {
        data: {
          id: 'estab-1',
          nome_fantasia: 'Farmácia Vida',
          categoria: 'farmacia',
          descricao: 'Farmácia de bairro',
          foto_fachada_url: null,
        },
        error: null,
      },
      horariosResult: { data: HORARIOS_ROWS, error: null },
    });
    const port = createEstabelecimentoCadastroSupabase(client);

    const resultado = await port.getMeuPerfil();

    expect(resultado).toEqual({
      nome_fantasia: 'Farmácia Vida',
      categoria: 'farmacia',
      descricao: 'Farmácia de bairro',
      foto_fachada_url_assinada: null,
      horarios: [
        { dia_semana: 0, aberto: false, hora_abre: null, hora_fecha: null },
        { dia_semana: 1, aberto: true, hora_abre: '09:00', hora_fecha: '18:00' },
      ],
    });
  });

  it('horários vazio honesto ([]) quando não há nenhuma linha em estabelecimentos_horarios', async () => {
    const { client } = fakeClientForPerfil({
      userId: 'user-lojista-4',
      perfilResult: {
        data: {
          id: 'estab-1',
          nome_fantasia: 'Farmácia Vida',
          categoria: 'farmacia',
          descricao: null,
          foto_fachada_url: null,
        },
        error: null,
      },
      horariosResult: { data: [], error: null },
    });
    const port = createEstabelecimentoCadastroSupabase(client);

    const resultado = await port.getMeuPerfil();

    expect(resultado?.horarios).toEqual([]);
  });

  it('NUNCA assina uma URL quando foto_fachada_url é NULL (AC4)', async () => {
    const { client, createSignedUrl } = fakeClientForPerfil({
      userId: 'user-lojista-5',
      perfilResult: {
        data: {
          id: 'estab-1',
          nome_fantasia: 'Farmácia Vida',
          categoria: 'farmacia',
          descricao: null,
          foto_fachada_url: null,
        },
        error: null,
      },
    });
    const port = createEstabelecimentoCadastroSupabase(client);

    const resultado = await port.getMeuPerfil();

    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(resultado?.foto_fachada_url_assinada).toBeNull();
  });

  it('assina a URL quando foto_fachada_url existe', async () => {
    const { client, createSignedUrl } = fakeClientForPerfil({
      userId: 'user-lojista-6',
      perfilResult: {
        data: {
          id: 'estab-1',
          nome_fantasia: 'Farmácia Vida',
          categoria: 'farmacia',
          descricao: null,
          foto_fachada_url: 'user-lojista-6/fachada.jpg',
        },
        error: null,
      },
      signedUrlResult: { data: { signedUrl: 'https://signed.example/foto.jpg' }, error: null },
    });
    const port = createEstabelecimentoCadastroSupabase(client);

    const resultado = await port.getMeuPerfil();

    expect(createSignedUrl).toHaveBeenCalledWith('user-lojista-6/fachada.jpg', 300);
    expect(resultado?.foto_fachada_url_assinada).toBe('https://signed.example/foto.jpg');
  });

  it('degrada para null (sem derrubar o perfil) quando createSignedUrl falha (AC4, REL-001)', async () => {
    const { client } = fakeClientForPerfil({
      userId: 'user-lojista-7',
      perfilResult: {
        data: {
          id: 'estab-1',
          nome_fantasia: 'Farmácia Vida',
          categoria: 'farmacia',
          descricao: 'desc',
          foto_fachada_url: 'user-lojista-7/fachada.jpg',
        },
        error: null,
      },
      signedUrlResult: { data: null, error: { message: 'RLS negou' } },
    });
    const port = createEstabelecimentoCadastroSupabase(client);

    const resultado = await port.getMeuPerfil();

    expect(resultado?.foto_fachada_url_assinada).toBeNull();
    expect(resultado?.nome_fantasia).toBe('Farmácia Vida');
    expect(resultado?.categoria).toBe('farmacia');
  });

  it('propaga erro real da query principal (rede/RLS)', async () => {
    const { client } = fakeClientForPerfil({
      userId: 'user-lojista-8',
      perfilResult: { data: null, error: { message: 'connection refused' } },
    });
    const port = createEstabelecimentoCadastroSupabase(client);

    await expect(port.getMeuPerfil()).rejects.toMatchObject({ message: 'connection refused' });
  });
});

describe('estabelecimento-cadastro.supabase.ts — atualizarMeuPerfil (Story 3.11, AC2, AC3)', () => {
  function fakeClientForUpdate(options: {
    userId?: string | null;
    updateError?: unknown;
    perfilResult?: { data: unknown; error: unknown };
    horariosResult?: { data: unknown; error: unknown };
  }) {
    const update = vi.fn((_payload: Record<string, unknown>) => ({
      eq: vi.fn(async () => ({ error: options.updateError ?? null })),
    }));

    const perfilBuilder: Record<string, unknown> = {};
    perfilBuilder.select = vi.fn(() => perfilBuilder);
    perfilBuilder.eq = vi.fn(() => perfilBuilder);
    perfilBuilder.maybeSingle = vi.fn(
      async () =>
        options.perfilResult ?? {
          data: {
            id: 'estab-1',
            nome_fantasia: 'Farmácia Vida',
            categoria: 'restaurante',
            descricao: 'Nova descrição',
            foto_fachada_url: null,
          },
          error: null,
        },
    );

    const horariosBuilder: Record<string, unknown> = {};
    horariosBuilder.select = vi.fn(() => horariosBuilder);
    horariosBuilder.eq = vi.fn(async () => options.horariosResult ?? { data: [], error: null });

    const from = vi.fn((table: string) => {
      if (table === 'estabelecimentos') {
        return { update, ...perfilBuilder };
      }
      return horariosBuilder;
    });

    const client = {
      auth: {
        getUser: async () =>
          options.userId
            ? { data: { user: { id: options.userId } }, error: null }
            : { data: { user: null }, error: null },
      },
      from,
    } as unknown as SupabaseClient<Database>;

    return { client, update };
  }

  it('rejeita com AutenticacaoNecessariaError sem sessão', async () => {
    const { client } = fakeClientForUpdate({ userId: null });
    const port = createEstabelecimentoCadastroSupabase(client);

    await expect(
      port.atualizarMeuPerfil({ categoria: 'restaurante', descricao: 'nova' }),
    ).rejects.toBeInstanceOf(AutenticacaoNecessariaError);
  });

  it('envia só categoria/descricao no payload de UPDATE — nunca nome_fantasia/cnpj/status (AC2)', async () => {
    const { client, update } = fakeClientForUpdate({ userId: 'user-lojista-1' });
    const port = createEstabelecimentoCadastroSupabase(client);

    await port.atualizarMeuPerfil({ categoria: 'restaurante', descricao: 'Nova descrição' });

    expect(update).toHaveBeenCalledWith({ categoria: 'restaurante', descricao: 'Nova descrição' });
    const payload = update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('nome_fantasia');
    expect(payload).not.toHaveProperty('cnpj');
    expect(payload).not.toHaveProperty('status');
  });

  it('relê e devolve o perfil real após o UPDATE (nunca ecoa o input como sucesso simulado)', async () => {
    const { client } = fakeClientForUpdate({ userId: 'user-lojista-2' });
    const port = createEstabelecimentoCadastroSupabase(client);

    const resultado = await port.atualizarMeuPerfil({ categoria: 'restaurante', descricao: 'Nova descrição' });

    expect(resultado).toMatchObject({
      nome_fantasia: 'Farmácia Vida',
      categoria: 'restaurante',
      descricao: 'Nova descrição',
    });
  });

  it('propaga erro do UPDATE sem sucesso simulado — não relê a linha', async () => {
    const { client } = fakeClientForUpdate({
      userId: 'user-lojista-3',
      updateError: { message: 'RLS negou' },
    });
    const port = createEstabelecimentoCadastroSupabase(client);

    await expect(
      port.atualizarMeuPerfil({ categoria: 'restaurante', descricao: 'nova' }),
    ).rejects.toMatchObject({ message: 'RLS negou' });
  });
});

describe('estabelecimento-cadastro.supabase.ts — getMeuEstabelecimentoId (Stories 4.3/4.4)', () => {
  function makeQueryBuilder(result: { data: unknown; error: unknown }) {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => result);
    return builder;
  }

  function fakeClientForOwnId(options: {
    userId?: string | null;
    userError?: unknown;
    queryResult?: { data: unknown; error: unknown };
  }) {
    const builder = makeQueryBuilder(options.queryResult ?? { data: null, error: null });
    const from = vi.fn((_table: string) => builder);
    const client = {
      auth: {
        getUser: async () =>
          options.userError
            ? { data: { user: null }, error: options.userError }
            : options.userId
              ? { data: { user: { id: options.userId } }, error: null }
              : { data: { user: null }, error: null },
      },
      from,
    } as unknown as SupabaseClient<Database>;
    return { client, from, eq: builder.eq as unknown as ReturnType<typeof vi.fn>, select: builder.select as ReturnType<typeof vi.fn> };
  }

  it('resolve null sem sessão (nunca consulta a tabela)', async () => {
    const { client, from } = fakeClientForOwnId({ userId: null });
    const port = createEstabelecimentoCadastroSupabase(client);

    await expect(port.getMeuEstabelecimentoId()).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('propaga erro real de auth.getUser()', async () => {
    const { client } = fakeClientForOwnId({ userError: { message: 'token expirado' } });
    const port = createEstabelecimentoCadastroSupabase(client);
    await expect(port.getMeuEstabelecimentoId()).rejects.toMatchObject({ message: 'token expirado' });
  });

  it('filtra por dono_user_id = auth.uid() e seleciona só id', async () => {
    const { client, eq, select } = fakeClientForOwnId({
      userId: 'user-lojista-1',
      queryResult: { data: { id: 'estab-1' }, error: null },
    });
    const port = createEstabelecimentoCadastroSupabase(client);

    await port.getMeuEstabelecimentoId();

    expect(select).toHaveBeenCalledWith('id');
    expect(eq).toHaveBeenCalledWith('dono_user_id', 'user-lojista-1');
  });

  it('resolve null quando não há nenhuma linha (0 linhas nunca é erro)', async () => {
    const { client } = fakeClientForOwnId({
      userId: 'user-lojista-2',
      queryResult: { data: null, error: null },
    });
    const port = createEstabelecimentoCadastroSupabase(client);

    await expect(port.getMeuEstabelecimentoId()).resolves.toBeNull();
  });

  it('resolve o id real quando há uma linha', async () => {
    const { client } = fakeClientForOwnId({
      userId: 'user-lojista-3',
      queryResult: { data: { id: 'estab-real-1' }, error: null },
    });
    const port = createEstabelecimentoCadastroSupabase(client);

    await expect(port.getMeuEstabelecimentoId()).resolves.toBe('estab-real-1');
  });

  it('propaga erro real da query (rede/RLS) sem sucesso fictício', async () => {
    const { client } = fakeClientForOwnId({
      userId: 'user-lojista-4',
      queryResult: { data: null, error: { message: 'connection refused' } },
    });
    const port = createEstabelecimentoCadastroSupabase(client);

    await expect(port.getMeuEstabelecimentoId()).rejects.toMatchObject({ message: 'connection refused' });
  });
});
