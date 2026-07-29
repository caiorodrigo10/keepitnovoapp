import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { AuthStackParamList } from './types';
import Onboarding1 from '../screens/auth/Onboarding1';
import Onboarding2 from '../screens/auth/Onboarding2';
import Onboarding3 from '../screens/auth/Onboarding3';
import CriarConta from '../screens/auth/CriarConta';
import ConfirmacaoSMS from '../screens/auth/ConfirmacaoSMS';
import Login from '../screens/auth/Login';
import EsqueciSenha from '../screens/auth/EsqueciSenha';

const Stack = createNativeStackNavigator<AuthStackParamList>();

/**
 * Stack de autenticação do Cliente — Épico 0, Story 0.3 (AC1).
 * Inventário de telas alinhado à Story 0.4.
 */
export function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Onboarding1">
      <Stack.Screen name="Onboarding1" component={Onboarding1} />
      <Stack.Screen name="Onboarding2" component={Onboarding2} />
      <Stack.Screen name="Onboarding3" component={Onboarding3} />
      <Stack.Screen name="CriarConta" component={CriarConta} />
      <Stack.Screen name="ConfirmacaoSMS" component={ConfirmacaoSMS} />
      <Stack.Screen name="Login" component={Login} />
      <Stack.Screen name="EsqueciSenha" component={EsqueciSenha} />
    </Stack.Navigator>
  );
}
