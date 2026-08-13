import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import type { CreatePedidoInput } from '../ports/order.port';
import { PinBloqueadoError, PinIncorretoError } from '../ports/order.port';
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
  TransicaoInvalidaError,
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
  saiu_hub_em: null,
  entregue_em: null,
  cancelado_em: null,
  subtotal_produtos_reais: 29.8,
  taxa_deslocamento_reais: 5,
  taxa_keepit_reais: 2.98,
  taxa_servico_comprador_reais: 2.9,
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
    // Story 6.16 (AC1, AC3): `taxa_servico_comprador_reais` volta na releitura
    // real (gap corrigido — antes desta story, a coluna nunca era lida).
    expect(pedido.taxa_servico_comprador_reais).toBe(2.9);
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

describe('order.supabase.ts — markReadyForHub (Story 6.12, AC2, AC4, AC6)', () => {
  const SAINDO_HUB_ROW = { ...PEDIDO_ROW, status: 'saindo_hub', saiu_hub_em: '2026-08-13T11:00:00.000Z' };

  it('chama a RPC avancar_estado_pedido com p_novo_status=saindo_hub e monta o Pedido a partir da releitura real (RPC retorna só o status), com saiu_hub_em honesto (não hard-coded null)', async () => {
    const { client, rpc } = fakeClient({
      rpc: { data: 'saindo_hub', error: null },
      pedidos: { data: SAINDO_HUB_ROW, error: null },
      pedidosItens: { data: [PEDIDO_ITEM_ROW], error: null },
    });

    const port = createOrderSupabase(client);
    const pedido = await port.markReadyForHub('pedido-1');

    expect(rpc).toHaveBeenCalledWith('avancar_estado_pedido', { p_pedido_id: 'pedido-1', p_novo_status: 'saindo_hub' });
    expect(pedido.status).toBe('saindo_hub');
    expect(pedido.saiu_hub_em).toBe('2026-08-13T11:00:00.000Z');
  });

  it('mapeia AUTENTICACAO_NECESSARIA para AutenticacaoNecessariaError', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'AUTENTICACAO_NECESSARIA', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.markReadyForHub('pedido-1')).rejects.toBeInstanceOf(AutenticacaoNecessariaError);
  });

  it('mapeia PEDIDO_NAO_ENCONTRADO para PedidoNaoEncontradoError', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'PEDIDO_NAO_ENCONTRADO', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.markReadyForHub('pedido-inexistente')).rejects.toBeInstanceOf(PedidoNaoEncontradoError);
  });

  it('mapeia ACESSO_NEGADO para AcessoNegadoError (pedido de outra loja)', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'ACESSO_NEGADO', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.markReadyForHub('pedido-de-outra-loja')).rejects.toBeInstanceOf(AcessoNegadoError);
  });

  it('mapeia TRANSICAO_INVALIDA para TransicaoInvalidaError — origem fora de aceito/em_preparo (ex.: dupla-execução)', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'TRANSICAO_INVALIDA', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.markReadyForHub('pedido-ja-saindo-hub')).rejects.toBeInstanceOf(TransicaoInvalidaError);
  });

  it('propaga qualquer outro erro sem mascarar e sem sucesso simulado', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'erro de rede', code: '500' } } });
    const port = createOrderSupabase(client);
    await expect(port.markReadyForHub('pedido-1')).rejects.toMatchObject({ message: 'erro de rede' });
  });
});

describe('order.supabase.ts — markArrivedAtHub (Story 6.14, AC2, AC3, AC6, AC7)', () => {
  const NO_HUB_ROW = { ...PEDIDO_ROW, status: 'no_hub', saiu_hub_em: '2026-08-13T11:00:00.000Z' };

  it('chama a RPC avancar_estado_pedido com p_novo_status=no_hub e monta o Pedido a partir da releitura real (RPC retorna só o status)', async () => {
    const { client, rpc } = fakeClient({
      rpc: { data: 'no_hub', error: null },
      pedidos: { data: NO_HUB_ROW, error: null },
      pedidosItens: { data: [PEDIDO_ITEM_ROW], error: null },
    });

    const port = createOrderSupabase(client);
    const pedido = await port.markArrivedAtHub('pedido-1');

    expect(rpc).toHaveBeenCalledWith('avancar_estado_pedido', { p_pedido_id: 'pedido-1', p_novo_status: 'no_hub' });
    expect(pedido.status).toBe('no_hub');
  });

  it('mapeia AUTENTICACAO_NECESSARIA para AutenticacaoNecessariaError', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'AUTENTICACAO_NECESSARIA', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.markArrivedAtHub('pedido-1')).rejects.toBeInstanceOf(AutenticacaoNecessariaError);
  });

  it('mapeia PEDIDO_NAO_ENCONTRADO para PedidoNaoEncontradoError', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'PEDIDO_NAO_ENCONTRADO', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.markArrivedAtHub('pedido-inexistente')).rejects.toBeInstanceOf(PedidoNaoEncontradoError);
  });

  it('mapeia ACESSO_NEGADO para AcessoNegadoError (pedido de outra loja / não é o lojista dono nem admin)', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'ACESSO_NEGADO', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.markArrivedAtHub('pedido-de-outra-loja')).rejects.toBeInstanceOf(AcessoNegadoError);
  });

  it('mapeia TRANSICAO_INVALIDA para TransicaoInvalidaError — origem fora de saindo_hub (ex.: em_preparo, ou no_hub repetido/dupla-execução)', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'TRANSICAO_INVALIDA', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.markArrivedAtHub('pedido-ja-no-hub')).rejects.toBeInstanceOf(TransicaoInvalidaError);
  });

  it('propaga qualquer outro erro sem mascarar e sem sucesso simulado', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'erro de rede', code: '500' } } });
    const port = createOrderSupabase(client);
    await expect(port.markArrivedAtHub('pedido-1')).rejects.toMatchObject({ message: 'erro de rede' });
  });
});

