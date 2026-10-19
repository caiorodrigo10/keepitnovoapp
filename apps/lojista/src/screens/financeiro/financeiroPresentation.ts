import { getDataClient, type AsyncCallOptions, type PeriodoVendas } from '@keepit/core-data';

/**
 * Camada de apresentação do Financeiro — Story 1.10 (Task 7). Promove
 * `financeiro.mock.ts` (Story 0.11, removido nesta story) para consumir
 * `client.analytics` (real, derivado de `db.pedidos`/`pedidos_itens`) em vez
 * de fixtures estáticas desconectadas do mock db.
 *
 * [AUTO-DECISION] Alguns campos puramente ilustrativos do protótipo
 * (`variacaoPercent` — comparação com o período anterior; `retiradasOkPercent`
 * — % de retiradas concluídas sem `nao_retirado`) NÃO têm um método de
 * agregação dedicado em `AnalyticsPort` (fora do escopo desta story — ver
 * Dev Notes AC7). Mantidos como valores fixos/neutros documentados aqui
 * (não mais fixtures por período), para não bloquear a fidelidade visual das
 * telas (mesmo layout/textos, só a origem do valor mudou). Uma story futura
 * pode estender `AnalyticsPort` para cobri-los com dado real, se necessário.
 */

export type Periodo = PeriodoVendas;

export const PERIODOS: Array<{ key: Periodo; label: string }> = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: '1a', label: '1 ano' },
];

const VARIACAO_LABEL: Record<Periodo, string> = {
  '7d': 'vs. semana anterior',
  '30d': 'vs. mês anterior',
  '90d': 'vs. trimestre anterior',
  '1a': 'vs. ano anterior',
};

export interface VendasResumo {
  totalReais: number;
  variacaoPercent: number;
  variacaoLabel: string;
  /** Alturas relativas (0-1) das barras do mini-gráfico — derivadas dos top produtos reais do período. */
  barras: number[];
  destaqueIndex: number;
}

export interface TopProduto {
  nome: string;
  valorReais: number;
}

export interface VendasDetalhe extends VendasResumo {
  pedidos: number;
  ticketMedioReais: number;
  itensVendidos: number;
  /** [AUTO-DECISION] Não modelado por nenhuma port ainda — placeholder neutro (ver nota do módulo). */
  retiradasOkPercent: number;
  topProdutos: TopProduto[];
}

function buildBarras(valores: number[]): { barras: number[]; destaqueIndex: number } {
  if (valores.length === 0) {
    return { barras: [], destaqueIndex: -1 };
  }
  const maxValor = Math.max(...valores, 1);
  const barras = valores.map((v) => v / maxValor);
  const destaqueIndex = barras.indexOf(Math.max(...barras));
  return { barras, destaqueIndex };
}

export async function getVendasResumo(
  estabelecimentoId: string,
  periodo: Periodo,
  options?: AsyncCallOptions,
): Promise<VendasResumo> {
  const client = getDataClient();
  const [resumo, produtos] = await Promise.all([
    client.analytics.salesSummary(estabelecimentoId, periodo, options),
    client.analytics.topProducts(estabelecimentoId, periodo, options),
  ]);
  const { barras, destaqueIndex } = buildBarras(produtos.slice(0, 7).map((p) => p.totalVendidoReais));

  return {
    totalReais: resumo.totalVendasReais,
    variacaoPercent: 0,
    variacaoLabel: VARIACAO_LABEL[periodo],
    barras,
    destaqueIndex,
  };
}

export async function getVendasDetalhe(
  estabelecimentoId: string,
  periodo: Periodo,
  options?: AsyncCallOptions,
): Promise<VendasDetalhe> {
  const client = getDataClient();
  const [resumo, produtos] = await Promise.all([
    client.analytics.salesSummary(estabelecimentoId, periodo, options),
    client.analytics.topProducts(estabelecimentoId, periodo, options),
  ]);
  const { barras, destaqueIndex } = buildBarras(produtos.slice(0, 7).map((p) => p.totalVendidoReais));
  const itensVendidos = produtos.reduce((soma, p) => soma + p.quantidadeTotal, 0);
  const ticketMedioReais = resumo.totalPedidos > 0 ? resumo.totalVendasReais / resumo.totalPedidos : 0;

  return {
    totalReais: resumo.totalVendasReais,
    variacaoPercent: 0,
    variacaoLabel: VARIACAO_LABEL[periodo],
    barras,
    destaqueIndex,
    pedidos: resumo.totalPedidos,
    ticketMedioReais,
    itensVendidos,
    retiradasOkPercent: 100,
    topProdutos: produtos.slice(0, 3).map((p) => ({ nome: p.nomeSnapshot, valorReais: p.totalVendidoReais })),
  };
}

