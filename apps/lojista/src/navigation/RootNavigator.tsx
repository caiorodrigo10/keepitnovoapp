import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { RootStackParamList } from './types';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { isAuthenticated } from './authGuard';
import ModalPermissaoPush from '../screens/modals/ModalPermissaoPush';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Navigator raiz do Lojista — Épico 0, Story 0.3 (AC1, AC3, AC4, AC5).
 *
 * Decide entre `AuthStack` (deslogado/cadastro) e `Main` (`MainTabs`,
 * logado) via o guard stub `isAuthenticated()`, e declara a rota modal
 * `ModalPermissaoPush` no mesmo nível raiz (`presentation: 'modal'`).
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
        <Stack.Screen name="ModalPermissaoPush" component={ModalPermissaoPush} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
