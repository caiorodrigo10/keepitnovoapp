import type { AsyncCallOptions } from '../types';

/**
 * Domínio: agregações de vendas do Lojista — Story 1.10 (Task 7), promovido
 * de `apps/lojista/src/screens/financeiro/financeiro.mock.ts` (Story 0.11).
 *
 * [IDS] Decisão do @dev (REUSE > ADAPT > CREATE, `.claude/rules/ids-principles.md`):
 * - REUSE avaliado: nenhuma port existente expõe agregação de vendas —
 *   rejeitado, a capacidade não existe.
 * - ADAPT avaliado: estender `WalletPort` (`getBalance`/`requestWithdrawal`/
 *   `statement`) com `salesSummary`/`topProducts`/`monthlyStatement`.
 *   Rejeitado: `WalletPort` modela um conceito específico e fechado —
 *   "saldo disponível/bloqueado + saques" (a view `carteira_lojista` e a
 *   tabela `saques`, ambas sobre MOVIMENTAÇÃO DE DINHEIRO JÁ LIQUIDADO).
 *   Analytics de vendas é um READ MODEL diferente: agregações sobre
 *   `pedidos`/`pedidos_itens` filtradas por período, sem relação com saldo
 *   disponível/bloqueado ou processo de saque. Colar os dois na mesma port
 *   tornaria `WalletPort` uma "port de tudo que é financeiro do lojista",
 *   perdendo a fronteira clara de responsabilidade que a Story 0.2
 *   estabeleceu deliberadamente ("poucas ports, mas com fronteira nítida").
 * - CREATE justificado: `AnalyticsPort` é pequena (3 métodos), cobre
 *   exclusivamente leitura/agregação (não há escrita), seguindo o MESMO
 *   contrato (`AsyncCallOptions`) e mesmos nomes de campo do schema real
 *   (`pedidos.total_pago_reais`/`taxa_keepit_reais`/`pedidos_itens.nome_snapshot`)
 *   das demais 7 ports do Épico 0. O crescimento de 7 para 8 ports é aceito
 *   como custo direto de reconciliar um gap real (Story 0.11), não como
 *   conveniência — decisão registrada aqui para o @architect revisar.
 */
export type PeriodoVendas = '7d' | '30d' | '90d' | '1a';

export interface VendasPeriodoResumo {
  periodo: PeriodoVendas;
  totalVendasReais: number;
  totalPedidos: number;
}

export interface TopProdutoEntry {
  produtoId: string | null;
  nomeSnapshot: string;
  quantidadeTotal: number;
  totalVendidoReais: number;
}

export type MovimentacaoExtratoTipo = 'venda' | 'saque';

export interface MovimentacaoExtrato {
  tipo: MovimentacaoExtratoTipo;
  data: string;
  /** Valor líquido (venda: `subtotal - taxa_keepit + taxa_deslocamento`; saque: `valor_reais`). */
  valorReais: number;
  /** `pedido_id` (tipo `venda`) ou `saque_id` (tipo `saque`). */
  referenciaId: string;
  descricao: string;
  /** Só presente em `tipo: 'venda'` — `pedidos.taxa_keepit_reais` descontado, para exibição do detalhe da taxa. */
  taxaKeepitReais?: number;
}

export interface AnalyticsPort {
  /** Vendas (soma de `total_pago_reais` de pedidos `entregue`) no período informado. */
  salesSummary(estabelecimentoId: string, periodo: PeriodoVendas, options?: AsyncCallOptions): Promise<VendasPeriodoResumo>;
  /** Produtos mais vendidos (agregação de `pedidos_itens` por `nome_snapshot`) no período informado. */
  topProducts(
    estabelecimentoId: string,
    periodo: PeriodoVendas,
    options?: AsyncCallOptions,
  ): Promise<TopProdutoEntry[]>;
  /** Extrato do mês corrente — vendas entregues + saques, ordenado do mais recente para o mais antigo. */
  monthlyStatement(estabelecimentoId: string, options?: AsyncCallOptions): Promise<MovimentacaoExtrato[]>;
}
