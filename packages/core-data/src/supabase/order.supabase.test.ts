import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import type { CreatePedidoInput } from '../ports/order.port';
import {
  AcessoNegadoError,
  AutenticacaoNecessariaError,
  ClienteNaoEncontradoError,
  EstadoInvalidoError,
  HubIndisponivelError,
  HubNaoAtendidoError,
  ItensInvalidosError,
  LojaIndisponivelError,
  PedidoNaoEncontradoError,
  TempoEstimadoInvalidoError,
} from './order-errors';
import { createOrderSupabase } from './order.supabase';

/**
 * Stories 6.6/6.7 — [IDS] REUSE do padrão de query builder encadeável já
 * estabelecido em `store.supabase.test.ts` (Stories 4.7/4.8), estendido com
 * `.order()`/`.in()`/`.rpc()` e `auth.getUser()`.
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

function fakeClient(options: {
  userId?: string;
  userError?: unknown;
  rpc?: { data: unknown; error: unknown };
  pedidos?: QueryResult;
  pedidosItens?: QueryResult;
}) {
  const builders = {
    pedidos: makeQueryBuilder(options.pedidos ?? { data: null, error: null }),
    pedidos_itens: makeQueryBuilder(options.pedidosItens ?? { data: [], error: null }),
  };
  const from = vi.fn((table: string) => builders[table as 'pedidos' | 'pedidos_itens']);
  const rpc = vi.fn(async (_fn: string, _args: unknown) => options.rpc ?? { data: null, error: null });
  const auth = {
    getUser: vi.fn(async () =>
      options.userError
        ? { data: { user: null }, error: options.userError }
        : options.userId
          ? { data: { user: { id: options.userId } }, error: null }
          : { data: { user: null }, error: null },
    ),
  };
  const client = { from, rpc, auth } as unknown as SupabaseClient<Database>;
  return { client, rpc, builders };
}

const PEDIDO_ROW = {
  id: 'pedido-1',
  numero: 2048,
  cliente_id: 'cliente-1',
  estabelecimento_id: 'estab-1',
  hub_id: 'hub-1',
  status: 'aguardando_aceite',
  pin_texto: '7734',
  tentativas_pin: 0,
  pin_bloqueado_ate: null,
  tempo_estimado_min: null,
  criado_em: '2026-08-13T10:00:00.000Z',
  aceito_em: null,
  entregue_em: null,
  cancelado_em: null,
  subtotal_produtos_reais: 29.8,
  taxa_deslocamento_reais: 5,
  taxa_keepit_reais: 2.98,
  total_pago_reais: 37.7,
  motivo_recusa: null,
  motivo_cancelamento: null,
  motivo_nao_retirado: null,
  forma_pagamento: 'pix',
};

const PEDIDO_ITEM_ROW = {
  id: 'item-1',
  pedido_id: 'pedido-1',
  produto_id: 'produto-dipirona',
  nome_snapshot: 'Dipirona Monoidratada 500mg',
  preco_unitario_reais: 14.9,
  quantidade: 2,
  subtotal_reais: 29.8,
};

const INPUT: CreatePedidoInput = {
  cliente_id: 'cliente-1',
  estabelecimento_id: 'estab-1',
  hub_id: 'hub-1',
  itens: [
    { produto_id: 'produto-dipirona', nome_snapshot: 'Dipirona Monoidratada 500mg', preco_unitario_reais: 14.9, quantidade: 2 },
  ],
  forma_pagamento: 'pix',
  subtotal_produtos_reais: 29.8,
  taxa_deslocamento_reais: 5,
  taxa_keepit_reais: 2.98,
  taxa_servico_comprador_reais: 2.9,
  total_pago_reais: 37.7,
  nf_solicitada: false,
};

describe('order.supabase.ts — create (Story 6.6, AC1, AC3, AC4)', () => {
  it('chama a RPC criar_pedido com o p_itens mapeado (nome_snapshot/preco_unitario/quantidade) e os 5 totais, sem cliente_id/forma_pagamento', async () => {
    const { client, rpc } = fakeClient({
      rpc: { data: [{ pedido_id: 'pedido-1', numero: 2048, pin_texto: '7734' }], error: null },
      pedidos: { data: PEDIDO_ROW, error: null },
      pedidosItens: { data: [PEDIDO_ITEM_ROW], error: null },
    });

    const port = createOrderSupabase(client);
    await port.create(INPUT);

    expect(rpc).toHaveBeenCalledWith('criar_pedido', {
      p_estabelecimento_id: 'estab-1',
      p_hub_id: 'hub-1',
      p_itens: [{ produto_id: 'produto-dipirona', nome_snapshot: 'Dipirona Monoidratada 500mg', preco_unitario: 14.9, quantidade: 2 }],
      p_subtotal_produtos_reais: 29.8,
      p_taxa_deslocamento_reais: 5,
      p_taxa_keepit_reais: 2.98,
      p_taxa_servico_comprador_reais: 2.9,
      p_total_pago_reais: 37.7,
      p_nf_solicitada: false,
    });

    const rpcCallArgs = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(rpcCallArgs).not.toHaveProperty('cliente_id');
    expect(rpcCallArgs).not.toHaveProperty('forma_pagamento');
    expect(rpcCallArgs).not.toHaveProperty('p_cliente_id');
  });

  it('monta o Pedido de retorno a partir da releitura real (pedido_id da RPC) — nunca ecoa/inventa campos do input', async () => {
    const { client } = fakeClient({
      rpc: { data: [{ pedido_id: 'pedido-1', numero: 2048, pin_texto: '7734' }], error: null },
      pedidos: { data: PEDIDO_ROW, error: null },
      pedidosItens: { data: [PEDIDO_ITEM_ROW], error: null },
    });

    const port = createOrderSupabase(client);
    const pedido = await port.create(INPUT);

    expect(pedido.id).toBe('pedido-1');
    expect(pedido.numero).toBe(2048);
    expect(pedido.pin_texto).toBe('7734');
    expect(pedido.status).toBe('aguardando_aceite');
    expect(pedido.itens).toHaveLength(1);
    expect(pedido.itens[0]).toMatchObject({ nome_snapshot: 'Dipirona Monoidratada 500mg', quantidade: 2 });
    // `pin_hash` nunca é exposto — não existe no tipo `Pedido`.
    expect(pedido).not.toHaveProperty('pin_hash');
  });

  it('mapeia AUTENTICACAO_NECESSARIA para AutenticacaoNecessariaError', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'AUTENTICACAO_NECESSARIA', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.create(INPUT)).rejects.toBeInstanceOf(AutenticacaoNecessariaError);
  });

  it('mapeia CLIENTE_NAO_ENCONTRADO para ClienteNaoEncontradoError', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'CLIENTE_NAO_ENCONTRADO', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.create(INPUT)).rejects.toBeInstanceOf(ClienteNaoEncontradoError);
  });

  it('mapeia ITENS_INVALIDOS para ItensInvalidosError', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'ITENS_INVALIDOS', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.create(INPUT)).rejects.toBeInstanceOf(ItensInvalidosError);
  });

  it('mapeia LOJA_INDISPONIVEL para LojaIndisponivelError', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'LOJA_INDISPONIVEL', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.create(INPUT)).rejects.toBeInstanceOf(LojaIndisponivelError);
  });

  it('mapeia HUB_NAO_ATENDIDO para HubNaoAtendidoError', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'HUB_NAO_ATENDIDO', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.create(INPUT)).rejects.toBeInstanceOf(HubNaoAtendidoError);
  });

  it('mapeia HUB_INDISPONIVEL para HubIndisponivelError', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'HUB_INDISPONIVEL', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.create(INPUT)).rejects.toBeInstanceOf(HubIndisponivelError);
  });

  it('propaga qualquer outro erro sem mascarar e sem sucesso simulado', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'erro de rede', code: '500' } } });
    const port = createOrderSupabase(client);
    await expect(port.create(INPUT)).rejects.toMatchObject({ message: 'erro de rede' });
  });
});

describe('order.supabase.ts — listMine (Story 6.7, AC4, AC5)', () => {
  it('sem sessão resolve [] honesto sem consultar pedidos', async () => {
    const { client } = fakeClient({});
    const port = createOrderSupabase(client);
    await expect(port.listMine('qualquer-cliente-id')).resolves.toEqual([]);
  });

  it('filtra por auth.uid() da SESSÃO, não pelo clienteId recebido como parâmetro (AC5)', async () => {
    const { client, builders } = fakeClient({
      userId: 'cliente-da-sessao',
      pedidos: { data: [PEDIDO_ROW], error: null },
      pedidosItens: { data: [PEDIDO_ITEM_ROW], error: null },
    });

    const port = createOrderSupabase(client);
    await port.listMine('cliente-de-outro-usuario-passado-como-param');

    expect(builders.pedidos.eq).toHaveBeenCalledWith('cliente_id', 'cliente-da-sessao');
  });

  it('mapeia pedidos + itens para o formato Pedido[], ordenado por criado_em desc, sem vazar pin_hash', async () => {
    const { client, builders } = fakeClient({
      userId: 'cliente-1',
      pedidos: { data: [PEDIDO_ROW], error: null },
      pedidosItens: { data: [PEDIDO_ITEM_ROW], error: null },
    });

    const port = createOrderSupabase(client);
    const pedidos = await port.listMine('cliente-1');

    expect(builders.pedidos.order).toHaveBeenCalledWith('criado_em', { ascending: false });
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].pin_texto).toBe('7734');
    expect(pedidos[0]).not.toHaveProperty('pin_hash');
    expect(pedidos[0].itens).toHaveLength(1);
  });
});

describe('order.supabase.ts — listByEstabelecimento (Story 6.8, AC1, AC5)', () => {
  it('resolve a partir de meu_estabelecimento_id() da SESSÃO, ignorando o estabelecimentoId recebido como parâmetro', async () => {
    const { client, rpc, builders } = fakeClient({
      rpc: { data: 'estab-da-sessao', error: null },
      pedidos: { data: [PEDIDO_ROW], error: null },
      pedidosItens: { data: [PEDIDO_ITEM_ROW], error: null },
    });

    const port = createOrderSupabase(client);
    const pedidos = await port.listByEstabelecimento('estabelecimento-de-outra-loja-passado-como-param');

    expect(rpc).toHaveBeenCalledWith('meu_estabelecimento_id');
    expect(builders.pedidos.eq).toHaveBeenCalledWith('estabelecimento_id', 'estab-da-sessao');
    expect(builders.pedidos.order).toHaveBeenCalledWith('criado_em', { ascending: false });
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).not.toHaveProperty('pin_hash');
  });

  it('sem estabelecimento próprio (sem sessão de lojista) resolve [] honesto sem consultar pedidos', async () => {
    const { client, builders } = fakeClient({ rpc: { data: null, error: null } });

    const port = createOrderSupabase(client);
    await expect(port.listByEstabelecimento('qualquer-id')).resolves.toEqual([]);
    expect(builders.pedidos.select).not.toHaveBeenCalled();
  });
});

describe('order.supabase.ts — accept (Story 6.9, AC2, AC3, AC5)', () => {
  const ACEITO_ROW = { ...PEDIDO_ROW, status: 'aceito', tempo_estimado_min: 25, aceito_em: '2026-08-13T10:05:00.000Z' };

  it('chama a RPC aceitar_pedido com os args certos e monta o Pedido a partir da releitura real (RPC retorna só o uuid)', async () => {
    const { client, rpc } = fakeClient({
      rpc: { data: 'pedido-1', error: null },
      pedidos: { data: ACEITO_ROW, error: null },
      pedidosItens: { data: [PEDIDO_ITEM_ROW], error: null },
    });

    const port = createOrderSupabase(client);
    const pedido = await port.accept('pedido-1', 25);

    expect(rpc).toHaveBeenCalledWith('aceitar_pedido', { p_pedido_id: 'pedido-1', p_tempo_estimado_min: 25 });
    expect(pedido.status).toBe('aceito');
    expect(pedido.tempo_estimado_min).toBe(25);
    expect(pedido.aceito_em).toBe('2026-08-13T10:05:00.000Z');
  });

  it('mapeia AUTENTICACAO_NECESSARIA para AutenticacaoNecessariaError', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'AUTENTICACAO_NECESSARIA', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.accept('pedido-1', 25)).rejects.toBeInstanceOf(AutenticacaoNecessariaError);
  });

  it('mapeia TEMPO_ESTIMADO_INVALIDO para TempoEstimadoInvalidoError', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'TEMPO_ESTIMADO_INVALIDO', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.accept('pedido-1', 0)).rejects.toBeInstanceOf(TempoEstimadoInvalidoError);
  });

  it('mapeia PEDIDO_NAO_ENCONTRADO para PedidoNaoEncontradoError', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'PEDIDO_NAO_ENCONTRADO', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.accept('pedido-inexistente', 25)).rejects.toBeInstanceOf(PedidoNaoEncontradoError);
  });

  it('mapeia ACESSO_NEGADO para AcessoNegadoError (pedido de outra loja)', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'ACESSO_NEGADO', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.accept('pedido-de-outra-loja', 25)).rejects.toBeInstanceOf(AcessoNegadoError);
  });

  it('mapeia ESTADO_INVALIDO para EstadoInvalidoError — proteção contra dupla-aceitação', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'ESTADO_INVALIDO', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.accept('pedido-ja-aceito', 25)).rejects.toBeInstanceOf(EstadoInvalidoError);
  });

  it('propaga qualquer outro erro sem mascarar e sem sucesso simulado', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'erro de rede', code: '500' } } });
    const port = createOrderSupabase(client);
    await expect(port.accept('pedido-1', 25)).rejects.toMatchObject({ message: 'erro de rede' });
  });
});
