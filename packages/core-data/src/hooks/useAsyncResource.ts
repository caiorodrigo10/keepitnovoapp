import { useEffect, useState } from 'react';

/**
 * Estado de um recurso assíncrono consumido por hook (`useHubs`, `useOrders`, ...).
 */
export interface AsyncResourceState<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

/**
 * Hook genérico usado internamente pelos hooks de domínio de `@keepit/core-data`.
 *
 * Decisão do @dev (Story 0.2): hooks simples baseados em `useEffect`/`useState`,
 * sem TanStack Query — fora de escopo do Épico 0 (ver Dev Notes da story).
 * Refeito por `fetcher` sempre que `deps` mudar.
 */
export function useAsyncResource<T>(
  fetcher: () => Promise<T>,
  initialValue: T,
  deps: ReadonlyArray<unknown> = [],
): AsyncResourceState<T> {
  const [state, setState] = useState<AsyncResourceState<T>>({
    data: initialValue,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    fetcher()
      .then((data) => {
        if (!cancelled) {
          setState({ data, loading: false, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState((previous) => ({
            ...previous,
            loading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          }));
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
