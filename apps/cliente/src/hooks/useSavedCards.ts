import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { createSupportOperationId, getDataClient, type SavedCardSummary } from '@keepit/core-data';
import { CARD_TOKENIZATION_ENABLED } from '../config/featureFlags';

const UPDATE_ERROR = 'Não foi possível atualizar seus cartões. Tente novamente.';

/** Lista pública ligada à sessão atual. Nenhum cartão é gravado localmente. */
export function useSavedCards(clienteId: string | null) {
  const [cards, setCards] = useState<SavedCardSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const mutationRevision = useRef(0);
  const operationIds = useRef(new Map<string, string>());
  const mutationQueue = useRef(Promise.resolve());
  const identity = useRef<string | null>(clienteId);

  // Esconde imediatamente os dados da identidade anterior, antes do próximo efeito de foco.
  const identityChanged = identity.current !== clienteId;
  if (identityChanged) {
    identity.current = clienteId;
    generation.current += 1;
    operationIds.current.clear();
  }

  const refresh = useCallback(async () => {
    const requestGeneration = ++generation.current;
    const observedMutationRevision = mutationRevision.current;
    if (!CARD_TOKENIZATION_ENABLED || !clienteId) {
      operationIds.current.clear();
      setCards([]); setLoading(false); setError(null);
      return;
    }

    setCards([]); setLoading(true); setError(null);
    try {
      const nextCards = await getDataClient().savedCards.listar();
      if (identity.current === clienteId && generation.current === requestGeneration && mutationRevision.current === observedMutationRevision) setCards(nextCards);
    } catch {
      if (identity.current === clienteId && generation.current === requestGeneration && mutationRevision.current === observedMutationRevision) setError(UPDATE_ERROR);
    } finally {
      if (identity.current === clienteId && generation.current === requestGeneration) setLoading(false);
    }
  }, [clienteId]);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => { generation.current += 1; };
  }, [refresh]));

  const mutate = useCallback(async (action: 'principal' | 'remover', cartaoId: string) => {
    if (!CARD_TOKENIZATION_ENABLED || !clienteId) return;
    const key = `${action}:${cartaoId}`;
    const operacaoId = operationIds.current.get(key) ?? createSupportOperationId();
    operationIds.current.set(key, operacaoId);
    const actionRevision = ++mutationRevision.current;
    const run = async () => {
      if (identity.current !== clienteId) return;
      generation.current += 1;
      setError(null);
      try {
        const nextCards = action === 'principal'
          ? await getDataClient().savedCards.definirPrincipal({ cartaoId, operacaoId })
          : await getDataClient().savedCards.remover({ cartaoId, operacaoId });
        if (identity.current === clienteId && mutationRevision.current === actionRevision) {
          setCards(nextCards);
          operationIds.current.delete(key);
          setLoading(false);
          // Leituras iniciadas enquanto o servidor ainda aplicava a mutação
          // podem conter o snapshot anterior e não devem sobrescrever a confirmação.
          mutationRevision.current += 1;
        }
      } catch {
        if (identity.current === clienteId && mutationRevision.current === actionRevision) {
          setError(UPDATE_ERROR);
          setLoading(false);
        }
      }
    };
    const queued = mutationQueue.current.then(run, run);
    mutationQueue.current = queued.then(() => undefined, () => undefined);
    return queued;
  }, [clienteId]);

  return {
    cards: !CARD_TOKENIZATION_ENABLED || identityChanged ? [] : cards,
    loading: CARD_TOKENIZATION_ENABLED && (identityChanged || loading),
    error: !CARD_TOKENIZATION_ENABLED || identityChanged ? null : error,
    refresh,
    definirPrincipal: (cartaoId: string) => mutate('principal', cartaoId),
    remover: (cartaoId: string) => mutate('remover', cartaoId),
  };
}
