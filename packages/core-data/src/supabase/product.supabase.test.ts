import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import { createProductSupabase } from './product.supabase';

/**
 * Stories 4.3 (`list`) / 4.4 (`create`, `uploadFoto`) / 4.5 (`getById`,
 * `update`) / 4.6 (`pause`, `delete`). [IDS] CREATE — arquivo dedicado,
 * seguindo o mesmo padrão de query builder encadeável já estabelecido em
 * `admin-hubs.supabase.test.ts` (Story 4.1).
 */

type QueryResult = { data: unknown; error: unknown };

function makeQueryBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.is = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.insert = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.single = vi.fn(async () => result);
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function fakeClient(options: {
  produtos?: QueryResult;
  grupos?: QueryResult;
  itens?: QueryResult;
  userId?: string | null;
  userError?: unknown;
  upload?: (path: string, blob: unknown, opts: unknown) => Promise<{ data: unknown; error: unknown }>;
  getPublicUrl?: (path: string) => { data: { publicUrl: string } };
}): {
  client: SupabaseClient<Database>;
  from: (table: string) => unknown;
  builder: Record<string, unknown>;
  gruposBuilder: Record<string, unknown>;
  itensBuilder: Record<string, unknown>;
  upload: (path: string, blob: unknown, opts: unknown) => Promise<{ data: unknown; error: unknown }>;
} {
  const builder = makeQueryBuilder(options.produtos ?? { data: [], error: null });
  const gruposBuilder = makeQueryBuilder(options.grupos ?? { data: [], error: null });
  const itensBuilder = makeQueryBuilder(options.itens ?? { data: [], error: null });
  const builders: Record<string, Record<string, unknown>> = {
    produtos: builder,
    produto_complemento_grupos: gruposBuilder,
    produto_complemento_itens: itensBuilder,
  };
  const from = vi.fn((table: string) => builders[table] ?? builder);
  const upload = vi.fn(options.upload ?? (async () => ({ data: { path: 'ok' }, error: null })));
  const getPublicUrl =
    options.getPublicUrl ?? vi.fn((path: string) => ({ data: { publicUrl: `https://public.example/produtos/${path}` } }));
  const storage = { from: vi.fn(() => ({ upload, getPublicUrl })) };
  const client = {
    from,
    storage,
    auth: {
      getUser: async () =>
        options.userError
          ? { data: { user: null }, error: options.userError }
          : options.userId
            ? { data: { user: { id: options.userId } }, error: null }
            : { data: { user: null }, error: null },
    },
  } as unknown as SupabaseClient<Database>;
  return { client, from, builder, gruposBuilder, itensBuilder, upload };
}

function fakeClientWithRpcReadSequence(options: {
  produtoReads: QueryResult[];
  grupos?: QueryResult;
  itens?: QueryResult;
  rpc: QueryResult;
}) {
  const produtosBuilder = makeQueryBuilder({ data: null, error: null });
  let nextRead = 0;
  produtosBuilder.maybeSingle = vi.fn(async () => options.produtoReads[nextRead++] ?? options.produtoReads.at(-1)!);
  const gruposBuilder = makeQueryBuilder(options.grupos ?? { data: [], error: null });
  const itensBuilder = makeQueryBuilder(options.itens ?? { data: [], error: null });
  const rpc = vi.fn(async () => options.rpc);
  const client = {
    from: vi.fn((table: string) => ({
      produtos: produtosBuilder,
      produto_complemento_grupos: gruposBuilder,
      produto_complemento_itens: itensBuilder,
    })[table] ?? produtosBuilder),
    rpc,
  } as unknown as SupabaseClient<Database>;
  return { client, rpc };
}

const PRODUTO_ROW = {
  id: 'produto-1',
  estabelecimento_id: 'estab-1',
  nome: 'Dipirona',
  descricao: 'Caixa com 10 comprimidos.',
  preco_reais: 14.9,
  categoria_produto: 'medicamentos',
  foto_url: null,
  ativo: true,
  excluido_em: null,
  gruposComplementos: [],
};

