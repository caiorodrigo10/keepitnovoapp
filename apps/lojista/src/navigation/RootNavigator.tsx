import { useCallback, useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getDataClient, resolveDataMode, type AccountDeletionRecord } from '@keepit/core-data';
import { darkColors } from '@keepit/ui-tokens';
import type { RootStackParamList } from './types';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { CurrentStoreProvider, useCurrentStore } from '../context/CurrentStoreContext';
import ModalPermissaoPush from '../screens/modals/ModalPermissaoPush';
import ExclusaoAgendada from '../screens/auth/ExclusaoAgendada';
import {
  createDeletionLookupCoordinator,
  resolveDeletionAccess,
  subscribeDeletionPersisted,
  type DeletionLookup,
} from '../lib/accountDeletionAccess';

const Stack = createNativeStackNavigator<RootStackParamList>();

function DeletionGuard({ storeId, children }: { storeId: string; children: React.ReactNode }) {
  const [lookup, setLookup] = useState<DeletionLookup>({ status: 'loading' });
  const [coordinator] = useState(createDeletionLookupCoordinator);

  // Revalidação (AppState active, retry) preserva o último estado resolvido:
  // begin() só devolve loading antes da primeira resolução, evitando o flash
  // da tela de exclusão a cada volta ao app (espelho do cliente, 7f0a0ab).
  const load = useCallback(async () => {
    const { requestId, lookup: pendingLookup } = coordinator.begin();
    setLookup(pendingLookup);
    try {
      const deletion = await getDataClient().accountDeletion.status();
      const next = coordinator.complete(requestId, { status: 'resolved', deletion });
      if (next) setLookup(next);
    } catch {
      const next = coordinator.complete(requestId, { status: 'failed' });
      if (next) setLookup(next);
    }
  }, [coordinator]);

  const onDeletionChange = useCallback((deletion: AccountDeletionRecord | null) => {
    setLookup(coordinator.commit(deletion));
  }, [coordinator]);

  useEffect(() => {
    void load();
    const unsubscribe = subscribeDeletionPersisted(storeId, onDeletionChange);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => { coordinator.reset(); unsubscribe(); appState.remove(); };
  }, [coordinator, load, onDeletionChange, storeId]);

  if (resolveDeletionAccess(lookup) === 'restricted') {
    return <ExclusaoAgendada lookup={lookup} onDeletionChange={onDeletionChange} onRetry={() => void load()} />;
  }
  return <>{children}</>;
}

export function RootNavigator() {
  return <CurrentStoreProvider><StoreNavigator /></CurrentStoreProvider>;
}

/** Desmontar Main limpa todos os estados e ações da loja anterior. */
function StoreNavigator() {
  const { id, loading, error } = useCurrentStore();
  const [sessionInitialized, setSessionInitialized] = useState(false);
  useEffect(() => {
    if (!loading) setSessionInitialized(true);
  }, [loading]);
  // Mantém o wizard Auth montado durante SIGNED_IN de uma conta sem loja.
  // Main continua indisponível até a identidade da loja estar resolvida.
  if (loading && !sessionInitialized) return <View style={{ flex: 1, backgroundColor: darkColors.bg.primary }} />;
  if (error) return <View><Text>Não foi possível recuperar sua loja. Reinicie o aplicativo para tentar novamente.</Text></View>;
  return (
    <Stack.Navigator key={id ?? 'auth'} screenOptions={{ headerShown: false }}>
      {id ? (
        <Stack.Screen key={id} name="Main">
          {() => resolveDataMode(process.env.EXPO_PUBLIC_DATA_SOURCE) === 'supabase'
            ? <DeletionGuard key={id} storeId={id}><MainTabs /></DeletionGuard>
            : <MainTabs />}
        </Stack.Screen>
      ) : (
        <Stack.Screen name="Auth" component={AuthStack} />
      )}
      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="ModalPermissaoPush" component={ModalPermissaoPush} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
