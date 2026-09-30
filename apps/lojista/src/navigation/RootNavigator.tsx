import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { darkColors } from '@keepit/ui-tokens';
import type { RootStackParamList } from './types';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { CurrentStoreProvider, useCurrentStore } from '../context/CurrentStoreContext';
import ModalPermissaoPush from '../screens/modals/ModalPermissaoPush';

const Stack = createNativeStackNavigator<RootStackParamList>();

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
        <Stack.Screen key={id} name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Auth" component={AuthStack} />
      )}
      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="ModalPermissaoPush" component={ModalPermissaoPush} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
