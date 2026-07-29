import type {
  AnalyticsPort,
  MovimentacaoExtrato,
  PeriodoVendas,
  TopProdutoEntry,
  VendasPeriodoResumo,
} from '../ports/analytics.port';
import type { Pedido } from '../ports/order.port';
import type { AsyncCallOptions } from '../types';
import { simulateAsync } from './async-helpers';
import type { MockDb } from './db';

function roundReais(value: number): number {
  return Math.round(value * 100) / 100;
}

const PERIODO_DIAS: Record<PeriodoVendas, number> = { '7d': 7, '30d': 30, '90d': 90, '1a': 365 };

function pedidosEntreguesNoPeriodo(db: MockDb, estabelecimentoId: string, periodo: PeriodoVendas): Pedido[] {
  const dias = PERIODO_DIAS[periodo];
  const limiteMs = Date.now() - dias * 24 * 60 * 60 * 1000;
  return db.pedidos.filter(
    (p) =>
      p.estabelecimento_id === estabelecimentoId &&
      p.status === 'entregue' &&
      p.entregue_em !== null &&
      new Date(p.entregue_em).getTime() >= limiteMs,
  );
}

export function createAnalyticsMock(db: MockDb): AnalyticsPort {
  return {
    salesSummary(
      estabelecimentoId: string,
      periodo: PeriodoVendas,
      options?: AsyncCallOptions,
    ): Promise<VendasPeriodoResumo> {
      return simulateAsync(
        () => {
          const pedidos = pedidosEntreguesNoPeriodo(db, estabelecimentoId, periodo);
          const totalVendasReais = roundReais(pedidos.reduce((sum, p) => sum + p.total_pago_reais, 0));
          return { periodo, totalVendasReais, totalPedidos: pedidos.length };
        },
        { periodo, totalVendasReais: 0, totalPedidos: 0 },
        options,
      );
    },

    topProducts(
      estabelecimentoId: string,
      periodo: PeriodoVendas,
      options?: AsyncCallOptions,
    ): Promise<TopProdutoEntry[]> {
      return simulateAsync(
        () => {
          const pedidos = pedidosEntreguesNoPeriodo(db, estabelecimentoId, periodo);
          const porProduto = new Map<string, TopProdutoEntry>();

          for (const pedido of pedidos) {
            for (const item of pedido.itens) {
              const chave = item.produto_id ?? item.nome_snapshot;
              const atual = porProduto.get(chave) ?? {
                produtoId: item.produto_id,
                nomeSnapshot: item.nome_snapshot,
                quantidadeTotal: 0,
                totalVendidoReais: 0,
              };
              atual.quantidadeTotal += item.quantidade;
              atual.totalVendidoReais = roundReais(atual.totalVendidoReais + item.subtotal_reais);
              porProduto.set(chave, atual);
            }
          }

          return [...porProduto.values()].sort((a, b) => b.totalVendidoReais - a.totalVendidoReais);
        },
        [],
        options,
      );
    },

    monthlyStatement(estabelecimentoId: string, options?: AsyncCallOptions): Promise<MovimentacaoExtrato[]> {
      return simulateAsync(
        () => {
          const agora = new Date();

          const vendas: MovimentacaoExtrato[] = db.pedidos
            .filter(
              (p) =>
                p.estabelecimento_id === estabelecimentoId &&
                p.status === 'entregue' &&
                p.entregue_em !== null &&
                new Date(p.entregue_em).getUTCFullYear() === agora.getUTCFullYear() &&
                new Date(p.entregue_em).getUTCMonth() === agora.getUTCMonth(),
            )
            .map((p) => ({
              tipo: 'venda' as const,
              data: p.entregue_em as string,
              valorReais: roundReais(p.subtotal_produtos_reais - p.taxa_keepit_reais + p.taxa_deslocamento_reais),
              referenciaId: p.id,
              descricao: `Venda #${p.numero}`,
              taxaKeepitReais: p.taxa_keepit_reais,
            }));

          const saques: MovimentacaoExtrato[] = db.saques
            .filter(
              (s) =>
                s.estabelecimento_id === estabelecimentoId &&
                s.status !== 'erro' &&
                new Date(s.solicitado_em).getUTCFullYear() === agora.getUTCFullYear() &&
                new Date(s.solicitado_em).getUTCMonth() === agora.getUTCMonth(),
            )
            .map((s) => ({
              tipo: 'saque' as const,
              data: s.solicitado_em,
              valorReais: s.valor_reais,
              referenciaId: s.id,
              descricao: 'Saque · PIX',
            }));

          return [...vendas, ...saques].sort((a, b) => b.data.localeCompare(a.data));
        },
        [],
        options,
      );
    },
  };
}