describe('product.supabase.ts — list (Story 4.3, AC1, AC2, AC6)', () => {
  it('filtra por estabelecimento_id e exclui soft-deleted; sem incluirInativos, filtra ativo=true', async () => {
    const { client, builder } = fakeClient({ produtos: { data: [PRODUTO_ROW], error: null } });
    const port = createProductSupabase(client);

    const produtos = await port.list('estab-1');

    expect(builder.eq).toHaveBeenCalledWith('estabelecimento_id', 'estab-1');
    expect(builder.is).toHaveBeenCalledWith('excluido_em', null);
    expect(builder.eq).toHaveBeenCalledWith('ativo', true);
    expect(produtos).toEqual([PRODUTO_ROW]);
  });

  it('com incluirInativos: true, não filtra por ativo', async () => {
    const { client, builder } = fakeClient({ produtos: { data: [PRODUTO_ROW], error: null } });
    const port = createProductSupabase(client);

    await port.list('estab-1', { incluirInativos: true });

    expect(builder.eq).not.toHaveBeenCalledWith('ativo', true);
  });

  it('lista vazia quando não há produtos — sem erro', async () => {
    const { client } = fakeClient({ produtos: { data: [], error: null } });
    const port = createProductSupabase(client);
    await expect(port.list('estab-1')).resolves.toEqual([]);
  });

  it('propaga o erro do SDK sem sucesso fictício (ex.: RLS bloqueando outro estabelecimento)', async () => {
    const { client } = fakeClient({ produtos: { data: null, error: new Error('permission denied for table produtos') } });
    const port = createProductSupabase(client);
    await expect(port.list('estab-de-outro-dono')).rejects.toThrow(/permission denied/);
  });
});

/**
 * Stories 5.4 (AC2) / 5.5 (AC1) — confirmação end-to-end de que `list`/
 * `getById` (já reais desde 4.3/4.5, sob a RLS `publico_ve_produtos`) servem
 * corretamente o app Cliente (anônimo/cliente autenticado), não só o app
 * Lojista (onde `lojista_gerencia_produtos` também libera a leitura, podendo
 * mascarar um problema específico de `publico_ve_produtos`). O adapter em si
 * (`createProductSupabase`) é o MESMO consumido pelos dois apps — não há
 * "modo Cliente" separado no código; a barreira real é a policy no Postgres,
 * não testável por um client fake (fica registrada como confirmação
 * manual/integração real no Dev Agent Record da Story). Aqui, o client fake
 * simula o efeito observável de `publico_ve_produtos` (RLS filtra
 * silenciosamente, nunca lança) — mesmo padrão dos testes de `getById`
 * acima, mas explicitamente descrevendo o cenário "loja pausada" exigido
 * pela Story 5.5.
 */
describe('product.supabase.ts — confirmação end-to-end a partir do app Cliente (Stories 5.4 AC2, 5.5 AC1)', () => {
  it('list retorna só produtos ativos/não-excluídos — mesmo contrato usado por Loja.tsx via useCatalogo', async () => {
    const { client, builder } = fakeClient({ produtos: { data: [PRODUTO_ROW], error: null } });
    const port = createProductSupabase(client);

    const produtos = await port.list('estab-1');

    expect(builder.eq).toHaveBeenCalledWith('ativo', true);
    expect(produtos).toEqual([PRODUTO_ROW]);
  });

  it('list de loja sem produtos publicados resolve [] honesto (RLS publico_ve_produtos, sem erro)', async () => {
    const { client } = fakeClient({ produtos: { data: [], error: null } });
    const port = createProductSupabase(client);

    await expect(port.list('estab-loja-pausada')).resolves.toEqual([]);
  });

  it('getById retorna o produto real quando visível ao cliente', async () => {
    const { client } = fakeClient({ produtos: { data: PRODUTO_ROW, error: null } });
    const port = createProductSupabase(client);

    await expect(port.getById('produto-1')).resolves.toEqual(PRODUTO_ROW);
  });

  it('getById de produto de loja pausada/inativa retorna null (RLS publico_ve_produtos bloqueia, nunca lança)', async () => {
    const { client } = fakeClient({ produtos: { data: null, error: null } });
    const port = createProductSupabase(client);

    await expect(port.getById('produto-de-loja-pausada')).resolves.toBeNull();
  });

  it('getById de produto inexistente retorna null', async () => {
    const { client } = fakeClient({ produtos: { data: null, error: null } });
    const port = createProductSupabase(client);

    await expect(port.getById('produto-inexistente')).resolves.toBeNull();
  });
});

