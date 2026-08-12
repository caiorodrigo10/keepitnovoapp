import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { AuthStackParamList } from './types';
import OnboardingLojista1 from '../screens/auth/OnboardingLojista1';
import OnboardingLojista2 from '../screens/auth/OnboardingLojista2';
import OnboardingLojista3 from '../screens/auth/OnboardingLojista3';
import CadastroPasso1 from '../screens/auth/CadastroPasso1';
import CadastroPasso2 from '../screens/auth/CadastroPasso2';
import CadastroPasso3 from '../screens/auth/CadastroPasso3';
import CadastroRejeitado from '../screens/auth/CadastroRejeitado';
import ContaIndisponivel from '../screens/auth/ContaIndisponivel';
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
 *
 * Story 3.1: `OnboardingLojista` (tela única) substituída pelo pager de 3
 * telas (`OnboardingLojista1/2/3`); `initialRouteName` aponta para a
 * primeira tela do pager. Demais rotas do inventário inalteradas (AC5).
 */
export function AuthStack() {
  return (
    <CadastroDraftProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="OnboardingLojista1">
        <Stack.Screen name="OnboardingLojista1" component={OnboardingLojista1} />
        <Stack.Screen name="OnboardingLojista2" component={OnboardingLojista2} />
        <Stack.Screen name="OnboardingLojista3" component={OnboardingLojista3} />
        <Stack.Screen name="CadastroPasso1" component={CadastroPasso1} />
        <Stack.Screen name="CadastroPasso2" component={CadastroPasso2} />
        <Stack.Screen name="CadastroPasso3" component={CadastroPasso3} />
        <Stack.Screen name="EmAnalise" component={EmAnalise} />
        <Stack.Screen name="Login" component={Login} />
        {/* Story 3.10 (AC3, AC5) — roteadas por Login.tsx pós-autenticação. */}
        <Stack.Screen name="CadastroRejeitado" component={CadastroRejeitado} />
        <Stack.Screen name="ContaIndisponivel" component={ContaIndisponivel} />
      </Stack.Navigator>
    </CadastroDraftProvider>
  );
}