describe('order.supabase.ts — confirmPin (Story 6.15, AC2, AC3, AC4, AC6, AC8)', () => {
  const ENTREGUE_ROW = { ...PEDIDO_ROW, status: 'entregue', entregue_em: '2026-08-13T12:00:00.000Z' };

  it('PIN correto: lê resultado="entregue" da linha e monta o Pedido a partir da releitura real (nunca lê pin_hash)', async () => {
    const { client, rpc } = fakeClient({
      rpc: { data: [{ resultado: 'entregue', tentativas_restantes: null, bloqueado_ate: null }], error: null },
      pedidos: { data: ENTREGUE_ROW, error: null },
      pedidosItens: { data: [PEDIDO_ITEM_ROW], error: null },
    });

    const port = createOrderSupabase(client);
    const pedido = await port.confirmPin('pedido-1', '7734');

    expect(rpc).toHaveBeenCalledWith('confirmar_pin_pedido', { p_pedido_id: 'pedido-1', p_pin: '7734' });
    expect(pedido.status).toBe('entregue');
    expect(pedido.entregue_em).toBe('2026-08-13T12:00:00.000Z');
    expect(pedido).not.toHaveProperty('pin_hash');
  });

  it('PIN incorreto: lê resultado="pin_incorreto" e rejeita com PinIncorretoError carregando tentativas_restantes (NÃO trata como exceção da RPC)', async () => {
    const { client } = fakeClient({
      rpc: { data: [{ resultado: 'pin_incorreto', tentativas_restantes: 3, bloqueado_ate: null }], error: null },
    });

    const port = createOrderSupabase(client);
    const promise = port.confirmPin('pedido-1', '0000');
    await expect(promise).rejects.toBeInstanceOf(PinIncorretoError);
    await promise.catch((err: PinIncorretoError) => {
      expect(err.tentativasRestantes).toBe(3);
    });
  });

  it('5º erro bloqueia: lê resultado="pin_bloqueado" e rejeita com PinBloqueadoError carregando bloqueado_ate', async () => {
    const { client } = fakeClient({
      rpc: {
        data: [{ resultado: 'pin_bloqueado', tentativas_restantes: 0, bloqueado_ate: '2026-08-13T12:05:00.000Z' }],
        error: null,
      },
    });

    const port = createOrderSupabase(client);
    const promise = port.confirmPin('pedido-1', '0000');
    await expect(promise).rejects.toBeInstanceOf(PinBloqueadoError);
    await promise.catch((err: PinBloqueadoError) => {
      expect(err.bloqueadoAte).toBe('2026-08-13T12:05:00.000Z');
    });
  });

  it('tentativa durante bloqueio ativo: mesmo contrato de resultado="pin_bloqueado" (a RPC não consome tentativa, mas o adapter só lê a linha)', async () => {
    const { client, rpc } = fakeClient({
      rpc: {
        data: [{ resultado: 'pin_bloqueado', tentativas_restantes: 0, bloqueado_ate: '2026-08-13T12:05:00.000Z' }],
        error: null,
      },
    });

    const port = createOrderSupabase(client);
    await expect(port.confirmPin('pedido-1', '9999')).rejects.toBeInstanceOf(PinBloqueadoError);
    expect(rpc).toHaveBeenCalledWith('confirmar_pin_pedido', { p_pedido_id: 'pedido-1', p_pin: '9999' });
  });

  it('mapeia AUTENTICACAO_NECESSARIA (exceção estrutural) para AutenticacaoNecessariaError', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'AUTENTICACAO_NECESSARIA', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.confirmPin('pedido-1', '7734')).rejects.toBeInstanceOf(AutenticacaoNecessariaError);
  });

  it('mapeia PEDIDO_NAO_ENCONTRADO (exceção estrutural) para PedidoNaoEncontradoError', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'PEDIDO_NAO_ENCONTRADO', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.confirmPin('pedido-inexistente', '7734')).rejects.toBeInstanceOf(PedidoNaoEncontradoError);
  });

  it('mapeia ACESSO_NEGADO (exceção estrutural) para AcessoNegadoError', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'ACESSO_NEGADO', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.confirmPin('pedido-de-outra-loja', '7734')).rejects.toBeInstanceOf(AcessoNegadoError);
  });

  it('mapeia ESTADO_INVALIDO (exceção estrutural) para EstadoInvalidoError — pedido ainda em saindo_hub, fora de no_hub', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'ESTADO_INVALIDO', code: 'P0001' } } });
    const port = createOrderSupabase(client);
    await expect(port.confirmPin('pedido-saindo-hub', '7734')).rejects.toBeInstanceOf(EstadoInvalidoError);
  });

  it('propaga qualquer outro erro sem mascarar e sem sucesso simulado', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'erro de rede', code: '500' } } });
    const port = createOrderSupabase(client);
    await expect(port.confirmPin('pedido-1', '7734')).rejects.toMatchObject({ message: 'erro de rede' });
  });
});
