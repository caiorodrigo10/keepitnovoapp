import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { PedidosStackParamList } from './types';
import NovosPedidos from '../screens/pedidos/NovosPedidos';
import AceitarPedido from '../screens/pedidos/AceitarPedido';
import RecusarPedido from '../screens/pedidos/RecusarPedido';
import DetalheSepararPedido from '../screens/pedidos/DetalheSepararPedido';
import SaindoParaHub from '../screens/pedidos/SaindoParaHub';
import ChegueiAoHub from '../screens/pedidos/ChegueiAoHub';
import DigitarPin from '../screens/pedidos/DigitarPin';
import ConfirmarRetirada from '../screens/pedidos/ConfirmarRetirada';
import Concluidos from '../screens/pedidos/Concluidos';
import ClienteNaoApareceu from '../screens/pedidos/ClienteNaoApareceu';
import { OrdersProvider } from '../screens/pedidos/OrdersContext';

const Stack = createNativeStackNavigator<PedidosStackParamList>();

/**
 * Stack aninhada da tab "Pedidos" — Épico 0, Story 0.3 (AC1, AC3).
 * Inventário de telas alinhado à Story 0.10, que substitui os stubs por
 * conteúdo real e envolve o navigator com `OrdersProvider` (Task 1) para
 * compartilhar a máquina de estados dos pedidos entre as 10 telas, mesmo
 * padrão de `CatalogoStack`/`ProductCatalogProvider` (Story 0.9).
 *
 * `DigitarPin` é tela cheia (teclado numérico), não modal — ver decisão em
 * `apps/lojista/src/navigation/types.ts`.
 */
export function PedidosStack() {
  return (
    <OrdersProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="NovosPedidos" component={NovosPedidos} />
        <Stack.Screen name="AceitarPedido" component={AceitarPedido} />
        <Stack.Screen name="RecusarPedido" component={RecusarPedido} />
        <Stack.Screen name="DetalheSepararPedido" component={DetalheSepararPedido} />
        <Stack.Screen name="SaindoParaHub" component={SaindoParaHub} />
        <Stack.Screen name="ChegueiAoHub" component={ChegueiAoHub} />
        <Stack.Screen name="DigitarPin" component={DigitarPin} />
        <Stack.Screen name="ConfirmarRetirada" component={ConfirmarRetirada} />
        <Stack.Screen name="Concluidos" component={Concluidos} />
        <Stack.Screen name="ClienteNaoApareceu" component={ClienteNaoApareceu} />
      </Stack.Navigator>
    </OrdersProvider>
  );
}
