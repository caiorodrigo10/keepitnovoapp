import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { createSupportOperationId, getDataClient, PaymentActionError, type CardInput, type HolderInput, type PaymentActionErrorCode, type PaymentAttempt } from '@keepit/core-data';
import { isPagamentoConfirmado, startPaymentPolling } from '../lib/paymentStatus';
import { invalidatePedidos } from '../lib/ordersResource';
import { CARD_TOKENIZATION_ENABLED } from '../config/featureFlags';

/** Guarda somente a projeção pública. PAN/CVV nunca entram em state, cache ou navegação. */
export type PublicCardPaymentInput =
  | { type: 'cartao_novo'; cartao: CardInput; titular: HolderInput; salvarCartao: boolean }
  | { type: 'cartao_salvo'; cartaoSalvoId: string };

export function usePagamentoReal(pedidoId: string, clienteId: string | null, onComplete: () => void) {
  const [attempt, setAttempt] = useState<PaymentAttempt | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionCode, setActionCode] = useState<PaymentActionErrorCode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const focused = useRef(false);
  const generation = useRef(0);
  const complete = useRef(onComplete); complete.current = onComplete;
  const controller = useRef<ReturnType<typeof startPaymentPolling> | null>(null);
  const completed = useRef<string | null>(null);
  const nextOperation = useRef<{ tentativaId: string; operacaoId: string } | null>(null);
  const closeOperation = useRef<{ tentativaId: string; operacaoId: string } | null>(null);
  useFocusEffect(useCallback(() => {
    if (!clienteId) return;
    focused.current = true; generation.current += 1;
    setLoaded(false); setAttempt(null); setSubmitting(busy.current);
    controller.current = startPaymentPolling({
      read: () => getDataClient().payment.consultar(pedidoId),
      onAttempt: (value) => {
        setAttempt(value); setLoaded(true); setError(null);
        if (value && isPagamentoConfirmado(value.estado) && completed.current !== pedidoId) {
          completed.current = pedidoId;
          void invalidatePedidos(clienteId);
          complete.current();
        }
      },
      onError: setError,
      getAppState: () => AppState.currentState,
      subscribe: (listener) => AppState.addEventListener('change', listener),
    });
    return () => { focused.current = false; generation.current += 1; controller.current?.stop(); controller.current = null; };
  }, [pedidoId, clienteId]));

  const perform = async (run: () => Promise<PaymentAttempt>) => {
    if (busy.current || !loaded || !focused.current) return;
    const actionGeneration = generation.current;
    busy.current = true; setSubmitting(true); setActionError(null); setActionCode(null);
    try {
      const value = await run();
      if (focused.current && generation.current === actionGeneration) setAttempt(value);
    } catch (cause) {
      const typedError = cause instanceof PaymentActionError ? cause : null;
      const message = typedError
        ? typedError.message
        : 'Não foi possível iniciar o pagamento. Atualize o estado do pedido antes de tentar novamente.';
      if (focused.current && generation.current === actionGeneration) {
        setActionError(message);
        setActionCode(typedError?.code ?? null);
      }
    } finally {
      busy.current = false;
      if (focused.current) { setSubmitting(false); controller.current?.refresh(); }
    }
  };
  // O ID anterior, quando terminal, define uma nova operação estável mesmo após reabrir o app.
  const operationId = (() => {
    if (attempt && ['recusado', 'expirado'].includes(attempt.estado)) {
      if (nextOperation.current?.tentativaId !== attempt.id) {
        nextOperation.current = { tentativaId: attempt.id, operacaoId: createSupportOperationId() };
      }
      return nextOperation.current.operacaoId;
    }
    return attempt?.operacaoId ?? pedidoId;
  })();
  return {
    attempt, actionCode, loaded, error: actionError ?? error, submitting,
    refresh: () => { setActionError(null); setActionCode(null); controller.current?.refresh(); },
    encerrarTentativa: () => {
      if (!attempt || !['criando', 'pendente'].includes(attempt.estado)) return;
      if (closeOperation.current?.tentativaId !== attempt.id) {
        closeOperation.current = { tentativaId: attempt.id, operacaoId: createSupportOperationId() };
      }
      const operation = closeOperation.current;
      return perform(() => getDataClient().payment.encerrarTentativa({ tentativaId: attempt.id, operacaoId: operation.operacaoId }));
    },
    iniciarPix: () => perform(() => getDataClient().payment.iniciarPix({ pedidoId, operacaoId: operationId })),
    pagarCartao: (input: PublicCardPaymentInput) => perform(() => {
      if (input.type === 'cartao_salvo') {
        if (!CARD_TOKENIZATION_ENABLED) throw new PaymentActionError('CARD_TOKENIZATION_DISABLED');
        return getDataClient().payment.pagarCartao({ pedidoId, operacaoId: operationId, cartaoSalvoId: input.cartaoSalvoId });
      }
      return getDataClient().payment.pagarCartao({ pedidoId, operacaoId: operationId, cartao: input.cartao, titular: input.titular, salvarCartao: CARD_TOKENIZATION_ENABLED && input.salvarCartao });
    }),
  };
}
