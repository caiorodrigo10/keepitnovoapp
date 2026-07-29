import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { PerfilStackParamList } from './types';
import Perfil from '../screens/perfil/Perfil';
import Configuracoes from '../screens/perfil/Configuracoes';
import ExcluirConta from '../screens/perfil/ExcluirConta';

const Stack = createNativeStackNavigator<PerfilStackParamList>();

/**
 * Stack aninhada da tab "Perfil" — Épico 0, Story 0.3 (AC1, AC3).
 */
export function PerfilStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Perfil" component={Perfil} />
      <Stack.Screen name="Configuracoes" component={Configuracoes} />
      <Stack.Screen name="ExcluirConta" component={ExcluirConta} />
    </Stack.Navigator>
  );
}
