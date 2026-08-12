import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { darkColors } from '@keepit/ui-tokens';

import type { AuthStackParamList } from './types';
import { getOnboardingVisto } from '../lib/onboardingFlag';
import Onboarding1 from '../screens/auth/Onboarding1';
import Onboarding2 from '../screens/auth/Onboarding2';
import Onboarding3 from '../screens/auth/Onboarding3';
import CriarConta from '../screens/auth/CriarConta';
import ConfirmacaoSMS from '../screens/auth/ConfirmacaoSMS';
import Login from '../screens/auth/Login';
import EsqueciSenha from '../screens/auth/EsqueciSenha';
import RecuperarSenha from '../screens/auth/RecuperarSenha';

const Stack = createNativeStackNavigator<AuthStackParamList>();

/**
 * Stack de autenticação do Cliente — Épico 0, Story 0.3 (AC1).
 * Inventário de telas alinhado à Story 0.4.
 *
 * Rota inicial condicional (Story 2.1, AC4c): `react-navigation` não aceita
 * `initialRouteName` reativo após o primeiro mount, então o navigator só é
 * montado depois que a flag `onboarding_visto` é conhecida (`getOnboardingVisto`,
 * leitura 100% local — sem chamada de rede, AC4e). Enquanto isso, um estado
 * de loading transitório (não é uma rota nova do inventário) evita montar o
 * `Stack.Navigator` com o `initialRouteName` errado.
 */
export function AuthStack() {
  const [initialRoute, setInitialRoute] = useState<'Onboarding1' | 'Login' | null>(null);

  useEffect(() => {
    let mounted = true;
    getOnboardingVisto().then((visto) => {
      if (mounted) {
        setInitialRoute(visto ? 'Login' : 'Onboarding1');
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (initialRoute === null) {
    // Leitura local do AsyncStorage — na prática imperceptível ao usuário.
    return <View style={{ flex: 1, backgroundColor: darkColors.bg.primary }} />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
      <Stack.Screen name="Onboarding1" component={Onboarding1} />
      <Stack.Screen name="Onboarding2" component={Onboarding2} />
      <Stack.Screen name="Onboarding3" component={Onboarding3} />
      <Stack.Screen name="CriarConta" component={CriarConta} />
      <Stack.Screen name="ConfirmacaoSMS" component={ConfirmacaoSMS} />
      <Stack.Screen name="Login" component={Login} />
      <Stack.Screen name="EsqueciSenha" component={EsqueciSenha} />
      {/* Story 2.7 (AC3) — única rota receptora do callback de recuperação. */}
      <Stack.Screen name="RecuperarSenha" component={RecuperarSenha} />
    </Stack.Navigator>
  );
}
