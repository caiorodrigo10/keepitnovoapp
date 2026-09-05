import { businessConfig } from '@keepit/config';

import type {
  AdvanceableStatus,
  CreatePedidoInput,
  OrderChangeEvent,
  OrderPort,
  Pedido,
  PedidoItem,
  PedidoStatus,
} from '../ports/order.port';
import { OrderTransitionError, PinBloqueadoError, PinIncorretoError } from '../ports/order.port';
import type { AsyncCallOptions } from '../types';
import { generateMockId, generatePin, simulateAsync } from './async-helpers';
import type { MockDb } from './db';
import { registrarFalha } from './falha-helpers';
import { reconcileAutomaticOrder, type OrderAutoTransition } from './order-auto-progress';
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
  let reconciliationQueue: Promise<void> = Promise.resolve();

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

  function emitChange(event: OrderChangeEvent): void {
    db.clienteOrderChangeListeners.forEach((listener) => listener(event));
  }

  async function persistMutation(persist: () => Promise<boolean>, pedido: Pedido): Promise<void> {
    await persist();
    emitChange({ clienteId: pedido.cliente_id, pedidoId: pedido.id, reason: 'mutation' });
  }

  function automationAnchorNow(): { enteredStatusAt: string } {
    return {
      enteredStatusAt: new Date(Date.now() + db.clienteQaState.clockOffsetMs).toISOString(),
    };
  }

  function reanchorAutomation(pedido: Pedido): void {
    if (db.clienteQaState.orderProgressionDelaysMs !== null) {
      db.clienteOrderAutomation[pedido.id] = automationAnchorNow();
    }
  }

  function stopAutomation(pedidoId: string): void {
    delete db.clienteOrderAutomation[pedidoId];
  }

  function applyAutomaticTransition(
    pedido: Pedido,
    transition: OrderAutoTransition,
    reconciledPedido: Pedido,
  ): Pedido {
    const nextPedido = { ...pedido, status: transition.to };

    if (transition.to === 'aceito') {
      nextPedido.aceito_em = transition.occurredAt;
      nextPedido.tempo_estimado_min = reconciledPedido.tempo_estimado_min;
    } else if (transition.to === 'saindo_hub') {
      nextPedido.saiu_hub_em = transition.occurredAt;
    } else if (transition.to === 'no_hub') {
      nextPedido.lojista_chegou_em = transition.occurredAt;
    }

    return nextPedido;
  }

  async function runEligibleOrderReconciliation(): Promise<void> {
    await db.runClienteMutation(async (persist) => {
      const nowMs = Date.now() + db.clienteQaState.clockOffsetMs;

      for (const [pedidoId, runtime] of Object.entries(db.clienteOrderAutomation)) {
        const pedidoIndex = db.pedidos.findIndex((pedido) => pedido.id === pedidoId);
        if (pedidoIndex < 0) continue;

        const reconciled = reconcileAutomaticOrder(
          db.pedidos[pedidoIndex]!,
          runtime,
          db.clienteQaState,
          nowMs,
        );
        if (reconciled.transitions.length === 0) continue;

        let currentPedido = db.pedidos[pedidoIndex]!;
        for (const transition of reconciled.transitions) {
          currentPedido = applyAutomaticTransition(currentPedido, transition, reconciled.pedido);
          db.pedidos[pedidoIndex] = currentPedido;
          if (transition.to === 'no_hub') {
            stopAutomation(pedidoId);
          } else {
            db.clienteOrderAutomation[pedidoId] = { enteredStatusAt: transition.occurredAt };
          }
          await persist();
          emitChange({
            clienteId: currentPedido.cliente_id,
            pedidoId,
            reason: 'auto-progress',
          });
        }
      }
    });
  }

  function reconcileEligibleOrders(): Promise<void> {
    const reconciliation = reconciliationQueue.then(() => runEligibleOrderReconciliation());
    reconciliationQueue = reconciliation.catch(() => undefined);
    return reconciliation;
  }

  return {
    subscribeChanges(listener): () => void {
      db.clienteOrderChangeListeners.add(listener);
      return () => {
        db.clienteOrderChangeListeners.delete(listener);
      };
    },

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
     * **AC6 (Story 6.6) — decisão registrada:** o status inicial passou de
     * `'aguardando_pagamento'` para `'aguardando_aceite'`, alinhando ao
     * comportamento do piloto real (RPC sempre cria em `aguardando_aceite`
     * — pagamento simulado em dev, sem estado intermediário). Corrige o gap
     * pré-existente descrito no Data Mode da Story 6.6: antes daquela
     * mudança, um pedido mock recém-criado não aparecia como "Novo" na tela
     * `NovosPedidos` do Lojista (`isNovo` só é `true` para
     * `aguardando_aceite`). Ver Change Log da Story 6.6 para o racional
     * completo.
     *
     * **AC5/AC6 (Story 6.7.1) — REVERTIDO:** o status inicial volta a ser
     * `'aguardando_pagamento'`. A Story 6.7.1 introduz o método
     * `confirmarPagamento` (chamado automaticamente pelas novas telas de
     * PIX/processando, ~5s/~2s de simulação de UX) que agora faz a
     * transição `aguardando_pagamento` → `aguardando_aceite` — o pedido
     * volta a aparecer como "Novo" na tela `NovosPedidos` do Lojista
     * poucos segundos depois, mesma janela de latência que já existia
     * (`DEFAULT_MOCK_DELAY_MS`), sem regressão perceptível.
     */
    create(input: CreatePedidoInput, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => db.runClienteMutation(async (persist) => {
          const estabelecimento = db.estabelecimentos.find((e) => e.id === input.estabelecimento_id);
          if (!estabelecimento) {
            throw new Error(`[mock] Estabelecimento não encontrado: ${input.estabelecimento_id}`);
          }

          // Story 8.5 (AC4) — paridade mock↔real: cliente bloqueado pelo admin
          // (`admin.blockCliente`) não cria novos pedidos. Checado ANTES de
          // qualquer efeito colateral (PIN, push em `db.pedidos`) — mesmo
          // padrão de guarda-antes-de-mutar da RPC real
          // (`20260813070003_rpc_criar_pedido_bloqueio_cliente.sql`). Erro
          // genérico `[mock]`, mesmo estilo de "Estabelecimento não
          // encontrado" acima — a classe dedicada `ClienteBloqueadoError`
          // fica no adapter Supabase (`order-errors.ts`), não neste mock.
          const cliente = db.clientes.find((c) => c.id === input.cliente_id);
          if (cliente?.bloqueado) {
            throw new Error('[mock] Cliente bloqueado pelo admin não pode criar pedidos (CLIENTE_BLOQUEADO)');
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
          await persistMutation(persist, pedido);
          return pedido;
        }),
        {} as Pedido,
        options,
      );
    },

    listMine(clienteId: string, options?: AsyncCallOptions): Promise<Pedido[]> {
      return simulateAsync(
        async () => {
          await reconcileEligibleOrders();
          return db.pedidos.filter((p) => p.cliente_id === clienteId);
        },
        [],
        options,
      );
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
        () => db.runClienteMutation(async (persist) => {
          const pedido = findOrThrow(pedidoId);
          assertStatus(pedido, 'accept', ['aguardando_aceite']);
          pedido.status = 'aceito';
          pedido.tempo_estimado_min = tempoEstimadoMin;
          pedido.aceito_em = new Date().toISOString();
          reanchorAutomation(pedido);
          await persistMutation(persist, pedido);
          return pedido;
        }),
        {} as Pedido,
        options,
      );
    },

    /**
     * Story 6.11 (AC6) — [IDS] ADAPT: passa a usar `assertStatus`, mesmo
     * padrão já usado por `accept`/`markReadyForHub`/`markArrivedAtHub` neste
     * arquivo (reforço opcional/paridade com a RPC real `recusar_pedido`, que
     * só transiciona a partir de `aguardando_aceite` — mesmo tratamento dado
     * a esse gap pela Story 6.9 em `accept`).
     */
    refuse(pedidoId: string, motivo: string, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => db.runClienteMutation(async (persist) => {
          const pedido = findOrThrow(pedidoId);
          assertStatus(pedido, 'refuse', ['aguardando_aceite']);
          pedido.status = 'recusado';
          pedido.motivo_recusa = motivo;
          stopAutomation(pedido.id);
          registrarReembolso(db, pedido, 'recusa_lojista');
          await persistMutation(persist, pedido);
          return pedido;
        }),
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
        () => db.runClienteMutation(async (persist) => {
          const pedido = findOrThrow(pedidoId);
          assertStatus(pedido, 'confirmPin', ['no_hub']);

          if (pedido.pin_bloqueado_ate && new Date(pedido.pin_bloqueado_ate) > new Date()) {
            throw new PinBloqueadoError(pedido.pin_bloqueado_ate);
          }

          if (pin !== pedido.pin_texto) {
            pedido.tentativas_pin += 1;
            if (pedido.tentativas_pin >= businessConfig.pinTentativasMax) {
              const bloqueadoAte = new Date(Date.now() + businessConfig.pinBloqueioMin * 60 * 1000).toISOString();
              pedido.pin_bloqueado_ate = bloqueadoAte;
              pedido.tentativas_pin = 0;
              await persistMutation(persist, pedido);
              throw new PinBloqueadoError(bloqueadoAte);
            }
            await persistMutation(persist, pedido);
            throw new PinIncorretoError(businessConfig.pinTentativasMax - pedido.tentativas_pin);
          }

          pedido.status = 'entregue';
          pedido.entregue_em = new Date().toISOString();
          pedido.tentativas_pin = 0;
          pedido.pin_bloqueado_ate = null;
          stopAutomation(pedido.id);
          await persistMutation(persist, pedido);
          return pedido;
        }),
        {} as Pedido,
        options,
      );
    },

    /**
     * Story 6.7.1 (AC1, AC2, AC3, AC4, AC8) — [IDS] ADAPT: mesmo padrão
     * `assertStatus`/`OrderTransitionError` já usado por
     * `accept`/`markReadyForHub`/`markArrivedAtHub` neste arquivo. Chamado
     * automaticamente por `ModalPagamentoPix`/`ModalProcessandoPagamento`
     * (`apps/cliente`) após um atraso simulado de UX — nunca uma regra de
     * negócio nova. Não altera `aceito_em` (quem seta esse campo continua
     * sendo `accept`, Story 6.9) — `confirmarPagamento` só confirma que o
     * PAGAMENTO foi recebido, não que a loja aceitou o pedido.
     */
    confirmarPagamento(pedidoId: string, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => db.runClienteMutation(async (persist) => {
          const pedido = findOrThrow(pedidoId);
          assertStatus(pedido, 'confirmarPagamento', ['aguardando_pagamento']);
          pedido.status = 'aguardando_aceite';
          reanchorAutomation(pedido);
          await persistMutation(persist, pedido);
          return pedido;
        }),
        {} as Pedido,
        options,
      );
    },

    cancel(pedidoId: string, motivo: string, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => db.runClienteMutation(async (persist) => {
          const pedido = findOrThrow(pedidoId);

          if (pedido.status === 'aguardando_pagamento' || pedido.status === 'aguardando_aceite') {
            pedido.status = 'cancelado';
            pedido.motivo_cancelamento = motivo;
            pedido.cancelado_em = new Date().toISOString();
            stopAutomation(pedido.id);
            registrarReembolso(db, pedido, 'cancelamento_cliente_pre_aceite');
            await persistMutation(persist, pedido);
            return pedido;
          }

          if (pedido.status === 'aceito' || pedido.status === 'em_preparo') {
            pedido.status = 'cancelado';
            pedido.motivo_cancelamento = motivo;
            pedido.cancelado_em = new Date().toISOString();
            stopAutomation(pedido.id);
            registrarReembolso(db, pedido, 'cancelamento_cliente_pos_aceite');
            await persistMutation(persist, pedido);
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
        }),
        {} as Pedido,
        options,
      );
    },

    // -----------------------------------------------------------------
    // Lado lojista (Story 1.10, Task 1)
    // -----------------------------------------------------------------

    getById(pedidoId: string, options?: AsyncCallOptions): Promise<Pedido | null> {
      return simulateAsync(
        async () => {
          await reconcileEligibleOrders();
          return db.pedidos.find((p) => p.id === pedidoId) ?? null;
        },
        null,
        options,
      );
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
        () => db.runClienteMutation(async (persist) => {
          const pedido = findOrThrow(pedidoId);
          assertStatus(pedido, 'markReadyForHub', ['aceito', 'em_preparo']);
          pedido.status = 'saindo_hub';
          pedido.saiu_hub_em = new Date().toISOString();
          reanchorAutomation(pedido);
          await persistMutation(persist, pedido);
          return pedido;
        }),
        {} as Pedido,
        options,
      );
    },

    markArrivedAtHub(pedidoId: string, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => db.runClienteMutation(async (persist) => {
          const pedido = findOrThrow(pedidoId);
          assertStatus(pedido, 'markArrivedAtHub', ['saindo_hub']);
          pedido.status = 'no_hub';
          pedido.lojista_chegou_em = new Date().toISOString();
          stopAutomation(pedido.id);
          await persistMutation(persist, pedido);
          return pedido;
        }),
        {} as Pedido,
        options,
      );
    },

    markCustomerNoShow(pedidoId: string, motivo: string, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => db.runClienteMutation(async (persist) => {
          const pedido = findOrThrow(pedidoId);
          assertStatus(pedido, 'markCustomerNoShow', ['no_hub']);
          pedido.status = 'nao_retirado';
          pedido.motivo_nao_retirado = motivo;
          stopAutomation(pedido.id);
          registrarReembolso(db, pedido, 'nao_retirado_cliente');
          await persistMutation(persist, pedido);
          return pedido;
        }),
        {} as Pedido,
        options,
      );
    },

    // -----------------------------------------------------------------
    // Lado cliente (Story 1.10, Task 2)
    // -----------------------------------------------------------------

    advanceStatus(pedidoId: string, nextStatus: AdvanceableStatus, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => db.runClienteMutation(async (persist) => {
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
          if (nextStatus === 'no_hub') {
            stopAutomation(pedido.id);
          } else {
            reanchorAutomation(pedido);
          }
          await persistMutation(persist, pedido);
          return pedido;
        }),
        {} as Pedido,
        options,
      );
    },

    markClienteChegou(pedidoId: string, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => db.runClienteMutation(async (persist) => {
          const pedido = findOrThrow(pedidoId);
          assertStatus(pedido, 'markClienteChegou', ['no_hub']);
          pedido.cliente_chegou_em = new Date().toISOString();
          stopAutomation(pedido.id);
          await persistMutation(persist, pedido);
          return pedido;
        }),
        {} as Pedido,
        options,
      );
    },

    /**
     * Story 6.20 (AC2, AC4) — mesma lógica que a RPC real
     * `reportar_lojista_nao_veio` reforça server-side: status `no_hub` +
     * `cliente_chegou_em` preenchido (via `assertStatus`/checagem explícita) e
     * o tempo mínimo (`max(tempo_estimado_min, businessConfig.esperaLojistaMaxMin)`)
     * já vencido — nunca confia só na UI ter escondido/mostrado o botão.
     * Efeitos: `registrarReembolso(..., 'nao_entregue_lojista')` (já suporta
     * esse motivo, 100% ao cliente) + `registrarFalha(...,
     * 'lojista_nao_apareceu')` (novo helper, mesmo padrão de
     * `refund-helpers.ts`).
     */
    reportLojistaNaoVeio(pedidoId: string, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => db.runClienteMutation(async (persist) => {
          const pedido = findOrThrow(pedidoId);
          assertStatus(pedido, 'reportLojistaNaoVeio', ['no_hub']);

          if (!pedido.cliente_chegou_em) {
            throw new Error(
              '[mock] reportLojistaNaoVeio — pedido sem cliente_chegou_em registrado (ESTADO_INVALIDO)',
            );
          }

          const esperaMin = Math.max(pedido.tempo_estimado_min ?? 0, businessConfig.esperaLojistaMaxMin);
          const limiteMs = new Date(pedido.cliente_chegou_em).getTime() + esperaMin * 60_000;
          if (Date.now() <= limiteMs) {
            throw new Error(
              '[mock] reportLojistaNaoVeio — tempo mínimo de espera pelo lojista ainda não atingido (TEMPO_MINIMO_NAO_ATINGIDO)',
            );
          }

          pedido.status = 'nao_entregue_lojista';
          stopAutomation(pedido.id);
          registrarReembolso(db, pedido, 'nao_entregue_lojista');
          registrarFalha(
            db,
            pedido,
            'lojista_nao_apareceu',
            `Pedido #${pedido.numero} — lojista não compareceu ao hub dentro do prazo.`,
          );
          await persistMutation(persist, pedido);
          return pedido;
        }),
        {} as Pedido,
        options,
      );
    },

    /**
     * Story 6.21 (AC2, AC3) — mesma lógica que a RPC real
     * `cancelar_pedido_atraso` reforça server-side: status
     * `aceito`/`em_preparo` (via `assertStatus`) e o atraso (`NOW() >
     * aceito_em + 2 * tempo_estimado_min`) já confirmado — nunca confia só no
     * client ter mostrado o prompt. Efeitos:
     * `registrarReembolso(..., 'cancelamento_atraso')` (já suporta esse
     * motivo, 100% ao cliente via `businessConfig.lojistaNaoVeioPercent`) +
     * `registrarFalha(..., 'atraso_grave')`.
     */
    cancelPedidoAtraso(pedidoId: string, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => db.runClienteMutation(async (persist) => {
          const pedido = findOrThrow(pedidoId);
          assertStatus(pedido, 'cancelPedidoAtraso', ['aceito', 'em_preparo']);

          if (!pedido.aceito_em || !pedido.tempo_estimado_min) {
            throw new Error(
              '[mock] cancelPedidoAtraso — pedido sem aceito_em/tempo_estimado_min para calcular o atraso (ATRASO_NAO_CONFIRMADO)',
            );
          }

          const limiteMs = new Date(pedido.aceito_em).getTime() + 2 * pedido.tempo_estimado_min * 60_000;
          if (Date.now() <= limiteMs) {
            throw new Error(
              '[mock] cancelPedidoAtraso — atraso (2x tempo_estimado_min) ainda não confirmado (ATRASO_NAO_CONFIRMADO)',
            );
          }

          pedido.status = 'cancelado_atraso';
          pedido.cancelado_em = new Date().toISOString();
          stopAutomation(pedido.id);
          registrarReembolso(db, pedido, 'cancelamento_atraso');
          registrarFalha(
            db,
            pedido,
            'atraso_grave',
            `Pedido #${pedido.numero} — cancelado pelo cliente por atraso além de 2x o tempo estimado.`,
          );
          await persistMutation(persist, pedido);
          return pedido;
        }),
        {} as Pedido,
        options,
      );
    },
  };
}