export type MovimentacaoExtrato =
  | {
      tipo: 'venda';
      id: string;
      numeroPedido: number;
      dataLabel: string;
      taxaKeepitReais: number;
      valorLiquidoReais: number;
    }
  | {
      tipo: 'saque';
      id: string;
      dataLabel: string;
      metodo: 'PIX';
      status: string;
      valorReais: number;
    };

export interface ExtratoMes {
  mesLabel: string;
  repasseLiquidoReais: number;
  recebidoReais: number;
  taxasKeepitReais: number;
  movimentacoes: MovimentacaoExtrato[];
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Meses selecionáveis no seletor da tela Extrato — mês corrente + 3 anteriores (nomes reais, não mais fixo "Junho"). */
export const MESES_DISPONIVEIS: string[] = Array.from({ length: 4 }, (_, i) => {
  const agora = new Date();
  const data = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
  return capitalize(data.toLocaleString('pt-BR', { month: 'long' }));
});

function formatDataLabel(iso: string): string {
  const data = new Date(iso);
  return `${data.getDate()} ${capitalize(data.toLocaleString('pt-BR', { month: 'short' })).replace('.', '')}`;
}

const EMPTY_EXTRATO = (mesLabel: string): ExtratoMes => ({
  mesLabel,
  repasseLiquidoReais: 0,
  recebidoReais: 0,
  taxasKeepitReais: 0,
  movimentacoes: [],
});

/**
 * `analytics.port.monthlyStatement` cobre apenas o mês corrente (ver Dev
 * Notes) — só `MESES_DISPONIVEIS[0]` (mês atual) retorna dado real; os
 * demais exercitam o estado vazio, mesmo comportamento visual da Story 0.11
 * (lá era "Junho" fixo com dado, os demais vazios).
 */
export async function getExtrato(
  estabelecimentoId: string,
  mesLabel: string,
  options?: AsyncCallOptions,
): Promise<ExtratoMes> {
  if (mesLabel !== MESES_DISPONIVEIS[0]) {
    return EMPTY_EXTRATO(mesLabel);
  }

  const client = getDataClient();
  const movimentacoesReais = await client.analytics.monthlyStatement(estabelecimentoId, options);

  const movimentacoes: MovimentacaoExtrato[] = movimentacoesReais.map((m) => {
    if (m.tipo === 'venda') {
      return {
        tipo: 'venda' as const,
        id: m.referenciaId,
        numeroPedido: Number(m.descricao.replace(/\D/g, '')) || 0,
        dataLabel: formatDataLabel(m.data),
        taxaKeepitReais: m.taxaKeepitReais ?? 0,
        valorLiquidoReais: m.valorReais,
      };
    }
    return {
      tipo: 'saque' as const,
      id: m.referenciaId,
      dataLabel: formatDataLabel(m.data),
      metodo: 'PIX' as const,
      status: 'concluído',
      valorReais: m.valorReais,
    };
  });

  const recebidoReais = movimentacoes
    .filter((m): m is Extract<MovimentacaoExtrato, { tipo: 'venda' }> => m.tipo === 'venda')
    .reduce((soma, m) => soma + m.valorLiquidoReais + m.taxaKeepitReais, 0);
  const taxasKeepitReais = movimentacoes
    .filter((m): m is Extract<MovimentacaoExtrato, { tipo: 'venda' }> => m.tipo === 'venda')
    .reduce((soma, m) => soma + m.taxaKeepitReais, 0);
  const repasseLiquidoReais = recebidoReais - taxasKeepitReais;

  return { mesLabel, repasseLiquidoReais, recebidoReais, taxasKeepitReais, movimentacoes };
}
