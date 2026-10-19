import { describe, expect, it, vi } from 'vitest';

import {
  canApplyFavoriteRefresh,
  createFavoriteToggleExecutor,
  planFavoriteToggle,
  publishFavoriteError,
  shouldRefreshFavoritesOnFocus,
} from './favoriteTransition';

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
} {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('planFavoriteToggle', () => {
  it('planeja remoção com snapshots otimista e de rollback independentes', () => {
    const current = new Set(['a']);

    const transition = planFavoriteToggle(current, 'a');

    expect([...transition.optimistic]).toEqual([]);
    expect([...transition.rollback]).toEqual(['a']);
    expect(transition.operation).toBe('unfavorite');
    expect([...current]).toEqual(['a']);
    expect(transition.optimistic).not.toBe(current);
    expect(transition.rollback).not.toBe(current);
  });

  it('planeja adição sem alterar o conjunto recebido', () => {
    const current = new Set(['a']);

    const transition = planFavoriteToggle(current, 'b');

    expect([...transition.optimistic]).toEqual(['a', 'b']);
    expect([...transition.rollback]).toEqual(['a']);
    expect(transition.operation).toBe('favorite');
    expect([...current]).toEqual(['a']);
  });
});

describe('shouldRefreshFavoritesOnFocus', () => {
  it.each(['Home', 'Perfil', 'Favoritos'])('atualiza ao focar %s', (routeName) => {
    expect(shouldRefreshFavoritesOnFocus(routeName)).toBe(true);
  });

  it.each([undefined, 'Hub', 'Loja', 'MeusPedidos'])(
    'não atualiza ao focar uma rota fora das superfícies de favoritos (%s)',
    (routeName) => {
      expect(shouldRefreshFavoritesOnFocus(routeName)).toBe(false);
    },
  );
});

describe('canApplyFavoriteRefresh', () => {
  it('aceita somente resposta sem toggle pendente e sem mudança desde o início', () => {
    expect(canApplyFavoriteRefresh(2, 2, false)).toBe(true);
    expect(canApplyFavoriteRefresh(2, 2, true)).toBe(false);
    expect(canApplyFavoriteRefresh(2, 3, false)).toBe(false);
  });
});

describe('createFavoriteToggleExecutor', () => {
  it('ignora o segundo toque no mesmo ID enquanto a primeira mutação está pendente', async () => {
    let ids: ReadonlySet<string> = new Set();
    const pending = deferred();
    const execute = vi.fn(() => pending.promise);
    const onSettled = vi.fn();
    const executor = createFavoriteToggleExecutor({
      getCurrentIds: () => ids,
      publish: (next) => {
        ids = next;
      },
      execute,
      publishError: vi.fn(),
      onSettled,
    });

    const first = executor.toggle('hub-a');
    const second = executor.toggle('hub-a');

    expect(second).toBe(first);
    expect(execute).toHaveBeenCalledTimes(1);
    expect([...ids]).toEqual(['hub-a']);
    expect(executor.hasPending()).toBe(true);

    pending.resolve();
    await expect(first).resolves.toEqual({ status: 'saved', favorite: true });
    expect(executor.hasPending()).toBe(false);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('permite mutações concorrentes para IDs diferentes', async () => {
    let ids: ReadonlySet<string> = new Set();
    const firstPending = deferred();
    const secondPending = deferred();
    const execute = vi.fn((_operation, resourceId: string) =>
      resourceId === 'hub-a' ? firstPending.promise : secondPending.promise,
    );
    const executor = createFavoriteToggleExecutor({
      getCurrentIds: () => ids,
      publish: (next) => {
        ids = next;
      },
      execute,
      publishError: vi.fn(),
    });

    const first = executor.toggle('hub-a');
    const second = executor.toggle('hub-b');

    expect(execute).toHaveBeenCalledTimes(2);
    expect([...ids]).toEqual(['hub-a', 'hub-b']);

    firstPending.resolve();
    secondPending.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'saved', favorite: true },
      { status: 'saved', favorite: true },
    ]);
  });

  it('reverte somente o item rejeitado e publica erro genérico observável', async () => {
    let ids: ReadonlySet<string> = new Set(['hub-original']);
    const firstPending = deferred();
    const secondPending = deferred();
    const publishError = vi.fn();
    const executor = createFavoriteToggleExecutor({
      getCurrentIds: () => ids,
      publish: (next) => {
        ids = next;
      },
      execute: (_operation, resourceId) =>
        resourceId === 'hub-original' ? firstPending.promise : secondPending.promise,
      publishError,
    });

    const rejected = executor.toggle('hub-original');
    const saved = executor.toggle('hub-new');
    secondPending.resolve();
    await saved;
    firstPending.reject(new Error('detalhe privado do adapter'));

    await expect(rejected).resolves.toMatchObject({
      status: 'reverted',
      favorite: true,
      error: expect.any(Error),
    });
    expect([...ids]).toEqual(['hub-new', 'hub-original']);
    expect(publishError).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'Não foi possível atualizar seus favoritos. Tente novamente.' }),
    );
  });

  it('libera o ID após uma rejeição síncrona da port', async () => {
    let ids: ReadonlySet<string> = new Set();
    const execute = vi.fn((): Promise<void> => {
      throw new Error('falha síncrona');
    });
    const executor = createFavoriteToggleExecutor({
      getCurrentIds: () => ids,
      publish: (next) => {
        ids = next;
      },
      execute,
      publishError: vi.fn(),
    });

    await executor.toggle('hub-a');
    await executor.toggle('hub-a');

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('notifica uma vez quando dois controles compartilham a mesma mutação rejeitada', async () => {
    let ids: ReadonlySet<string> = new Set();
    const pending = deferred();
    const notify = vi.fn();
    const executor = createFavoriteToggleExecutor({
      getCurrentIds: () => ids,
      publish: (next) => {
        ids = next;
      },
      execute: () => pending.promise,
      publishError: (error) => publishFavoriteError(error, () => undefined, notify),
    });

    const first = executor.toggle('store-a');
    const follower = executor.toggle('store-a');
    pending.reject(new Error('disk full'));

    await expect(Promise.all([first, follower])).resolves.toEqual([
      expect.objectContaining({ status: 'reverted' }),
      expect.objectContaining({ status: 'reverted' }),
    ]);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith('Não foi possível atualizar seus favoritos. Tente novamente.');
  });
});
