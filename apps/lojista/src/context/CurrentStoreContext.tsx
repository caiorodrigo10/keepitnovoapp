import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { getDataClient, resolveDataMode } from '@keepit/core-data';
import { getLojistaSupabaseClient } from '../lib/dataClientBootstrap';
import { onLojistaSessionChange } from '../navigation/lojistaSession';
import { observeCurrentStore, resolveCurrentStore, type CurrentStoreState } from '../lib/resolveCurrentStore';

const Context = createContext<CurrentStoreState | null>(null);

export function CurrentStoreProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<CurrentStoreState>({ id: null, loading: true, error: null });
  useEffect(() => {
    let cleanup = () => {};
    let alive = true;
    try {
      const mode = resolveDataMode(process.env.EXPO_PUBLIC_DATA_SOURCE);
      const observer = observeCurrentStore(userId => resolveCurrentStore(mode, userId, getDataClient().estabelecimentoCadastro), setState);
      if (mode === 'mock') {
        const unsubscribe = onLojistaSessionChange(session => observer.change(session ? 'mock-session' : null));
        cleanup = () => { observer.dispose(); unsubscribe(); };
      } else {
        const supabase = getLojistaSupabaseClient();
        let eventSeen = false;
        let currentUser: string | null | undefined;
        const change = (id: string | null, force = false) => {
          if (!alive || (!force && currentUser === id)) return;
          currentUser = id;
          // Não inicia chamadas Auth dentro do callback do SDK (lock de sessão).
          observer.change(id);
        };
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
          eventSeen = true;
          const id = session?.user.id ?? null;
          // Limpa o estado imediatamente; a resolução roda fora do lock do SDK.
          if (currentUser !== id) setState({ id: null, loading: id !== null, error: null });
          queueMicrotask(() => change(id, _event === 'SIGNED_IN'));
        });
        void supabase.auth.getUser().then(({ data, error }) => {
          if (!alive || eventSeen) return;
          if (error) setState({ id: null, loading: false, error });
          else change(data.user?.id ?? null);
        }).catch(() => {
          if (alive && !eventSeen) setState({ id: null, loading: false, error: new Error('Não foi possível recuperar a sessão.') });
        });
        cleanup = () => { observer.dispose(); subscription.unsubscribe(); };
      }
    } catch (error) {
      setState({ id: null, loading: false, error: error instanceof Error ? error : new Error('Não foi possível identificar a loja.') });
    }
    return () => { alive = false; cleanup(); };
  }, []);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}

export function useCurrentStore(): CurrentStoreState {
  const value = useContext(Context);
  if (!value) throw new Error('useCurrentStore exige CurrentStoreProvider.');
  return value;
}
