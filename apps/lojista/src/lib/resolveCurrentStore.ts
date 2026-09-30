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

/** Invalida resultados de sessões anteriores antes de iniciar qualquer leitura. */
export function observeCurrentStore(resolve: (userId: string) => Promise<string | null>, publish: (state: CurrentStoreState) => void) {
  let generation = 0;
  let disposed = false;
  return {
    change(userId: string | null) {
      if (disposed) return;
      const current = ++generation;
      publish({ id: null, loading: userId !== null, error: null });
      if (!userId) return;
      void resolve(userId).then(
        id => { if (!disposed && current === generation) publish({ id, loading: false, error: null }); },
        error => { if (!disposed && current === generation) publish({ id: null, loading: false, error: error instanceof Error ? error : new Error('Não foi possível identificar a loja.') }); },
      );
    },
    dispose() { disposed = true; generation++; },
  };
}
