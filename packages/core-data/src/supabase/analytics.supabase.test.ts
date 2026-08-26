import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import { createAnalyticsSupabase } from './analytics.supabase';

/**
 * Stories 7.9/7.10 — [IDS] REUSE do padrão de query builder encadeável já
 * estabelecido em `order.supabase.test.ts`/`wallet.supabase.test.ts`,
 * estendido com `.gte()`/`.lt()`/`.neq()`/`.in()` (usados por
 * `analytics.supabase.ts`).
 */
type QueryResult = { data: unknown; error: unknown };

function makeQueryBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.neq = vi.fn(() => builder);
  builder.gte = vi.fn(() => builder);
  builder.lt = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.then = (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function fakeClient(options: { pedidos?: QueryResult; pedidosItens?: QueryResult; lancamentos?: QueryResult }) {
  const builders = {
    pedidos: makeQueryBuilder(options.pedidos ?? { data: [], error: null }),
    pedidos_itens: makeQueryBuilder(options.pedidosItens ?? { data: [], error: null }),
    lancamentos_financeiros: makeQueryBuilder(options.lancamentos ?? { data: [], error: null }),
  };
  const from = vi.fn((table: string) => builders[table as keyof typeof builders]);
  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, builders };
}

const PEDIDO_ROW = {
  id: 'pedido-1',
  numero: 2048,
  total_pago_reais: 37.7,
  entregue_em: '2026-08-10T12:00:00.000Z',
  subtotal_produtos_reais: 29.8,
  taxa_keepit_reais: 2.98,
  taxa_deslocamento_reais: 5,
};

describe('analytics.supabase.ts — salesSummary (Story 7.10, AC1, AC3, AC5, AC6)', () => {
  it('agrega SUM(total_pago_reais)/COUNT(*) dos pedidos entregues no período, para cada período (7d/30d/90d/1a)', async () => {
    for (const periodo of ['7d', '30d', '90d', '1a'] as const) {
      const { client, builders } = fakeClient({ pedidos: { data: [PEDIDO_ROW], error: null } });
      const port = createAnalyticsSupabase(client);
      const resumo = await port.salesSummary('estab-1', periodo);

      expect(builders.pedidos.eq).toHaveBeenCalledWith('estabelecimento_id', 'estab-1');
      expect(builders.pedidos.eq).toHaveBeenCalledWith('status', 'entregue');
      expect(resumo).toEqual({ periodo, totalVendasReais: 37.7, totalPedidos: 1 });
    }
  });

  it('período sem vendas retorna totalVendasReais: 0, totalPedidos: 0', async () => {
    const { client } = fakeClient({ pedidos: { data: [], error: null } });
    const port = createAnalyticsSupabase(client);
    await expect(port.salesSummary('estab-1', '30d')).resolves.toEqual({
      periodo: '30d',
      totalVendasReais: 0,
      totalPedidos: 0,
    });
  });

  it('isolamento entre estabelecimentos — filtra sempre pelo estabelecimentoId recebido', async () => {
    const { client, builders } = fakeClient({ pedidos: { data: [], error: null } });
    const port = createAnalyticsSupabase(client);
    await port.salesSummary('estab-2', '7d');
    expect(builders.pedidos.eq).toHaveBeenCalledWith('estabelecimento_id', 'estab-2');
  });
});

describe('analytics.supabase.ts — topProducts (Story 7.10, AC2, AC3, AC5, AC6)', () => {
  it('agrupa por produto_id quando presente, ordenado por totalVendidoReais desc', async () => {
    const { client } = fakeClient({
      pedidos: { data: [PEDIDO_ROW], error: null },
      pedidosItens: {
        data: [
          { produto_id: 'produto-a', nome_snapshot: 'Produto A', quantidade: 1, subtotal_reais: 10 },
          { produto_id: 'produto-b', nome_snapshot: 'Produto B', quantidade: 2, subtotal_reais: 40 },
        ],
        error: null,
      },
    });
    const port = createAnalyticsSupabase(client);
    const produtos = await port.topProducts('estab-1', '30d');

    expect(produtos).toEqual([
      { produtoId: 'produto-b', nomeSnapshot: 'Produto B', quantidadeTotal: 2, totalVendidoReais: 40 },
      { produtoId: 'produto-a', nomeSnapshot: 'Produto A', quantidadeTotal: 1, totalVendidoReais: 10 },
    ]);
  });

  it('produto com produto_id nulo (snapshot) é agrupado por nome_snapshot', async () => {
    const { client } = fakeClient({
      pedidos: { data: [PEDIDO_ROW], error: null },
      pedidosItens: {
        data: [
          { produto_id: null, nome_snapshot: 'Produto Descontinuado', quantidade: 1, subtotal_reais: 15 },
          { produto_id: null, nome_snapshot: 'Produto Descontinuado', quantidade: 1, subtotal_reais: 15 },
        ],
        error: null,
      },
    });
    const port = createAnalyticsSupabase(client);
    const produtos = await port.topProducts('estab-1', '30d');

    expect(produtos).toEqual([
      { produtoId: null, nomeSnapshot: 'Produto Descontinuado', quantidadeTotal: 2, totalVendidoReais: 30 },
    ]);
  });

  it('período sem vendas resolve [] sem consultar pedidos_itens', async () => {
    const { client, builders } = fakeClient({ pedidos: { data: [], error: null } });
    const port = createAnalyticsSupabase(client);
    await expect(port.topProducts('estab-1', '7d')).resolves.toEqual([]);
    expect(builders.pedidos_itens.select).not.toHaveBeenCalled();
  });
});

