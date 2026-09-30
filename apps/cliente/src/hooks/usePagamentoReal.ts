import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDataClient, type CardInput, type HolderInput, type PaymentAttempt } from '@keepit/core-data';
import { isPagamentoConfirmado, startPaymentPolling } from '../lib/paymentStatus';
import { invalidatePedidos } from '../lib/ordersResource';

/** Guarda somente a projeção pública. PAN/CVV nunca entram em state, cache ou navegação. */
export function usePagamentoReal(pedidoId: string, clienteId: string | null, onComplete: () => void) {
  const [attempt, setAttempt] = useState<PaymentAttempt | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const focused = useRef(false);
  const generation = useRef(0);
  const complete = useRef(onComplete); complete.current = onComplete;
  const controller = useRef<ReturnType<typeof startPaymentPolling> | null>(null);
  const completed = useRef<string | null>(null);
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
    busy.current = true; setSubmitting(true); setActionError(null);
    try {
      const value = await run();
      if (focused.current && generation.current === actionGeneration) setAttempt(value);
    } catch {
      if (focused.current && generation.current === actionGeneration) setActionError('Não foi possível iniciar o pagamento. Atualize o estado do pedido antes de tentar novamente.');
    } finally {
      busy.current = false;
      if (focused.current) { setSubmitting(false); controller.current?.refresh(); }
    }
  };
  // O ID anterior, quando terminal, define uma nova operação estável mesmo após reabrir o app.
  const operationId = attempt && ['recusado', 'expirado'].includes(attempt.estado) ? attempt.id : attempt?.operacaoId ?? pedidoId;
  return {
    attempt, loaded, error: actionError ?? error, submitting,
    refresh: () => { setActionError(null); controller.current?.refresh(); },
    iniciarPix: () => perform(() => getDataClient().payment.iniciarPix({ pedidoId, operacaoId: operationId })),
    pagarCartao: (cartao: CardInput, titular: HolderInput) => perform(() => getDataClient().payment.pagarCartao({ pedidoId, operacaoId: operationId, cartao, titular })),
  };
}
