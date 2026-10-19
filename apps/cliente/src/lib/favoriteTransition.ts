export type FavoriteOperation = 'favorite' | 'unfavorite';

export interface FavoriteTransition {
  optimistic: ReadonlySet<string>;
  rollback: ReadonlySet<string>;
  operation: FavoriteOperation;
}

export type FavoriteMutationResult =
  | { status: 'saved'; favorite: boolean }
  | { status: 'reverted'; favorite: boolean; error: Error };

export const FAVORITE_MUTATION_ERROR_MESSAGE =
  'Não foi possível atualizar seus favoritos. Tente novamente.';

export function publishFavoriteError(
  error: Error | null,
  publish: (error: Error | null) => void,
  notify: (message: string) => void,
): void {
  publish(error);
  if (error) notify(error.message);
}

const FAVORITES_FOCUS_ROUTES = new Set(['Home', 'Perfil', 'Favoritos']);

export function shouldRefreshFavoritesOnFocus(routeName: string | undefined): boolean {
  return routeName !== undefined && FAVORITES_FOCUS_ROUTES.has(routeName);
}

export function canApplyFavoriteRefresh(
  mutationSequenceAtStart: number,
  currentMutationSequence: number,
  hasPendingMutation: boolean,
): boolean {
  return !hasPendingMutation && mutationSequenceAtStart === currentMutationSequence;
}

/** Produz snapshots novos; o conjunto recebido nunca é alterado. */
export function planFavoriteToggle(
  currentIds: ReadonlySet<string>,
  resourceId: string,
): FavoriteTransition {
  const rollback = new Set(currentIds);
  const optimistic = new Set(currentIds);
  const operation = currentIds.has(resourceId) ? 'unfavorite' : 'favorite';

  if (operation === 'favorite') {
    optimistic.add(resourceId);
  } else {
    optimistic.delete(resourceId);
  }

  return { optimistic, rollback, operation };
}

interface FavoriteToggleExecutorDependencies {
  getCurrentIds: () => ReadonlySet<string>;
  publish: (ids: ReadonlySet<string>) => void;
  execute: (operation: FavoriteOperation, resourceId: string) => Promise<void>;
  publishError: (error: Error | null) => void;
  onSettled?: () => void;
}

export interface FavoriteToggleExecutor {
  toggle: (resourceId: string) => Promise<FavoriteMutationResult>;
  hasPending: () => boolean;
}

function restoreResourceMembership(
  currentIds: ReadonlySet<string>,
  resourceId: string,
  wasFavorite: boolean,
): ReadonlySet<string> {
  const restored = new Set(currentIds);
  if (wasFavorite) {
    restored.add(resourceId);
  } else {
    restored.delete(resourceId);
  }
  return restored;
}

/**
 * Coordena uma coleção de favoritos. Chamadas simultâneas do mesmo ID
 * compartilham a promise em voo; IDs diferentes continuam independentes.
 */
export function createFavoriteToggleExecutor(
  dependencies: FavoriteToggleExecutorDependencies,
): FavoriteToggleExecutor {
  const pendingById = new Map<string, Promise<FavoriteMutationResult>>();

  const toggle = (resourceId: string): Promise<FavoriteMutationResult> => {
    const pending = pendingById.get(resourceId);
    if (pending) {
      return pending;
    }

    const transition = planFavoriteToggle(dependencies.getCurrentIds(), resourceId);
    const favorite = transition.operation === 'favorite';
    dependencies.publishError(null);
    dependencies.publish(transition.optimistic);

    let execution: Promise<void>;
    try {
      execution = dependencies.execute(transition.operation, resourceId);
    } catch (cause) {
      execution = Promise.reject(cause);
    }

    const mutation = execution
      .then<FavoriteMutationResult>(() => ({ status: 'saved', favorite }))
      .catch<FavoriteMutationResult>(() => {
        const error = new Error(FAVORITE_MUTATION_ERROR_MESSAGE);
        dependencies.publish(
          restoreResourceMembership(
            dependencies.getCurrentIds(),
            resourceId,
            transition.rollback.has(resourceId),
          ),
        );
        dependencies.publishError(error);
        return { status: 'reverted', favorite: transition.rollback.has(resourceId), error };
      })
      .finally(() => {
        pendingById.delete(resourceId);
        dependencies.onSettled?.();
      });

    pendingById.set(resourceId, mutation);
    return mutation;
  };

  return { toggle, hasPending: () => pendingById.size > 0 };
}
