import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type {
  AnalyticsPort,
  MovimentacaoExtrato,
  PeriodoVendas,
  TopProdutoEntry,
  VendasPeriodoResumo,
} from '../ports/analytics.port';
import type { AsyncCallOptions } from '../types';

function roundReais(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Mesmo mapeamento de `analytics.mock.ts` (Story 1.10) — paridade obrigatória (Stories 7.9/7.10). */
const PERIODO_DIAS: Record<PeriodoVendas, number> = { '7d': 7, '30d': 30, '90d': 90, '1a': 365 };

const PEDIDO_VENDA_COLUMNS = 'id, numero, total_pago_reais, entregue_em, subtotal_produtos_reais, taxa_keepit_reais, taxa_deslocamento_reais';

type PedidoVendaRow = {
  id: string;
  numero: number;
  total_pago_reais: number;
  entregue_em: string | null;
  subtotal_produtos_reais: number;
  taxa_keepit_reais: number;
  taxa_deslocamento_reais: number;
};

type PedidoItemRow = {
  produto_id: string | null;
  nome_snapshot: string;
  quantidade: number;
  subtotal_reais: number;
};

type LancamentoPayoutRow = {
  id: string;
  valor_centavos: number;
  criado_em: string;
};

/**
 * Busca em lote os pedidos `entregue` do estabelecimento com `entregue_em`
 * dentro do período informado — fonte comum de `salesSummary`/`topProducts`
 * (Story 7.10), mesmo filtro do mock (`analytics.mock.ts#pedidosEntreguesNoPeriodo`).
 */
async function fetchPedidosEntreguesNoPeriodo(
  supabase: SupabaseClient<Database>,
  estabelecimentoId: string,
  periodo: PeriodoVendas,
): Promise<PedidoVendaRow[]> {
  const dias = PERIODO_DIAS[periodo];
  const limiteIso = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('pedidos')
    .select(PEDIDO_VENDA_COLUMNS)
    .eq('estabelecimento_id', estabelecimentoId)
    .eq('status', 'entregue')
    .gte('entregue_em', limiteIso);
  if (error) {
    throw error;
  }
  return (data ?? []) as unknown as PedidoVendaRow[];
}

/** Início (inclusive) e fim (exclusivo) do mês corrente em UTC — mesmo critério do mock (`getUTCFullYear`/`getUTCMonth`). */
function currentMonthRangeUTC(): { inicio: string; fimExclusive: string } {
  const agora = new Date();
  const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const fimExclusive = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1));
  return { inicio: inicio.toISOString(), fimExclusive: fimExclusive.toISOString() };
}

/**
 * Implementação real de `AnalyticsPort` (Stories 7.9/7.10) — agregações SQL
 * diretas sobre `pedidos`/`pedidos_itens` (vendas, `salesSummary`/
 * `topProducts`/parte "venda" de `monthlyStatement`) e sobre
 * `lancamentos_financeiros` tipo `payout` (parte "saque" de
 * `monthlyStatement`, Story 7.6/7.8) — nenhuma view materializada (texto do
 * épico: "MVP começa com query direta"). RLS já garante isolamento por
 * `estabelecimento_id` — o adapter não reimplementa checagem de ownership.
 */
