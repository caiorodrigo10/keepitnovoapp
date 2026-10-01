import { useCallback, useEffect, useRef, useState } from 'react';
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
  resolveDeletionAccess,
  subscribeDeletionPersisted,
  type DeletionLookup,
} from '../lib/accountDeletionAccess';

const Stack = createNativeStackNavigator<RootStackParamList>();

function DeletionGuard({ storeId, children }: { storeId: string; children: React.ReactNode }) {
  const [lookup, setLookup] = useState<DeletionLookup>({ status: 'loading' });
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLookup({ status: 'loading' });
    try {
      const deletion = await getDataClient().accountDeletion.status();
      if (current === requestId.current) setLookup({ status: 'resolved', deletion });
    } catch {
      if (current === requestId.current) setLookup({ status: 'failed' });
    }
  }, []);

  const onDeletionChange = useCallback((deletion: AccountDeletionRecord | null) => {
    requestId.current += 1;
    setLookup({ status: 'resolved', deletion });
  }, []);

  useEffect(() => {
    void load();
    const unsubscribe = subscribeDeletionPersisted(storeId, onDeletionChange);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => { requestId.current += 1; unsubscribe(); appState.remove(); };
  }, [load, onDeletionChange, storeId]);

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
