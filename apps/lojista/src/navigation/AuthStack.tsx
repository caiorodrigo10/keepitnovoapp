import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { AuthStackParamList } from './types';
import OnboardingLojista from '../screens/auth/OnboardingLojista';
import CadastroPasso1 from '../screens/auth/CadastroPasso1';
import CadastroPasso2 from '../screens/auth/CadastroPasso2';
import CadastroPasso3 from '../screens/auth/CadastroPasso3';
import EmAnalise from '../screens/auth/EmAnalise';
import Login from '../screens/auth/Login';
import { CadastroDraftProvider } from '../screens/auth/CadastroDraftContext';

const Stack = createNativeStackNavigator<AuthStackParamList>();

/**
 * Stack de autenticação/cadastro do Lojista — Épico 0, Story 0.3 (AC1).
 * Inventário de telas alinhado à Story 0.8, que substitui os stubs por
 * conteúdo real e envolve o navigator com `CadastroDraftProvider` (Task 2)
 * para compartilhar o rascunho do formulário multi-step entre os passos
 * 1/2/3 sem persistência real.
 */
export function AuthStack() {
  return (
    <CadastroDraftProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="OnboardingLojista">
        <Stack.Screen name="OnboardingLojista" component={OnboardingLojista} />
        <Stack.Screen name="CadastroPasso1" component={CadastroPasso1} />
        <Stack.Screen name="CadastroPasso2" component={CadastroPasso2} />
        <Stack.Screen name="CadastroPasso3" component={CadastroPasso3} />
        <Stack.Screen name="EmAnalise" component={EmAnalise} />
        <Stack.Screen name="Login" component={Login} />
      </Stack.Navigator>
    </CadastroDraftProvider>
  );
}
