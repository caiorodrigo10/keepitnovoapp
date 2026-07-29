import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { PerfilStackParamList } from './types';
import PerfilPublico from '../screens/perfil/PerfilPublico';
import Configuracoes from '../screens/perfil/Configuracoes';
import ExcluirConta from '../screens/perfil/ExcluirConta';
import { LojaPerfilProvider } from '../screens/perfil/LojaPerfilContext';

const Stack = createNativeStackNavigator<PerfilStackParamList>();

/**
 * Stack aninhada da tab "Perfil" — Épico 0, Story 0.3 (AC1, AC3).
 *
 * Story 0.8 substitui os stubs por conteúdo real e envolve o navigator com
 * `LojaPerfilProvider` para compartilhar o estado local do perfil da loja
 * entre `Configuracoes` e `PerfilPublico`, iniciando pela rota
 * `Configuracoes` (entrada natural da tab "Perfil").
 */
export function PerfilStack() {
  return (
    <LojaPerfilProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Configuracoes">
        <Stack.Screen name="Configuracoes" component={Configuracoes} />
        <Stack.Screen name="PerfilPublico" component={PerfilPublico} />
        <Stack.Screen name="ExcluirConta" component={ExcluirConta} />
      </Stack.Navigator>
    </LojaPerfilProvider>
  );
}
