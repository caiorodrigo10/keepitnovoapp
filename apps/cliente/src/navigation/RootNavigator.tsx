import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { RootStackParamList } from './types';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { isAuthenticated } from './authGuard';
import ModalCPF from '../screens/modals/ModalCPF';
import ModalConfirmarPin from '../screens/modals/ModalConfirmarPin';
import ModalPermissaoPush from '../screens/modals/ModalPermissaoPush';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Navigator raiz do Cliente — Épico 0, Story 0.3 (AC1, AC3, AC4, AC5).
 *
 * Decide entre `AuthStack` (deslogado) e `Main` (`MainTabs`, logado) via o
 * guard stub `isAuthenticated()`, e declara as 3 rotas modais no mesmo
 * nível raiz (`presentation: 'modal'`), acessíveis independente do estado
 * de auth (ex.: `ModalPermissaoPush` após login).
 */
export function RootNavigator() {
  const authenticated = isAuthenticated();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {authenticated ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Auth" component={AuthStack} />
      )}
      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="ModalCPF" component={ModalCPF} />
        <Stack.Screen name="ModalConfirmarPin" component={ModalConfirmarPin} />
        <Stack.Screen name="ModalPermissaoPush" component={ModalPermissaoPush} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