describe('product.supabase.ts — complementos (COMP-READ)', () => {
  const GRUPOS = [
    { id: 'grupo-1', produto_id: 'produto-1', nome: 'Tamanho', tipo: 'unica', min_selecoes: 1, max_selecoes: 1, ordem: 0 },
    { id: 'grupo-2', produto_id: 'produto-1', nome: 'Adicionais', tipo: 'multipla', min_selecoes: 0, max_selecoes: 3, ordem: 1 },
  ];
  const ITENS = [
    { id: 'item-1', grupo_id: 'grupo-1', nome: 'Normal', preco_extra_reais: 0, ordem: 0 },
    { id: 'item-2', grupo_id: 'grupo-1', nome: 'Grande', preco_extra_reais: 4, ordem: 1 },
    { id: 'item-3', grupo_id: 'grupo-2', nome: 'Bacon', preco_extra_reais: 5, ordem: 0 },
  ];
  const ESPERADO = [
    { id: 'grupo-1', nome: 'Tamanho', tipo: 'unica', min_selecoes: 1, max_selecoes: 1, ordem: 0, itens: [
      { id: 'item-1', nome: 'Normal', preco_extra_reais: 0, ordem: 0 },
      { id: 'item-2', nome: 'Grande', preco_extra_reais: 4, ordem: 1 },
    ] },
    { id: 'grupo-2', nome: 'Adicionais', tipo: 'multipla', min_selecoes: 0, max_selecoes: 3, ordem: 1, itens: [
      { id: 'item-3', nome: 'Bacon', preco_extra_reais: 5, ordem: 0 },
    ] },
  ];
  it('getById busca grupos e itens das tabelas de complementos', async () => {
    const { client, from, gruposBuilder, itensBuilder } = fakeClient({
      produtos: { data: { ...PRODUTO_ROW, gruposComplementos: undefined }, error: null },
      grupos: { data: GRUPOS, error: null },
      itens: { data: ITENS, error: null },
    });
    const port = createProductSupabase(client);
    const produto = await port.getById('produto-1');
    expect(from).toHaveBeenCalledWith('produto_complemento_grupos');
    expect(from).toHaveBeenCalledWith('produto_complemento_itens');
    expect(gruposBuilder.in).toHaveBeenCalledWith('produto_id', ['produto-1']);
    expect(itensBuilder.in).toHaveBeenCalledWith('grupo_id', ['grupo-1', 'grupo-2']);
    expect(gruposBuilder.order).toHaveBeenNthCalledWith(1, 'ordem', { ascending: true });
    expect(gruposBuilder.order).toHaveBeenNthCalledWith(2, 'id', { ascending: true });
    expect(itensBuilder.order).toHaveBeenNthCalledWith(1, 'ordem', { ascending: true });
    expect(itensBuilder.order).toHaveBeenNthCalledWith(2, 'id', { ascending: true });
    expect(produto?.gruposComplementos).toEqual(ESPERADO);
  });
  it('list isola grupos e itens entre produtos, mesmo com resultados intercalados', async () => {
    const produtoB = { ...PRODUTO_ROW, id: 'produto-2', nome: 'Outro', gruposComplementos: undefined };
    const { client, gruposBuilder, itensBuilder } = fakeClient({
      produtos: { data: [{ ...PRODUTO_ROW, gruposComplementos: undefined }, produtoB], error: null },
      grupos: { data: [
        { id: 'grupo-a', produto_id: 'produto-1', nome: 'Tamanho', tipo: 'unica', min_selecoes: 1, max_selecoes: 1, ordem: 0 },
        { id: 'grupo-b', produto_id: 'produto-2', nome: 'Tamanho', tipo: 'unica', min_selecoes: 1, max_selecoes: 1, ordem: 0 },
      ], error: null },
      itens: { data: [
        { id: 'item-a', grupo_id: 'grupo-a', nome: 'Normal', preco_extra_reais: 0, ordem: 0 },
        { id: 'item-b', grupo_id: 'grupo-b', nome: 'Grande', preco_extra_reais: 4, ordem: 0 },
      ], error: null },
    });

    const produtos = await createProductSupabase(client).list('estab-1');

    expect(gruposBuilder.in).toHaveBeenCalledWith('produto_id', ['produto-1', 'produto-2']);
    expect(itensBuilder.in).toHaveBeenCalledWith('grupo_id', ['grupo-a', 'grupo-b']);
    expect(produtos.map((produto) => produto.gruposComplementos)).toEqual([
      [{ id: 'grupo-a', nome: 'Tamanho', tipo: 'unica', min_selecoes: 1, max_selecoes: 1, ordem: 0, itens: [{ id: 'item-a', nome: 'Normal', preco_extra_reais: 0, ordem: 0 }] }],
      [{ id: 'grupo-b', nome: 'Tamanho', tipo: 'unica', min_selecoes: 1, max_selecoes: 1, ordem: 0, itens: [{ id: 'item-b', nome: 'Grande', preco_extra_reais: 4, ordem: 0 }] }],
    ]);
  });
  it('list anexa grupos por produto e [] para produto sem grupos', async () => {
    const outro = { ...PRODUTO_ROW, id: 'produto-2', nome: 'Outro', gruposComplementos: undefined };
    const { client } = fakeClient({
      produtos: { data: [{ ...PRODUTO_ROW, gruposComplementos: undefined }, outro], error: null },
      grupos: { data: GRUPOS, error: null },
      itens: { data: ITENS, error: null },
    });
    const port = createProductSupabase(client);
    const produtos = await port.list('estab-1');
    expect(produtos[0]?.gruposComplementos).toEqual(ESPERADO);
    expect(produtos[1]?.gruposComplementos).toEqual([]);
  });
  it('getById sem grupos devolve []', async () => {
    const { client } = fakeClient({ produtos: { data: { ...PRODUTO_ROW, gruposComplementos: undefined }, error: null } });
    const port = createProductSupabase(client);
    await expect(port.getById('produto-1')).resolves.toMatchObject({ gruposComplementos: [] });
  });
  it('propaga erro ao buscar grupos sem sucesso ficticio', async () => {
    const { client } = fakeClient({
      produtos: { data: { ...PRODUTO_ROW, gruposComplementos: undefined }, error: null },
      grupos: { data: null, error: new Error('permission denied for table produto_complemento_grupos') },
    });
    const port = createProductSupabase(client);
    await expect(port.getById('produto-1')).rejects.toThrow(/permission denied/);
  });
  it.each(['getById', 'list'] as const)('propaga o mesmo erro de itens em %s', async (method) => {
    const itensError = { message: 'permission denied for table produto_complemento_itens', code: '42501' };
    const { client } = fakeClient({
      produtos: { data: method === 'getById' ? { ...PRODUTO_ROW, gruposComplementos: undefined } : [{ ...PRODUTO_ROW, gruposComplementos: undefined }], error: null },
      grupos: { data: GRUPOS, error: null },
      itens: { data: null, error: itensError },
    });
    const port = createProductSupabase(client);
    await expect(method === 'getById' ? port.getById('produto-1') : port.list('estab-1')).rejects.toBe(itensError);
  });
  it('não consulta complementos quando a lista está vazia ou o produto não existe', async () => {
    const vazio = fakeClient({ produtos: { data: [], error: null } });
    await expect(createProductSupabase(vazio.client).list('estab-1')).resolves.toEqual([]);
    expect(vazio.from).not.toHaveBeenCalledWith('produto_complemento_grupos');

    const ausente = fakeClient({ produtos: { data: null, error: null } });
    await expect(createProductSupabase(ausente.client).getById('ausente')).resolves.toBeNull();
    expect(ausente.from).not.toHaveBeenCalledWith('produto_complemento_grupos');
  });
  it('devolve grupos persistidos pela RPC e propaga falha na releitura', async () => {
    const gruposPersistidos = [{ id: 'grupo-persistido', produto_id: 'produto-1', nome: 'Tamanho', tipo: 'unica', min_selecoes: 1, max_selecoes: 1, ordem: 0 }];
    const itensPersistidos = [{ id: 'item-persistido', grupo_id: 'grupo-persistido', nome: 'Grande', preco_extra_reais: 4, ordem: 0 }];
    const created = fakeClientWithRpcReadSequence({
      produtoReads: [{ data: PRODUTO_ROW, error: null }], grupos: { data: gruposPersistidos, error: null }, itens: { data: itensPersistidos, error: null }, rpc: { data: { id: 'produto-1' }, error: null },
    });
    const input = { estabelecimento_id: 'estab-1', nome: 'Dipirona', preco_reais: 14.9, categoria_produto: 'medicamentos', gruposComplementos: [{ nome: 'Tamanho', tipo: 'unica' as const, min_selecoes: 1, max_selecoes: 1, ordem: 0, itens: [{ nome: 'Grande', preco_extra_reais: 4, ordem: 0 }] }] };
    const produto = await createProductSupabase(created.client).create(input);
    expect(produto.gruposComplementos[0]?.id).toBe('grupo-persistido');
    expect(created.rpc).toHaveBeenCalledWith('salvar_produto_complementos', expect.any(Object));

    const relerError = { message: 'network error after write' };
    const failed = fakeClientWithRpcReadSequence({ produtoReads: [{ data: null, error: relerError }], rpc: { data: { id: 'produto-1' }, error: null } });
    await expect(createProductSupabase(failed.client).create(input)).rejects.toBe(relerError);
  });
});

