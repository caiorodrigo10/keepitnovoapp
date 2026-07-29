import { businessConfig } from '@keepit/config';

import type {
  AdvanceableStatus,
  CreatePedidoInput,
  OrderPort,
  Pedido,
  PedidoItem,
  PedidoStatus,
} from '../ports/order.port';
import { OrderTransitionError } from '../ports/order.port';
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
    create(input: CreatePedidoInput, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => {
          const estabelecimento = db.estabelecimentos.find((e) => e.id === input.estabelecimento_id);
          if (!estabelecimento) {
            throw new Error(`[mock] Estabelecimento não encontrado: ${input.estabelecimento_id}`);
          }

          const pedidoId = generateMockId('pedido');
          const itens: PedidoItem[] = input.itens.map((item, index) => {
            const produto = db.produtos.find((p) => p.id === item.produto_id);
            if (!produto) {
              throw new Error(`[mock] Produto não encontrado: ${item.produto_id}`);
            }
            const subtotal = roundReais(produto.preco_reais * item.quantidade);
            return {
              id: `${pedidoId}-item-${index + 1}`,
              pedido_id: pedidoId,
              produto_id: produto.id,
              nome_snapshot: produto.nome,
              preco_unitario_reais: produto.preco_reais,
              quantidade: item.quantidade,
              subtotal_reais: subtotal,
            };
          });

          const subtotalProdutos = roundReais(itens.reduce((sum, item) => sum + item.subtotal_reais, 0));
          // Taxa Keepit incide sobre subtotal_produtos_reais, NUNCA sobre a taxa de deslocamento.
          const taxaKeepit = roundReais((subtotalProdutos * businessConfig.taxaKeepitPercent) / 100);
          const taxaDeslocamento = estabelecimento.taxa_deslocamento_reais;
          const totalPago = roundReais(subtotalProdutos + taxaDeslocamento);

          const pedido: Pedido = {
            id: pedidoId,
            numero: db.pedidos.length + 1,
            cliente_id: input.cliente_id,
            estabelecimento_id: input.estabelecimento_id,
            hub_id: input.hub_id,
            status: 'aguardando_pagamento',
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
            subtotal_produtos_reais: subtotalProdutos,
            taxa_deslocamento_reais: taxaDeslocamento,
            taxa_keepit_reais: taxaKeepit,
            total_pago_reais: totalPago,
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

    accept(pedidoId: string, tempoEstimadoMin: number, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => {
          const pedido = findOrThrow(pedidoId);
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

    confirmPin(pedidoId: string, pin: string, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => {
          const pedido = findOrThrow(pedidoId);

          if (pedido.pin_bloqueado_ate && new Date(pedido.pin_bloqueado_ate) > new Date()) {
            throw new Error('[mock] PIN bloqueado — aguarde o desbloqueio automático');
          }

          if (pin !== pedido.pin_texto) {
            pedido.tentativas_pin += 1;
            if (pedido.tentativas_pin >= businessConfig.pinTentativasMax) {
              pedido.pin_bloqueado_ate = new Date(
                Date.now() + businessConfig.pinBloqueioMin * 60 * 1000,
              ).toISOString();
            }
            throw new Error('[mock] PIN incorreto');
          }

          pedido.status = 'entregue';
          pedido.entregue_em = new Date().toISOString();
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
