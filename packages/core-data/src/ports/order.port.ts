import type { AsyncCallOptions } from '../types';

/**
 * 15 valores exatos do CHECK constraint de `pedidos.status`.
 * [Source: docs/architecture/03-data-models.md#5.1]
 */
export type PedidoStatus =
  | 'aguardando_pagamento'
  | 'aguardando_aceite'
  | 'aceito'
  | 'em_preparo'
  | 'saindo_hub'
  | 'no_hub'
  | 'entregue'
  | 'cancelado'
  | 'cancelado_timeout'
  | 'cancelado_atraso'
  | 'cancelado_admin'
  | 'recusado'
  | 'nao_retirado'
  | 'nao_entregue_lojista'
  | 'estornado_chargeback';

export type FormaPagamento = 'pix' | 'cartao';

/**
 * Domínio: tabela `pedidos_itens` (snapshot dos itens no momento do checkout).
 * [Source: docs/architecture/03-data-models.md#5.2]
 */
export interface PedidoItem {
  id: string;
  pedido_id: string;
  produto_id: string | null;
  nome_snapshot: string;
  preco_unitario_reais: number;
  quantidade: number;
  subtotal_reais: number;
}

/**
 * Domínio: tabela `pedidos` (tabela central do sistema).
 *
 * IMPORTANTE: expõe apenas `pin_texto` (exibição ao cliente). `pin_hash` NUNCA
 * é exposto pela port — é um detalhe de persistência da implementação real.
 * [Source: docs/architecture/03-data-models.md#5.1]
 */
export interface Pedido {
  id: string;
  numero: number;
  cliente_id: string;
  estabelecimento_id: string;
  hub_id: string;
  status: PedidoStatus;
  pin_texto: string;
  tentativas_pin: number;
  pin_bloqueado_ate: string | null;
  tempo_estimado_min: number | null;
  criado_em: string;
  aceito_em: string | null;
  saiu_hub_em: string | null;
  cliente_chegou_em: string | null;
  lojista_chegou_em: string | null;
  entregue_em: string | null;
  cancelado_em: string | null;
  subtotal_produtos_reais: number;
  taxa_deslocamento_reais: number;
  /** 12% de `subtotal_produtos_reais` — calculado via `businessConfig.taxaKeepitPercent`, nunca hard-coded. */
  taxa_keepit_reais: number;
  /**
   * Story 6.16 (AC1, AC3) — [IDS] ADAPT: campo que faltava neste tipo de
   * domínio. `CreatePedidoInput.taxa_servico_comprador_reais` (Story 6.6) já
   * existia e já era persistido pela RPC `criar_pedido`/pelo mock, mas o
   * READ MODEL (`Pedido`) nunca expunha o valor de volta — gap real
   * confirmado por leitura direta de `PEDIDO_COLUMNS`/`mapRowToPedido`
   * (`order.supabase.ts`), necessário para `Recibo.tsx` corrigir o rótulo
   * "Taxa de serviço" (hoje ligado erroneamente a `taxa_deslocamento_reais`,
   * mesmo bug já corrigido em `Checkout.tsx`, Rodada 8).
   */
  taxa_servico_comprador_reais: number;
  total_pago_reais: number;
  motivo_recusa: string | null;
  motivo_cancelamento: string | null;
  motivo_nao_retirado: string | null;
  forma_pagamento: FormaPagamento;
  itens: PedidoItem[];
}

/**
 * Story 6.6 (AC1, AC4) — estendido com `nome_snapshot`/`preco_unitario_reais`
 * (antes só `{produto_id, quantidade}`). A RPC real `criar_pedido`
 * (`20260813004934_rpc_criar_pedido.sql`) espera cada item de `p_itens` já
 * com o snapshot do nome/preço — ela CONGELA o que recebe, não relê
 * `produtos` para montar o snapshot. `preco_unitario_reais` é o preço
 * CONGELADO no carrinho (`CartItem.precoSnapshotReais`, Story 6.1), não o
 * preço atual do catálogo.
 */
export interface CreatePedidoItemInput {
  produto_id: string;
  nome_snapshot: string;
  preco_unitario_reais: number;
  quantidade: number;
}