describe('product.supabase.ts — create (Story 4.4, AC2, AC3, AC6)', () => {
  it('insere o produto e devolve a linha REAL persistida (nunca ecoa o input)', async () => {
    const { client, from, builder } = fakeClient({ produtos: { data: PRODUTO_ROW, error: null } });
    const port = createProductSupabase(client);

    const produto = await port.create({
      estabelecimento_id: 'estab-1',
      nome: 'Dipirona',
      preco_reais: 14.9,
      categoria_produto: 'medicamentos',
    });

    expect(from).toHaveBeenCalledWith('produtos');
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ estabelecimento_id: 'estab-1', nome: 'Dipirona', preco_reais: 14.9 }),
    );
    expect(produto).toEqual(PRODUTO_ROW);
  });

  it('propaga erro de RLS (estabelecimento_id de outro dono) sem sucesso fictício (AC3, AC6)', async () => {
    const { client } = fakeClient({
      produtos: { data: null, error: { message: 'new row violates row-level security policy' } },
    });
    const port = createProductSupabase(client);

    await expect(
      port.create({ estabelecimento_id: 'estab-de-outro-dono', nome: 'X', preco_reais: 10, categoria_produto: 'cuidados' }),
    ).rejects.toMatchObject({ message: 'new row violates row-level security policy' });
  });

  it('propaga erro de CHECK preco_reais > 0 sem sucesso fictício', async () => {
    const { client } = fakeClient({
      produtos: { data: null, error: { message: 'new row for relation "produtos" violates check constraint "produtos_preco_reais_check"' } },
    });
    const port = createProductSupabase(client);

    await expect(
      port.create({ estabelecimento_id: 'estab-1', nome: 'X', preco_reais: -5, categoria_produto: 'cuidados' }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/preco_reais/) });
  });
});