export function createAnalyticsSupabase(client?: SupabaseClient<Database>): AnalyticsPort {
  let cachedClient: SupabaseClient<Database> | null = client ?? null;
  const resolveClient = (): SupabaseClient<Database> => cachedClient ?? (cachedClient = createClient());

  return {
    /** Story 7.10 (AC1, AC3, AC5). `totalVendasReais = SUM(total_pago_reais)`, `totalPedidos = COUNT(*)`. */
    async salesSummary(
      estabelecimentoId: string,
      periodo: PeriodoVendas,
      _options?: AsyncCallOptions,
    ): Promise<VendasPeriodoResumo> {
      const supabase = resolveClient();
      const pedidos = await fetchPedidosEntreguesNoPeriodo(supabase, estabelecimentoId, periodo);
      const totalVendasReais = roundReais(pedidos.reduce((sum, p) => sum + Number(p.total_pago_reais), 0));
      return { periodo, totalVendasReais, totalPedidos: pedidos.length };
    },

    /**
     * Story 7.10 (AC2, AC3, AC5). Agrega `pedidos_itens` dos pedidos do
     * período por `produto_id ?? nome_snapshot` (mesmo fallback do mock,
     * para produtos excluídos do catálogo), ordenado por
     * `totalVendidoReais DESC`.
     */
    async topProducts(
      estabelecimentoId: string,
      periodo: PeriodoVendas,
      _options?: AsyncCallOptions,
    ): Promise<TopProdutoEntry[]> {
      const supabase = resolveClient();
      const pedidos = await fetchPedidosEntreguesNoPeriodo(supabase, estabelecimentoId, periodo);
      if (pedidos.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from('pedidos_itens')
        .select('produto_id, nome_snapshot, quantidade, subtotal_reais')
        .in(
          'pedido_id',
          pedidos.map((p) => p.id),
        );
      if (error) {
        throw error;
      }

      const rows = (data ?? []) as unknown as PedidoItemRow[];
      const porProduto = new Map<string, TopProdutoEntry>();

      for (const item of rows) {
        const chave = item.produto_id ?? item.nome_snapshot;
        const atual = porProduto.get(chave) ?? {
          produtoId: item.produto_id,
          nomeSnapshot: item.nome_snapshot,
          quantidadeTotal: 0,
          totalVendidoReais: 0,
        };
        atual.quantidadeTotal += Number(item.quantidade);
        atual.totalVendidoReais = roundReais(atual.totalVendidoReais + Number(item.subtotal_reais));
        porProduto.set(chave, atual);
      }

      return [...porProduto.values()].sort((a, b) => b.totalVendidoReais - a.totalVendidoReais);
    },

    /**
     * Story 7.9 (AC1, AC2, AC3, AC5). União de (a) pedidos `entregue` do mês
     * corrente (UTC) → `tipo: 'venda'`, `valorReais = subtotal_produtos_reais
     * - taxa_keepit_reais + taxa_deslocamento_reais` (fonte: `pedidos`, não o
     * ledger — decisão [IDS] documentada em `ports/analytics.port.ts`); (b)
     * `lancamentos_financeiros` tipo `payout`, `status <> 'erro'`, do mês
     * corrente → `tipo: 'saque'`, `valorReais = ABS(valor_centavos)/100`.
     * Ordenado por `data DESC`, paridade de fórmula com
     * `analytics.mock.ts#monthlyStatement`.
     */
    async monthlyStatement(estabelecimentoId: string, _options?: AsyncCallOptions): Promise<MovimentacaoExtrato[]> {
      const supabase = resolveClient();
      const { inicio, fimExclusive } = currentMonthRangeUTC();

      const [pedidosResult, lancamentosResult] = await Promise.all([
        supabase
          .from('pedidos')
          .select(PEDIDO_VENDA_COLUMNS)
          .eq('estabelecimento_id', estabelecimentoId)
          .eq('status', 'entregue')
          .gte('entregue_em', inicio)
          .lt('entregue_em', fimExclusive),
        supabase
          .from('lancamentos_financeiros')
          .select('id, valor_centavos, criado_em')
          .eq('estabelecimento_id', estabelecimentoId)
          .eq('tipo', 'payout')
          .neq('status', 'erro')
          .gte('criado_em', inicio)
          .lt('criado_em', fimExclusive),
      ]);

      if (pedidosResult.error) {
        throw pedidosResult.error;
      }
      if (lancamentosResult.error) {
        throw lancamentosResult.error;
      }

      const vendas: MovimentacaoExtrato[] = ((pedidosResult.data ?? []) as unknown as PedidoVendaRow[]).map((p) => ({
        tipo: 'venda' as const,
        data: p.entregue_em as string,
        valorReais: roundReais(
          Number(p.subtotal_produtos_reais) - Number(p.taxa_keepit_reais) + Number(p.taxa_deslocamento_reais),
        ),
        referenciaId: p.id,
        descricao: `Venda #${p.numero}`,
        taxaKeepitReais: Number(p.taxa_keepit_reais),
      }));

      const saques: MovimentacaoExtrato[] = ((lancamentosResult.data ?? []) as unknown as LancamentoPayoutRow[]).map(
        (l) => ({
          tipo: 'saque' as const,
          data: l.criado_em,
          valorReais: roundReais(Math.abs(Number(l.valor_centavos)) / 100),
          referenciaId: l.id,
          descricao: 'Saque · PIX',
        }),
      );

      return [...vendas, ...saques].sort((a, b) => b.data.localeCompare(a.data));
    },
  };
}