/**
 * Story 6.6 (AC1, AC4) — estendido com os 5 totais de cabeçalho +
 * `nf_solicitada`. A RPC real `criar_pedido` os recebe como PARÂMETROS e os
 * PERSISTE como snapshot (não os recalcula a partir de `produtos` — ver
 * `docs/stories/6.6.story.md`, AC1, "LIMITAÇÃO DE PILOTO"). Quem chama
 * `OrderPort.create` (`Pagamento.tsx`) é responsável por calcular esses
 * valores com a MESMA fórmula usada no Checkout (`computeCheckoutTotals`,
 * Story 6.2) + `taxa_keepit_reais` (nunca exibida ao cliente — Story 6.2
 * AC3), garantindo paridade com o que o Checkout já mostrou antes de
 * "Pagar" (nenhum valor novo inventado nesta camada).
 */
export interface CreatePedidoInput {
  cliente_id: string;
  estabelecimento_id: string;
  hub_id: string;
  itens: CreatePedidoItemInput[];
  forma_pagamento: FormaPagamento;
  subtotal_produtos_reais: number;
  taxa_deslocamento_reais: number;
  /** 12%→10% de `subtotal_produtos_reais` (`businessConfig.taxaKeepitPercent`) — cobrada do LOJISTA, nunca exibida ao cliente. */
  taxa_keepit_reais: number;
  /** Taxa fixa do comprador (`businessConfig.taxaServicoCompradorReais`, hoje R$ 2,90, provisória). */
  taxa_servico_comprador_reais: number;
  total_pago_reais: number;
  nf_solicitada: boolean;
}

/**
 * Erro tipado de transição de status inválida (Story 1.10, Task 1) —
 * promovido do padrão já validado em `apps/lojista/src/screens/pedidos/lojistaOrders.mock.ts`
 * (Story 0.10). Usado por toda transição de `OrderPort` que exige um status
 * de origem específico (lado lojista e lado cliente).
 */
export class OrderTransitionError extends Error {
  constructor(action: string, fromStatus: PedidoStatus, allowed: PedidoStatus[]) {
    super(
      `[core-data] Ação "${action}" não permitida a partir do status "${fromStatus}" (esperado: ${allowed.join(', ')}).`,
    );
    this.name = 'OrderTransitionError';
  }
}

/**
 * Status alcançáveis via `OrderPort.advanceStatus` (Story 1.10, Task 2) — os
 * 3 estados intermediários que, até a Story 1.9, só existiam via o
 * `OrderStatusOverrideContext` local do app Cliente (`apps/cliente`).
 */
export type AdvanceableStatus = Extract<PedidoStatus, 'em_preparo' | 'saindo_hub' | 'no_hub'>;

/**
 * Story 6.15 (AC3, AC4, AC8) — [IDS] CREATE, mesmo padrão de erro tipado
 * domínio-level já usado por `OrderTransitionError` acima (não vive em
 * `order-errors.ts` porque não é um erro NOMEADO exclusivo da RPC real —
 * `confirmar_pin_pedido` devolve o desfecho `'pin_incorreto'` como LINHA DE
 * RESULTADO, não `RAISE`, e `order.mock.ts#confirmPin` precisa lançar o
 * MESMO tipo para que `OrdersContext`/`DigitarPin.tsx` (lado lojista)
 * diferenciem a mensagem de forma idêntica em `DATA_SOURCE=mock` e
 * `DATA_SOURCE=supabase`). Carrega `tentativasRestantes` (derivado da RPC
 * ou do contador local do mock) — nunca o PIN digitado nem o `pin_hash`.
 */
export class PinIncorretoError extends Error {
  constructor(public readonly tentativasRestantes: number) {
    super(`[core-data] confirmPin — PIN incorreto (tentativas restantes: ${tentativasRestantes}).`);
    this.name = 'PinIncorretoError';
  }
}

/**
 * Story 6.15 (AC3, AC4, AC5, AC8) — par de `PinIncorretoError` acima, mesmo
 * racional (tipo de domínio compartilhado entre mock e adapter real).
 * Carrega `bloqueadoAte` (ISO timestamp) para a UI derivar o tempo restante
 * de bloqueio (AC5) — nunca o PIN digitado nem o `pin_hash`.
 */
export class PinBloqueadoError extends Error {
  constructor(public readonly bloqueadoAte: string) {
    super(`[core-data] confirmPin — PIN bloqueado até ${bloqueadoAte}.`);
    this.name = 'PinBloqueadoError';
  }
}