describe('product.supabase.ts — getById (Story 4.5, AC1)', () => {
  it('devolve o produto real por id', async () => {
    const { client, builder } = fakeClient({ produtos: { data: PRODUTO_ROW, error: null } });
    const port = createProductSupabase(client);

    const produto = await port.getById('produto-1');

    expect(builder.select).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 'produto-1');
    expect(produto).toEqual(PRODUTO_ROW);
  });

  it('devolve null quando o produto não existe ou pertence a outro dono (RLS)', async () => {
    const { client } = fakeClient({ produtos: { data: null, error: null } });
    const port = createProductSupabase(client);

    await expect(port.getById('produto-de-outro-dono')).resolves.toBeNull();
  });

  it('propaga o erro do SDK sem sucesso fictício', async () => {
    const { client } = fakeClient({ produtos: { data: null, error: new Error('network error') } });
    const port = createProductSupabase(client);
    await expect(port.getById('produto-1')).rejects.toThrow(/network error/);
  });
});

describe('product.supabase.ts — update (Story 4.5, AC2, AC3)', () => {
  it('aplica patch parcial e relê o produto REAL pós-escrita (nunca ecoa o input)', async () => {
    const atualizado = { ...PRODUTO_ROW, nome: 'Dipirona 500mg', preco_reais: 19.9 };
    const { client, builder } = fakeClient({ produtos: { data: atualizado, error: null } });
    const port = createProductSupabase(client);

    const produto = await port.update('produto-1', { nome: 'Dipirona 500mg', preco_reais: 19.9 });

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'Dipirona 500mg', preco_reais: 19.9 }),
    );
    expect(builder.eq).toHaveBeenCalledWith('id', 'produto-1');
    expect(produto).toEqual(atualizado);
    // Nunca ecoa o input: campos não alterados vêm da releitura, não do patch.
    expect(produto.categoria_produto).toBe(PRODUTO_ROW.categoria_produto);
  });

  it('patch só inclui os campos presentes no input (patch parcial real, AC2)', async () => {
    const { client, builder } = fakeClient({ produtos: { data: PRODUTO_ROW, error: null } });
    const port = createProductSupabase(client);

    await port.update('produto-1', { descricao: 'Nova descrição' });

    expect(builder.update).toHaveBeenCalledWith({ descricao: 'Nova descrição' });
  });

  it('propaga erro de CHECK preco_reais > 0 sem sucesso fictício (AC2)', async () => {
    const { client } = fakeClient({
      produtos: {
        data: null,
        error: { message: 'new row for relation "produtos" violates check constraint "produtos_preco_reais_check"' },
      },
    });
    const port = createProductSupabase(client);

    await expect(port.update('produto-1', { preco_reais: -5 })).rejects.toMatchObject({
      message: expect.stringMatching(/preco_reais/),
    });
  });

  it('RLS bloqueando UPDATE de produto de outro dono — 0 linhas afetadas, releitura rejeita (AC3)', async () => {
    const { client } = fakeClient({ produtos: { data: null, error: null } });
    const port = createProductSupabase(client);

    await expect(port.update('produto-de-outro-dono', { nome: 'X' })).rejects.toThrow(/não encontrou o produto/);
  });
});