describe('analytics.supabase.ts — monthlyStatement (Story 7.9, AC1, AC2, AC3, AC5, AC6)', () => {
  it('une vendas (pedidos entregues) + saques (lancamentos_financeiros tipo=payout) do mês corrente, ordenado data desc, taxaKeepitReais só em venda', async () => {
    const { client } = fakeClient({
      pedidos: { data: [PEDIDO_ROW], error: null },
      lancamentos: {
        data: [{ id: 'lanc-1', valor_centavos: -20000, criado_em: '2026-08-12T09:00:00.000Z' }],
        error: null,
      },
    });
    const port = createAnalyticsSupabase(client);
    const movimentacoes = await port.monthlyStatement('estab-1');

    expect(movimentacoes).toEqual([
      {
        tipo: 'saque',
        data: '2026-08-12T09:00:00.000Z',
        valorReais: 200,
        referenciaId: 'lanc-1',
        descricao: 'Saque · PIX',
      },
      {
        tipo: 'venda',
        data: '2026-08-10T12:00:00.000Z',
        valorReais: 31.82,
        referenciaId: 'pedido-1',
        descricao: 'Venda #2048',
        taxaKeepitReais: 2.98,
      },
    ]);
    // Ordenado do mais recente para o mais antigo (o saque, 08-12, vem antes na saída acima
    // porque `data DESC` — a venda, 08-10, é mais antiga).
    expect(movimentacoes[0].data >= movimentacoes[1].data).toBe(true);
    expect('taxaKeepitReais' in movimentacoes[0]).toBe(false);
  });

  it('mês sem nenhuma movimentação retorna array vazio', async () => {
    const { client } = fakeClient({});
    const port = createAnalyticsSupabase(client);
    await expect(port.monthlyStatement('estab-1')).resolves.toEqual([]);
  });

  it('isolamento entre estabelecimentos — filtra as duas fontes pelo estabelecimentoId recebido', async () => {
    const { client, builders } = fakeClient({});
    const port = createAnalyticsSupabase(client);
    await port.monthlyStatement('estab-2');
    expect(builders.pedidos.eq).toHaveBeenCalledWith('estabelecimento_id', 'estab-2');
    expect(builders.lancamentos_financeiros.eq).toHaveBeenCalledWith('estabelecimento_id', 'estab-2');
  });

  it('paridade de fórmula com analytics.mock.ts — venda: subtotal - taxa_keepit + deslocamento; saque: ABS(valor_centavos)/100', async () => {
    const { client } = fakeClient({
      pedidos: {
        data: [{ ...PEDIDO_ROW, subtotal_produtos_reais: 100, taxa_keepit_reais: 10, taxa_deslocamento_reais: 5 }],
        error: null,
      },
      lancamentos: {
        data: [{ id: 'lanc-1', valor_centavos: -35000, criado_em: '2026-08-12T09:00:00.000Z' }],
        error: null,
      },
    });
    const port = createAnalyticsSupabase(client);
    const movimentacoes = await port.monthlyStatement('estab-1');

    const venda = movimentacoes.find((m) => m.tipo === 'venda');
    const saque = movimentacoes.find((m) => m.tipo === 'saque');
    expect(venda?.valorReais).toBe(100 - 10 + 5);
    expect(saque?.valorReais).toBe(350);
  });

  it('propaga erro real (pedidos) sem mascarar', async () => {
    const { client } = fakeClient({ pedidos: { data: null, error: { message: 'erro de rede', code: '500' } } });
    const port = createAnalyticsSupabase(client);
    await expect(port.monthlyStatement('estab-1')).rejects.toMatchObject({ message: 'erro de rede' });
  });

  it('propaga erro real (lancamentos_financeiros) sem mascarar', async () => {
    const { client } = fakeClient({
      pedidos: { data: [], error: null },
      lancamentos: { data: null, error: { message: 'erro de rede', code: '500' } },
    });
    const port = createAnalyticsSupabase(client);
    await expect(port.monthlyStatement('estab-1')).rejects.toMatchObject({ message: 'erro de rede' });
  });
});
