import type { AsyncCallOptions } from '../types';
import type { Cliente } from './auth.port';
import type { Estabelecimento } from './store.port';
import type { FormaPagamento, Pedido, PedidoStatus } from './order.port';
import type { Hub, HubHorario } from './hub.port';

/**
 * 9 valores exatos do CHECK constraint de `reembolsos_pendentes.motivo`.
 * [Source: docs/architecture/03-data-models.md#6.1]
 */
export type ReembolsoMotivo =
  | 'timeout_aceite'
  | 'recusa_lojista'
  | 'cancelamento_cliente_pre_aceite'
  | 'cancelamento_cliente_pos_aceite'
  | 'cancelamento_atraso'
  | 'nao_retirado_cliente'
  | 'nao_entregue_lojista'
  | 'chargeback'
  | 'cancelamento_admin';

export type ReembolsoStatus = 'pendente_admin' | 'em_processamento' | 'estornado' | 'erro';

/**
 * Domínio: tabela `reembolsos_pendentes`.
 * [Source: docs/architecture/03-data-models.md#6.1]
 */
export interface ReembolsoPendente {
  id: string;
  pedido_id: string;
  motivo: ReembolsoMotivo;
  valor_a_estornar_reais: number;
  valor_ao_lojista_reais: number;
  forma_pagamento: FormaPagamento;
  status: ReembolsoStatus;
  criado_em: string;
}

/**
 * 4 valores exatos do CHECK constraint de `estabelecimentos_falhas.tipo`.
 * [Source: docs/architecture/03-data-models.md#1.6]
 */
export type EstabelecimentoFalhaTipo = 'lojista_nao_apareceu' | 'atraso_grave' | 'chargeback' | 'reclamacao_admin';

/**
 * Domínio: tabela `estabelecimentos_falhas` — promovido de
 * `apps/admin/src/mock/adminOpsTypes.ts` (Story 0.13, Task 9) para
 * `packages/core-data` (Story 1.10, Task 4).
 * [Source: docs/architecture/03-data-models.md#1.6]
 */
export interface EstabelecimentoFalha {
  id: string;
  estabelecimento_id: string;
  pedido_id: string | null;
  tipo: EstabelecimentoFalhaTipo;
  detalhes: string;
  criado_em: string;
}

export interface FinancialRankingEntry {
  estabelecimento_id: string;
  nome_fantasia: string;
  gmvReais: number;
  pedidosEntregues: number;
}

export interface FinancialDashboardResult {
  periodoDias: number;
  gmvReais: number;
  receitaKeepitReais: number;
  ranking: FinancialRankingEntry[];
}

export interface CreateHubInput {
  nome: string;
  endereco: string;
  lat: number;
  lng: number;
  ponto_referencia?: string | null;
  foto_url?: string | null;
  horarios: HubHorario[];
}

export interface UpdateHubInput {
  nome?: string;
  endereco?: string;
  lat?: number;
  lng?: number;
  ponto_referencia?: string | null;
  foto_url?: string | null;
  ativo?: boolean;
  horarios?: HubHorario[];
}

export interface AdminPort {
  /** Lojas com `status = 'em_analise'`, aguardando aprovação/rejeição. */
  pendingStores(options?: AsyncCallOptions): Promise<Estabelecimento[]>;
  approve(estabelecimentoId: string, options?: AsyncCallOptions): Promise<Estabelecimento>;
  reject(estabelecimentoId: string, motivo: string, options?: AsyncCallOptions): Promise<Estabelecimento>;
  hubsCrud: {
    create(input: CreateHubInput, options?: AsyncCallOptions): Promise<Hub>;
    update(id: string, input: UpdateHubInput, options?: AsyncCallOptions): Promise<Hub>;
    delete(id: string, options?: AsyncCallOptions): Promise<void>;
  };
  refundQueue: {
    list(options?: AsyncCallOptions): Promise<ReembolsoPendente[]>;
    process(id: string, options?: AsyncCallOptions): Promise<ReembolsoPendente>;
  };

  // ---------------------------------------------------------------------
  // Admin-ops (Story 1.10, Task 4 — promovido de
  // `apps/admin/src/mock/adminOpsMock.ts`, Story 0.13)
  // ---------------------------------------------------------------------

  /** Busca por nome/telefone — `AuthPort.currentUser()` só resolve a sessão atual, não lista todos os clientes. */
  listClientes(filtros?: { busca?: string }, options?: AsyncCallOptions): Promise<Cliente[]>;
  blockCliente(clienteId: string, motivo: string, options?: AsyncCallOptions): Promise<Cliente>;
  unblockCliente(clienteId: string, options?: AsyncCallOptions): Promise<Cliente>;
  /**
   * [AUTO-DECISION] `listAllEstabelecimentos` não estava listado no texto
   * literal do AC4, mas é necessário para as telas do Admin (lista de
   * pedidos/qualidade do lojista precisam resolver nome da loja e listar
   * todos os lojistas, independente de status) — `StorePort.listByHub` só
   * retorna lojas `ativo`. Adicionado aqui (não em `StorePort`) porque é uma
   * capacidade administrativa (ver todas, inclusive suspensas/em análise),
   * não uma capacidade de catálogo do Cliente/Lojista.
   */
  listAllEstabelecimentos(options?: AsyncCallOptions): Promise<Estabelecimento[]>;
  suspendLojista(estabelecimentoId: string, motivo: string, options?: AsyncCallOptions): Promise<Estabelecimento>;
  lojistaQualityView(estabelecimentoId: string, options?: AsyncCallOptions): Promise<EstabelecimentoFalha[]>;
  /**
   * GMV/receita Keepit/ranking por loja no período — deriva 100% de
   * `pedidos.total_pago_reais`/`taxa_keepit_reais` de pedidos `entregue`,
   * nunca hardcoded.
   */
  financialDashboard(periodoDias: number, options?: AsyncCallOptions): Promise<FinancialDashboardResult>;
  /** Listagem administrativa de pedidos (todos os estabelecimentos), com filtro opcional de status. */
  listAllOrders(filtros?: { status?: PedidoStatus }, options?: AsyncCallOptions): Promise<Pedido[]>;
  /** Força `status -> cancelado_admin` e popula `reembolsos` (`motivo: 'cancelamento_admin'`, 100% cliente). */
  forceCancelOrder(pedidoId: string, motivo: string, options?: AsyncCallOptions): Promise<Pedido>;
}