describe('product.supabase.ts — pause (Story 4.6, AC1, AC4)', () => {
  it('faz UPDATE ativo=false e devolve o produto real pausado', async () => {
    const pausado = { ...PRODUTO_ROW, ativo: false };
    const { client, builder } = fakeClient({ produtos: { data: pausado, error: null } });
    const port = createProductSupabase(client);

    const produto = await port.pause('produto-1');

    expect(builder.update).toHaveBeenCalledWith({ ativo: false });
    expect(produto.ativo).toBe(false);
  });

  it('RLS bloqueando pause de produto de outro dono — releitura rejeita (AC4)', async () => {
    const { client } = fakeClient({ produtos: { data: null, error: null } });
    const port = createProductSupabase(client);

    await expect(port.pause('produto-de-outro-dono')).rejects.toThrow(/não encontrou o produto/);
  });
});

describe('product.supabase.ts — delete (Story 4.6, AC2, AC3, AC4)', () => {
  it('soft delete real — UPDATE excluido_em=NOW(), nunca remoção física da linha', async () => {
    const { client, builder } = fakeClient({ produtos: { data: null, error: null } });
    const port = createProductSupabase(client);

    await port.delete('produto-1');

    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ excluido_em: expect.any(String) }));
    expect(builder.eq).toHaveBeenCalledWith('id', 'produto-1');
  });

  it('propaga erro do SDK sem sucesso fictício', async () => {
    const { client } = fakeClient({
      produtos: { data: null, error: { message: 'permission denied for table produtos' } },
    });
    const port = createProductSupabase(client);

    await expect(port.delete('produto-de-outro-dono')).rejects.toMatchObject({
      message: expect.stringMatching(/permission denied/),
    });
  });

  it('nunca consulta uma tabela pedidos inexistente (checagem de pedidos em aberto é débito de retomada, não simulada)', async () => {
    const { client, from } = fakeClient({ produtos: { data: null, error: null } });
    const port = createProductSupabase(client);

    await port.delete('produto-1');

    expect(from).not.toHaveBeenCalledWith('pedidos');
  });
});

