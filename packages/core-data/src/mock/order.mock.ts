import { businessConfig } from '@keepit/config';

import type {
  AdvanceableStatus,
  CreatePedidoInput,
  OrderPort,
  Pedido,
  PedidoItem,
  PedidoStatus,
} from '../ports/order.port';
import { OrderTransitionError, PinBloqueadoError, PinIncorretoError } from '../ports/order.port';
import type { AsyncCallOptions } from '../types';
import { generateMockId, generatePin, simulateAsync } from './async-helpers';
import type { MockDb } from './db';
import { registrarReembolso } from './refund-helpers';

function roundReais(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Status de origem válidos por próximo status alcançável via `advanceStatus` (Task 2). */
const ADVANCE_ALLOWED_FROM: Record<AdvanceableStatus, PedidoStatus[]> = {
  em_preparo: ['aceito'],
  saindo_hub: ['em_preparo', 'aceito'],
  no_hub: ['saindo_hub'],
};

export function createOrderMock(db: MockDb): OrderPort {
  function findOrThrow(pedidoId: string): Pedido {
    const pedido = db.pedidos.find((p) => p.id === pedidoId);
    if (!pedido) {
      throw new Error(`[mock] Pedido não encontrado: ${pedidoId}`);
    }
    return pedido;
  }

  function assertStatus(pedido: Pedido, action: string, allowed: PedidoStatus[]): void {
    if (!allowed.includes(pedido.status)) {
      throw new OrderTransitionError(action, pedido.status, allowed);
    }
  }

  return {
    /**
     * Story 6.6 (AC1, AC4, AC6) — [IDS] ADAPT. `CreatePedidoInput` agora
     * carrega o snapshot dos itens (`nome_snapshot`/`preco_unitario_reais`)
     * e os 5 totais de cabeçalho já calculados por quem chama (mesma
     * fórmula do Checkout, Story 6.2). Este mock deixou de RE-DERIVAR esses
     * valores a partir de `db.produtos`/`db.estabelecimentos` — passou a
     * CONGELAR/PERSISTIR exatamente o que recebe, mesmo comportamento da
     * RPC real `criar_pedido` (`20260813004934_rpc_criar_pedido.sql`, "os
     * totais de cabeçalho são recebidos como parâmetros e persistidos como
     * snapshot — a RPC não os recalcula"). Isso é a paridade mock↔real
     * exigida pela AC7: os dois adapters têm o MESMO contrato (pass-through
     * do snapshot), não duas implementações divergentes da mesma fórmula.
     *
     * **AC6 — decisão registrada:** o status inicial passa de
     * `'aguardando_pagamento'` para `'aguardando_aceite'`, alinhando ao
     * comportamento do piloto real (RPC sempre cria em `aguardando_aceite`
     * — pagamento simulado em dev, sem estado intermediário). Corrige o gap
     * pré-existente descrito no Data Mode da Story 6.6: antes desta
     * mudança, um pedido mock recém-criado não aparecia como "Novo" na tela
     * `NovosPedidos` do Lojista (`isNovo` só é `true` para
     * `aguardando_aceite`). Ver Change Log da Story 6.6 para o racional
     * completo.
     */
    create(input: CreatePedidoInput, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => {
          const estabelecimento = db.estabelecimentos.find((e) => e.id === input.estabelecimento_id);
          if (!estabelecimento) {
            throw new Error(`[mock] Estabelecimento não encontrado: ${input.estabelecimento_id}`);
          }

          const pedidoId = generateMockId('pedido');
          const itens: PedidoItem[] = input.itens.map((item, index) => ({
            id: `${pedidoId}-item-${index + 1}`,
            pedido_id: pedidoId,
            produto_id: item.produto_id,
            nome_snapshot: item.nome_snapshot,
            preco_unitario_reais: item.preco_unitario_reais,
            quantidade: item.quantidade,
            subtotal_reais: roundReais(item.preco_unitario_reais * item.quantidade),
          }));

          const pedido: Pedido = {
            id: pedidoId,
            numero: db.pedidos.length + 1,
            cliente_id: input.cliente_id,
            estabelecimento_id: input.estabelecimento_id,
            hub_id: input.hub_id,
            status: 'aguardando_aceite',
            pin_texto: generatePin(),
            tentativas_pin: 0,
            pin_bloqueado_ate: null,
            tempo_estimado_min: null,
            criado_em: new Date().toISOString(),
            aceito_em: null,
            saiu_hub_em: null,
            cliente_chegou_em: null,
            lojista_chegou_em: null,
            entregue_em: null,
            cancelado_em: null,
            subtotal_produtos_reais: roundReais(input.subtotal_produtos_reais),
            taxa_deslocamento_reais: roundReais(input.taxa_deslocamento_reais),
            taxa_keepit_reais: roundReais(input.taxa_keepit_reais),
            taxa_servico_comprador_reais: roundReais(input.taxa_servico_comprador_reais),
            total_pago_reais: roundReais(input.total_pago_reais),
            motivo_recusa: null,
            motivo_cancelamento: null,
            motivo_nao_retirado: null,
            forma_pagamento: input.forma_pagamento,
            itens,
          };

          db.pedidos.push(pedido);
          return pedido;
        },
        {} as Pedido,
        options,
      );
    },

    listMine(clienteId: string, options?: AsyncCallOptions): Promise<Pedido[]> {
      return simulateAsync(() => db.pedidos.filter((p) => p.cliente_id === clienteId), [], options);
    },

    /**
     * Story 6.9 — [IDS] ADAPT: passa a usar `assertStatus`, mesmo padrão já
     * usado por `refuse`/`markReadyForHub`/`markArrivedAtHub` no próprio
     * arquivo (gap pré-existente documentado no Dev Notes da Story 6.9).
     * Paridade com a RPC real `aceitar_pedido`, que só transiciona a partir
     * de `aguardando_aceite` (proteção contra dupla-aceitação).
     */
    accept(pedidoId: string, tempoEstimadoMin: number, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => {
          const pedido = findOrThrow(pedidoId);
          assertStatus(pedido, 'accept', ['aguardando_aceite']);
          pedido.status = 'aceito';
          pedido.tempo_estimado_min = tempoEstimadoMin;
          pedido.aceito_em = new Date().toISOString();
          return pedido;
        },
        {} as Pedido,
        options,
      );
    },

    refuse(pedidoId: string, motivo: string, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => {
          const pedido = findOrThrow(pedidoId);
          pedido.status = 'recusado';
          pedido.motivo_recusa = motivo;
          registrarReembolso(db, pedido, 'recusa_lojista');
          return pedido;
        },
        {} as Pedido,
        options,
      );
    },

    /**
     * Story 6.15 (AC3, AC4, AC5, AC8) — [IDS] ADAPT: passa a lançar
     * `PinIncorretoError`/`PinBloqueadoError` (tipos de domínio,
     * `order.port.ts`) em vez de `Error` genérico, para que
     * `OrdersContext.confirmPin` (lado lojista) diferencie "PIN incorreto"
     * de "bloqueado" da MESMA forma em `DATA_SOURCE=mock` e
     * `DATA_SOURCE=supabase` (paridade de tipo com `order.supabase.ts`).
     * No 5º erro, zera `tentativas_pin` ao gravar o bloqueio — mesmo
     * comportamento da RPC real `confirmar_pin_pedido` (a janela reinicia
     * na próxima tentativa, ver header da migration
     * `20260813022932_rpc_confirmar_pin_pedido.sql`, "LOCKOUT / RESET").
     */
    confirmPin(pedidoId: string, pin: string, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => {
          const pedido = findOrThrow(pedidoId);

          if (pedido.pin_bloqueado_ate && new Date(pedido.pin_bloqueado_ate) > new Date()) {
            throw new PinBloqueadoError(pedido.pin_bloqueado_ate);
          }

          if (pin !== pedido.pin_texto) {
            pedido.tentativas_pin += 1;
            if (pedido.tentativas_pin >= businessConfig.pinTentativasMax) {
              const bloqueadoAte = new Date(Date.now() + businessConfig.pinBloqueioMin * 60 * 1000).toISOString();
              pedido.pin_bloqueado_ate = bloqueadoAte;
              pedido.tentativas_pin = 0;
              throw new PinBloqueadoError(bloqueadoAte);
            }
            throw new PinIncorretoError(businessConfig.pinTentativasMax - pedido.tentativas_pin);
          }

          pedido.status = 'entregue';
          pedido.entregue_em = new Date().toISOString();
          pedido.tentativas_pin = 0;
          pedido.pin_bloqueado_ate = null;
          return pedido;
        },
        {} as Pedido,
        options,
      );
    },

    cancel(pedidoId: string, motivo: string, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => {
          const pedido = findOrThrow(pedidoId);

          if (pedido.status === 'aguardando_pagamento' || pedido.status === 'aguardando_aceite') {
            pedido.status = 'cancelado';
            pedido.motivo_cancelamento = motivo;
            pedido.cancelado_em = new Date().toISOString();
            registrarReembolso(db, pedido, 'cancelamento_cliente_pre_aceite');
            return pedido;
          }

          if (pedido.status === 'aceito' || pedido.status === 'em_preparo') {
            pedido.status = 'cancelado';
            pedido.motivo_cancelamento = motivo;
            pedido.cancelado_em = new Date().toISOString();
            registrarReembolso(db, pedido, 'cancelamento_cliente_pos_aceite');
            return pedido;
          }

          // Matriz de cancelamento (AC9): a partir de "Saindo para o hub", o
          // Cliente não pode mais cancelar. [Source: docs/PERGUNTAS_REGRAS_NEGOCIO.md#Rodada 2]
          throw new OrderTransitionError('cancel', pedido.status, [
            'aguardando_pagamento',
            'aguardando_aceite',
            'aceito',
            'em_preparo',
          ]);
        },
        {} as Pedido,
        options,
      );
    },

    // -----------------------------------------------------------------
    // Lado lojista (Story 1.10, Task 1)
    // -----------------------------------------------------------------

    getById(pedidoId: string, options?: AsyncCallOptions): Promise<Pedido | null> {
      return simulateAsync(() => db.pedidos.find((p) => p.id === pedidoId) ?? null, null, options);
    },

    listByEstabelecimento(estabelecimentoId: string, options?: AsyncCallOptions): Promise<Pedido[]> {
      return simulateAsync(
        () => db.pedidos.filter((p) => p.estabelecimento_id === estabelecimentoId),
        [],
        options,
      );
    },

    markReadyForHub(pedidoId: string, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => {
          const pedido = findOrThrow(pedidoId);
          assertStatus(pedido, 'markReadyForHub', ['aceito', 'em_preparo']);
          pedido.status = 'saindo_hub';
          pedido.saiu_hub_em = new Date().toISOString();
          return pedido;
        },
        {} as Pedido,
        options,
      );
    },

    markArrivedAtHub(pedidoId: string, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => {
          const pedido = findOrThrow(pedidoId);
          assertStatus(pedido, 'markArrivedAtHub', ['saindo_hub']);
          pedido.status = 'no_hub';
          pedido.lojista_chegou_em = new Date().toISOString();
          return pedido;
        },
        {} as Pedido,
        options,
      );
    },

    markCustomerNoShow(pedidoId: string, motivo: string, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => {
          const pedido = findOrThrow(pedidoId);
          assertStatus(pedido, 'markCustomerNoShow', ['no_hub']);
          pedido.status = 'nao_retirado';
          pedido.motivo_nao_retirado = motivo;
          registrarReembolso(db, pedido, 'nao_retirado_cliente');
          return pedido;
        },
        {} as Pedido,
        options,
      );
    },

    // -----------------------------------------------------------------
    // Lado cliente (Story 1.10, Task 2)
    // -----------------------------------------------------------------

    advanceStatus(pedidoId: string, nextStatus: AdvanceableStatus, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => {
          const pedido = findOrThrow(pedidoId);
          const allowed = ADVANCE_ALLOWED_FROM[nextStatus];
          assertStatus(pedido, `advanceStatus->${nextStatus}`, allowed);
          pedido.status = nextStatus;
          if (nextStatus === 'saindo_hub') {
            pedido.saiu_hub_em = new Date().toISOString();
          }
          if (nextStatus === 'no_hub' && !pedido.lojista_chegou_em) {
            pedido.lojista_chegou_em = new Date().toISOString();
          }
          return pedido;
        },
        {} as Pedido,
        options,
      );
    },

    markClienteChegou(pedidoId: string, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => {
          const pedido = findOrThrow(pedidoId);
          assertStatus(pedido, 'markClienteChegou', ['no_hub']);
          pedido.cliente_chegou_em = new Date().toISOString();
          return pedido;
        },
        {} as Pedido,
        options,
      );
    },
  };
}
