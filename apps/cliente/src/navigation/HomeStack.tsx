import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { HomeStackParamList } from './types';
import Home from '../screens/home/Home';
import Hub from '../screens/home/Hub';
import Loja from '../screens/home/Loja';
import DetalheProduto from '../screens/home/DetalheProduto';
import BuscaProduto from '../screens/home/BuscaProduto';
import BuscaLoja from '../screens/home/BuscaLoja';
import Carrinho from '../screens/home/Carrinho';
import Checkout from '../screens/home/Checkout';
import EscolhaRetirada from '../screens/home/EscolhaRetirada';
import Pagamento from '../screens/home/Pagamento';
import AdicionarCartao from '../screens/home/AdicionarCartao';

const Stack = createNativeStackNavigator<HomeStackParamList>();

/**
 * Stack aninhada da tab "Home" — Épico 0, Story 0.3 (AC1, AC3).
 * Inventário de telas alinhado às Stories 0.5 e 0.6.
 */
export function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={Home} />
      <Stack.Screen name="Hub" component={Hub} />
      <Stack.Screen name="Loja" component={Loja} />
      <Stack.Screen name="DetalheProduto" component={DetalheProduto} />
      <Stack.Screen name="BuscaProduto" component={BuscaProduto} />
      <Stack.Screen name="BuscaLoja" component={BuscaLoja} />
      <Stack.Screen name="Carrinho" component={Carrinho} />
      <Stack.Screen name="Checkout" component={Checkout} />
      <Stack.Screen name="EscolhaRetirada" component={EscolhaRetirada} />
      <Stack.Screen name="Pagamento" component={Pagamento} />
      <Stack.Screen name="AdicionarCartao" component={AdicionarCartao} />
    </Stack.Navigator>
  );
}
