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
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
          eventSeen = true;
          if (alive) void observer.change(session?.user.id ?? null);
        });
        void supabase.auth.getUser().then(({ data, error }) => {
          if (!alive || eventSeen) return;
          if (error) setState({ id: null, loading: false, error });
          else void observer.change(data.user?.id ?? null);
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
