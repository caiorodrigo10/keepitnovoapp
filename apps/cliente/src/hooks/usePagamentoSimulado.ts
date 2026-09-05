import { useCallback, useEffect, useRef, useState } from 'react';

import { getDataClient } from '@keepit/core-data';

import {
  CONFIRMADO_PAUSE_MS,
  startPagamentoSimulado,
  type PagamentoSimuladoController,
  type PagamentoSimuladoStatus,
} from '../lib/pagamentoSimulado';
import { invalidatePedidos } from '../lib/ordersResource';

export interface UsePagamentoSimuladoResult {
  status: PagamentoSimuladoStatus;
  /** Reagenda o fluxo do zero — usado pelo botão "Tentar novamente" (AC8). */
  retry: () => void;
}

/**
 * Story 6.7.1 (AC1, AC2, AC3, AC8) — [IDS] CREATE. Wrapper fino de React em
 * cima do motor puro `startPagamentoSimulado`
 * (`apps/cliente/src/lib/pagamentoSimulado.ts`) — mesmo padrão de
 * `usePedidosMine.ts`/`pedidoPolling.ts` (Story 6.13): a lógica de
 * timer/estado vive no módulo puro (testável com fake timers, sem
 * `@testing-library/react-native`), este hook só conecta `setTimeout`/
 * `clearTimeout` reais e `client.order.confirmarPagamento(pedidoId)`.
 *
 * **[GAP DE INFRA]** já documentado nas Stories 2.1/5.4/5.6/6.1/6.13 —
 * `apps/cliente` não tem harness de teste de hook React (`vitest` roda em
 * ambiente `node`). Por isso este arquivo não tem `.test.ts` próprio: toda a
 * cobertura de estados/cancelamento/retry vive em `pagamentoSimulado.test.ts`
 * (o motor puro que este hook conecta).
 *
 * Reagendado do zero (novo `startPagamentoSimulado`) sempre que `pedidoId`
 * ou `delayMs` mudarem — na prática, cada tela (`ModalPagamentoPix`/
 * `ModalProcessandoPagamento`) monta com um `pedidoId`/`delayMs` fixos, então
 * o efeito roda uma única vez por navegação. `stop()` é chamado no cleanup
 * (unmount ou re-execução do efeito) — cancela qualquer timer pendente
 * (AC2/AC3: sair da tela antes da confirmação não deixa nenhuma chamada
 * "fantasma").
 */
export function usePagamentoSimulado(
  pedidoId: string,
  delayMs: number,
  onComplete: () => void,
): UsePagamentoSimuladoResult {
  const [status, setStatus] = useState<PagamentoSimuladoStatus>('aguardando');
  const controllerRef = useRef<PagamentoSimuladoController | null>(null);

  // Evita recriar o efeito só porque `onComplete` mudou de identidade a cada
  // render (mesmo racional de `refreshRef` em `usePedidosMine.ts`).
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setStatus('aguardando');

    const controller = startPagamentoSimulado({
      // Arrow que chama o global diretamente — mesmo [FIX] de
      // `usePedidosMine.ts` para não quebrar no web (react-native-web).
      setTimeout: (handler, ms) => setTimeout(handler, ms),
      clearTimeout: (id) => clearTimeout(id),
      confirmarPagamento: async () => {
        const pedido = await getDataClient().order.confirmarPagamento(pedidoId);
        await invalidatePedidos(pedido.cliente_id);
        return pedido;
      },
      delayMs,
      pauseMs: CONFIRMADO_PAUSE_MS,
      onStatusChange: setStatus,
      onComplete: () => onCompleteRef.current(),
    });
    controllerRef.current = controller;

    return () => {
      controller.stop();
      controllerRef.current = null;
    };
  }, [pedidoId, delayMs]);

  const retry = useCallback(() => {
    controllerRef.current?.retry();
  }, []);

  return { status, retry };
}
