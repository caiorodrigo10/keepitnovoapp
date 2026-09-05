import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import {
  useNavigation,
  type NavigationContainerRef,
  type ParamListBase,
} from '@react-navigation/native';

import { getDataClient } from '@keepit/core-data';

import {
  canApplyFavoriteRefresh,
  createFavoriteToggleExecutor,
  FAVORITE_MUTATION_ERROR_MESSAGE,
  shouldRefreshFavoritesOnFocus,
  type FavoriteMutationResult,
  type FavoriteOperation,
} from '../lib/favoriteTransition';

export type { FavoriteMutationResult } from '../lib/favoriteTransition';

export interface FavoritesContextValue {
  favoriteHubIds: ReadonlySet<string>;
  favoriteStoreIds: ReadonlySet<string>;
  favoriteHubCount: number;
  favoriteStoreCount: number;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  toggleHub: (hubId: string) => Promise<FavoriteMutationResult>;
  toggleStore: (estabelecimentoId: string) => Promise<FavoriteMutationResult>;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

function callFavoriteMutation(
  port: {
    favorite: (resourceId: string) => Promise<void>;
    unfavorite: (resourceId: string) => Promise<void>;
  },
  operation: FavoriteOperation,
  resourceId: string,
): Promise<void> {
  return operation === 'favorite'
    ? port.favorite(resourceId)
    : port.unfavorite(resourceId);
}

/**
 * Fonte única de favoritos para as rotas autenticadas. Telas chamam
 * `refresh` ao ganhar foco; o provider também converge no login (mount) e
 * quando o app volta ao foreground.
 */
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const client = getDataClient();
  const navigation = useNavigation<NavigationContainerRef<ParamListBase>>();
  const mountedRef = useRef(true);
  const refreshSequenceRef = useRef(0);
  const hubMutationSequenceRef = useRef(0);
  const storeMutationSequenceRef = useRef(0);
  const hubIdsRef = useRef<ReadonlySet<string>>(new Set());
  const storeIdsRef = useRef<ReadonlySet<string>>(new Set());
  const [favoriteHubIds, setFavoriteHubIds] = useState<ReadonlySet<string>>(hubIdsRef.current);
  const [favoriteStoreIds, setFavoriteStoreIds] = useState<ReadonlySet<string>>(storeIdsRef.current);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const publishHubIds = useCallback((ids: ReadonlySet<string>) => {
    const next = new Set(ids);
    hubMutationSequenceRef.current += 1;
    hubIdsRef.current = next;
    if (mountedRef.current) setFavoriteHubIds(next);
  }, []);

  const publishStoreIds = useCallback((ids: ReadonlySet<string>) => {
    const next = new Set(ids);
    storeMutationSequenceRef.current += 1;
    storeIdsRef.current = next;
    if (mountedRef.current) setFavoriteStoreIds(next);
  }, []);

  const publishError = useCallback((nextError: Error | null) => {
    if (mountedRef.current) setError(nextError);
  }, []);

  const hubExecutor = useMemo(
    () =>
      createFavoriteToggleExecutor({
        getCurrentIds: () => hubIdsRef.current,
        publish: publishHubIds,
        execute: (operation, resourceId) =>
          callFavoriteMutation(client.favoriteHubs, operation, resourceId),
        publishError,
        onSettled: () => {
          hubMutationSequenceRef.current += 1;
        },
      }),
    [client.favoriteHubs, publishError, publishHubIds],
  );

  const storeExecutor = useMemo(
    () =>
      createFavoriteToggleExecutor({
        getCurrentIds: () => storeIdsRef.current,
        publish: publishStoreIds,
        execute: (operation, resourceId) =>
          callFavoriteMutation(client.favoriteStores, operation, resourceId),
        publishError,
        onSettled: () => {
          storeMutationSequenceRef.current += 1;
        },
      }),
    [client.favoriteStores, publishError, publishStoreIds],
  );

  const refresh = useCallback(async (): Promise<void> => {
    const refreshSequence = ++refreshSequenceRef.current;
    const hubMutationSequence = hubMutationSequenceRef.current;
    const storeMutationSequence = storeMutationSequenceRef.current;
    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      const [hubIds, storeIds] = await Promise.all([
        client.favoriteHubs.list(),
        client.favoriteStores.list(),
      ]);
      if (!mountedRef.current || refreshSequence !== refreshSequenceRef.current) return;

      if (
        canApplyFavoriteRefresh(
          hubMutationSequence,
          hubMutationSequenceRef.current,
          hubExecutor.hasPending(),
        )
      ) {
        const nextHubIds = new Set(hubIds);
        hubIdsRef.current = nextHubIds;
        setFavoriteHubIds(nextHubIds);
      }
      if (
        canApplyFavoriteRefresh(
          storeMutationSequence,
          storeMutationSequenceRef.current,
          storeExecutor.hasPending(),
        )
      ) {
        const nextStoreIds = new Set(storeIds);
        storeIdsRef.current = nextStoreIds;
        setFavoriteStoreIds(nextStoreIds);
      }
    } catch {
      if (mountedRef.current && refreshSequence === refreshSequenceRef.current) {
        setError(new Error(FAVORITE_MUTATION_ERROR_MESSAGE));
      }
    } finally {
      if (mountedRef.current && refreshSequence === refreshSequenceRef.current) {
        setLoading(false);
      }
    }
  }, [client.favoriteHubs, client.favoriteStores, hubExecutor, storeExecutor]);

  // O mount coincide com login/troca de conta porque RootNavigator aplica
  // uma key por cliente ao provider.
  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void refresh();
    });

    return () => {
      mountedRef.current = false;
      refreshSequenceRef.current += 1;
      subscription.remove();
    };
  }, [refresh]);

  useEffect(
    () =>
      navigation.addListener('state', () => {
        if (shouldRefreshFavoritesOnFocus(navigation.getCurrentRoute()?.name)) {
          void refresh();
        }
      }),
    [navigation, refresh],
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({
      favoriteHubIds,
      favoriteStoreIds,
      favoriteHubCount: favoriteHubIds.size,
      favoriteStoreCount: favoriteStoreIds.size,
      loading,
      error,
      refresh,
      toggleHub: hubExecutor.toggle,
      toggleStore: storeExecutor.toggle,
    }),
    [
      error,
      favoriteHubIds,
      favoriteStoreIds,
      hubExecutor.toggle,
      loading,
      refresh,
      storeExecutor.toggle,
    ],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites() precisa ser usado dentro de <FavoritesProvider>.');
  }
  return context;
}
