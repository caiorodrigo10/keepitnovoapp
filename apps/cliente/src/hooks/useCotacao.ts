import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getDataClient, type CotacaoInput } from '@keepit/core-data';
import { createCheckoutQuoteResource, type CheckoutQuoteState } from '../lib/checkoutQuoteResource';

/** Cada foco/carrinho/identidade invalida a resposta anterior antes de exibi-la. */
export function useCotacao(input: CotacaoInput | null, clienteId: string | undefined) {
  const key = JSON.stringify([clienteId, input]);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<CheckoutQuoteState & { key: string; revision: number }>({ key: '', revision: -1, data: null, loading: true, error: null });
  useFocusEffect(useCallback(() => {
    const [, request] = JSON.parse(key) as [string | null, CotacaoInput | null];
    if (!clienteId || !request) {
      setState({ key, revision, data: null, loading: false, error: null });
      return;
    }
    const resource = createCheckoutQuoteResource((value) => getDataClient().checkout.cotar(value), (next) => setState({ ...next, key, revision }));
    void resource.load(request);
    return () => resource.cancel();
  }, [key, clienteId, revision]));
  const current = state.key === key && state.revision === revision;
  return { data: current ? state.data : null, loading: current ? state.loading : true, error: current ? state.error : null, refresh: () => setRevision((r) => r + 1) };
}