describe('product.supabase.ts — uploadFoto (Story 4.4, AC4)', () => {
  it('rejeita sem usuário autenticado', async () => {
    const { client } = fakeClient({ userId: null });
    const port = createProductSupabase(client);
    await expect(port.uploadFoto({ uri: 'file:///tmp/foto.jpg', ext: 'jpg' })).rejects.toThrow(/autenticação/i);
  });

  it('faz upload para {uid}/<arquivo> gerado e devolve a URL pública direta (nunca assinada)', async () => {
    const upload = vi.fn(async () => ({ data: { path: 'ok' }, error: null }));
    const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://public.example/produtos/${path}` } }));
    const { client } = fakeClient({ userId: 'user-lojista-1', upload, getPublicUrl });
    const fakeBlob = { size: 10, type: 'image/jpeg' };
    const fetchMock = vi.fn(async (uri: string) => {
      expect(uri).toBe('file:///tmp/foto-produto.jpg');
      return { blob: async () => fakeBlob };
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const port = createProductSupabase(client);
      const url = await port.uploadFoto({ uri: 'file:///tmp/foto-produto.jpg', ext: 'jpg' });

      expect(fetchMock).toHaveBeenCalledWith('file:///tmp/foto-produto.jpg');
      expect(upload).toHaveBeenCalledWith(
        expect.stringMatching(/^user-lojista-1\/produto-.+\.jpg$/),
        fakeBlob,
        expect.objectContaining({ contentType: 'image/jpeg', upsert: true }),
      );
      expect(getPublicUrl).toHaveBeenCalledWith(expect.stringMatching(/^user-lojista-1\/produto-.+\.jpg$/));
      expect(url).toMatch(/^https:\/\/public\.example\/produtos\//);
      expect(url).not.toMatch(/token=/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('propaga erro de upload (ex.: RLS de storage negando path de outro uid) sem sucesso fictício', async () => {
    const upload = vi.fn(async () => ({ data: null, error: new Error('new row violates row-level security policy') }));
    const { client } = fakeClient({ userId: 'user-lojista-2', upload });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => ({ size: 10, type: 'image/png' }) })),
    );

    try {
      const port = createProductSupabase(client);
      await expect(port.uploadFoto({ uri: 'file:///tmp/foto.png', ext: 'png' })).rejects.toThrow(/row-level security/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
