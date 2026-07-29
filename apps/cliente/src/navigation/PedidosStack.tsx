import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { PedidosStackParamList } from './types';
import MeusPedidos from '../screens/pedidos/MeusPedidos';
import ChegueiAoHub from '../screens/pedidos/ChegueiAoHub';
import Recibo from '../screens/pedidos/Recibo';
import CancelarPedido from '../screens/pedidos/CancelarPedido';
import LojistaNaoVeio from '../screens/pedidos/LojistaNaoVeio';

const Stack = createNativeStackNavigator<PedidosStackParamList>();

/**
 * Stack aninhada da tab "Meus Pedidos" — Épico 0, Story 0.3 (AC1, AC3).
 * Inventário de telas alinhado à Story 0.7.
 *
 * `ConfirmarRetiradaPin` não é uma rota desta stack: o fluxo de "Confirmar
 * retirada / PIN" do Cliente é o modal raiz `ModalConfirmarPin` (AC4),
 * acionado a partir de qualquer tela desta stack. Ver decisão em
 * `apps/cliente/src/navigation/types.ts`.
 */
export function PedidosStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MeusPedidos" component={MeusPedidos} />
      <Stack.Screen name="ChegueiAoHub" component={ChegueiAoHub} />
      <Stack.Screen name="Recibo" component={Recibo} />
      <Stack.Screen name="CancelarPedido" component={CancelarPedido} />
      <Stack.Screen name="LojistaNaoVeio" component={LojistaNaoVeio} />
    </Stack.Navigator>
  );
}
