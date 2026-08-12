import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { PerfilStackParamList } from './types';
import Perfil from '../screens/perfil/Perfil';
import ExcluirConta from '../screens/perfil/ExcluirConta';

const Stack = createNativeStackNavigator<PerfilStackParamList>();

/**
 * Stack aninhada da tab "Perfil" — Épico 0, Story 0.3 (AC1, AC3).
 *
 * **Story 2.8 (decisão 10.8, 2026-08-02):** rota `Configuracoes` removida —
 * não existe mais tela de Configurações separada. Toda a estrutura de menu
 * do frame 08 (Notificações, Ajuda & suporte, Hubs favoritos, Formas de
 * pagamento, Termos, Política) foi materializada dentro de `Perfil` com
 * navegação honesta (`Alert`, sem rota nova). `ExcluirConta` continua como
 * rota própria — é o único destino real fora de `Perfil` nesta stack,
 * exigido por compliance Apple 5.1.1(v).
 */
export function PerfilStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Perfil" component={Perfil} />
      <Stack.Screen name="ExcluirConta" component={ExcluirConta} />
    </Stack.Navigator>
  );
}
