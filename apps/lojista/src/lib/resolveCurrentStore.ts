import type { DataClient, DataMode } from '@keepit/core-data';

export type StoreIdentitySource = Pick<DataClient['estabelecimentoCadastro'], 'getMeuEstabelecimentoId' | 'getMeuEstabelecimento'>;
export interface CurrentStoreState { id: string | null; loading: boolean; error: Error | null }

export async function resolveCurrentStore(mode: DataMode, userId: string | null, store: StoreIdentitySource): Promise<string | null> {
  if (!userId) return null;
  if (mode === 'mock') return 'estab-farmacia-vida';
  const id = await store.getMeuEstabelecimentoId();
  if (!id) return null;
  const perfil = await store.getMeuEstabelecimento();
  return perfil?.status === 'ativo' ? id : null;
}

/** Revalida a mesma conta sem desmontar sua loja; troca de conta invalida imediatamente. */
export function observeCurrentStore(resolve: (userId: string) => Promise<string | null>, publish: (state: CurrentStoreState) => void) {
  let generation = 0;
  let disposed = false;
  let currentUser: string | null | undefined;
  let state: CurrentStoreState = { id: null, loading: true, error: null };

  function update(next: CurrentStoreState) {
    if (state.id === next.id && state.loading === next.loading && state.error === next.error) return;
    state = next;
    publish(next);
  }

  return {
    change(userId: string | null): Promise<void> {
      if (disposed) return Promise.resolve();
      const current = ++generation;
      const accountChanged = currentUser !== userId;
      currentUser = userId;
      if (accountChanged) update({ id: null, loading: userId !== null, error: null });
      if (!userId) return Promise.resolve();

      // A chamada Auth fica fora do callback síncrono onAuthStateChange do SDK.
      return Promise.resolve().then(() => {
        if (disposed || current !== generation) return null;
        return resolve(userId);
      }).then(
        id => {
          if (!disposed && current === generation) update({ id, loading: false, error: null });
        },
        error => {
          if (disposed || current !== generation) return;
          // Falha de rede ao recuperar foco não é evidência de mudança de identidade.
          if (!accountChanged && state.id !== null) return;
          update({ id: null, loading: false, error: error instanceof Error ? error : new Error('Não foi possível identificar a loja.') });
        },
      );
    },
    dispose() { disposed = true; generation++; },
  };
}