export interface OrderPort {
  create(input: CreatePedidoInput, options?: AsyncCallOptions): Promise<Pedido>;
  listMine(clienteId: string, options?: AsyncCallOptions): Promise<Pedido[]>;
  /** Resolve um único pedido por id — Story 1.10 (Task 2), usado pelas telas de detalhe do Cliente. */
  getById(pedidoId: string, options?: AsyncCallOptions): Promise<Pedido | null>;
  accept(pedidoId: string, tempoEstimadoMin: number, options?: AsyncCallOptions): Promise<Pedido>;
  refuse(pedidoId: string, motivo: string, options?: AsyncCallOptions): Promise<Pedido>;
  /**
   * Valida o PIN informado pelo lojista. Usa `businessConfig.pinTentativasMax` /
   * `businessConfig.pinBloqueioMin` — nunca hard-coded.
   * [Source: docs/PERGUNTAS_REGRAS_NEGOCIO.md — Rodada 6, "PIN — tentativas do lojista"]
   */
  confirmPin(pedidoId: string, pin: string, options?: AsyncCallOptions): Promise<Pedido>;
  /**
   * Cancelamento pelo Cliente. A % de reembolso (AC9) é derivada do status
   * ATUAL do pedido no momento da chamada (pré-aceite = 100%; pós-aceite,
   * antes de "Saindo para o hub" = 90/10) — rejeita com `OrderTransitionError`
   * se o pedido já passou de "Saindo para o hub" (matriz: "Não pode
   * cancelar"). [Source: docs/PERGUNTAS_REGRAS_NEGOCIO.md#Rodada 2]
   */
  cancel(pedidoId: string, motivo: string, options?: AsyncCallOptions): Promise<Pedido>;

  // ---------------------------------------------------------------------
  // Lado lojista (Story 1.10, Task 1 — promovido de
  // `apps/lojista/src/screens/pedidos/lojistaOrders.mock.ts`, Story 0.10)
  // ---------------------------------------------------------------------

  /** Pedidos de um estabelecimento — usado pelo `OrdersContext` do app Lojista. */
  listByEstabelecimento(estabelecimentoId: string, options?: AsyncCallOptions): Promise<Pedido[]>;
  /** `aceito`/`em_preparo` → `saindo_hub` (preenche `saiu_hub_em`). */
  markReadyForHub(pedidoId: string, options?: AsyncCallOptions): Promise<Pedido>;
  /** `saindo_hub` → `no_hub` (preenche `lojista_chegou_em`). */
  markArrivedAtHub(pedidoId: string, options?: AsyncCallOptions): Promise<Pedido>;
  /** `no_hub` → `nao_retirado` (preenche `motivo_nao_retirado`; popula `reembolsos` 20/80 — AC9). */
  markCustomerNoShow(pedidoId: string, motivo: string, options?: AsyncCallOptions): Promise<Pedido>;

  // ---------------------------------------------------------------------
  // Lado cliente (Story 1.10, Task 2 — promovido de
  // `apps/cliente/src/context/OrderStatusOverrideContext.tsx`, Story 0.7)
  // ---------------------------------------------------------------------

  /**
   * [AUTO-DECISION] Avanço genérico do pedido pelos 3 status intermediários
   * (`em_preparo`/`saindo_hub`/`no_hub`) — usado exclusivamente pelo botão
   * dev `OrderStatusDevAdvancer` (ferramenta de teste/demo, não uma ação real
   * de negócio). Escolhido método genérico (em vez de 3 métodos nomeados,
   * como no lado lojista) porque esta é uma ferramenta de avanço arbitrário
   * de estado para QA/demo, não uma transição de negócio com regras
   * específicas por etapa — um único método com validação de adjacência
   * (`allowedTransitions`) é suficiente e evita 3 métodos "dev-only" na port.
   */
  advanceStatus(pedidoId: string, nextStatus: AdvanceableStatus, options?: AsyncCallOptions): Promise<Pedido>;
  /** Marca `cliente_chegou_em` — metade do cliente na "janela de tolerância no hub". Exige status `no_hub`. */
  markClienteChegou(pedidoId: string, options?: AsyncCallOptions): Promise<Pedido>;
}
