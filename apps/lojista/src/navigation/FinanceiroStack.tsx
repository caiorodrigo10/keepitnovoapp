import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { FinanceiroStackParamList } from './types';
import Dashboard from '../screens/financeiro/Dashboard';
import Vendas from '../screens/financeiro/Vendas';
import Carteira from '../screens/financeiro/Carteira';
import SolicitarSaque from '../screens/financeiro/SolicitarSaque';
import ExtratoFinanceiro from '../screens/financeiro/ExtratoFinanceiro';
import FormasRecebimento from '../screens/financeiro/FormasRecebimento';
import { FinanceiroProvider } from '../screens/financeiro/FinanceiroContext';

const Stack = createNativeStackNavigator<FinanceiroStackParamList>();

/**
 * Stack aninhada da tab "Financeiro" — Épico 0, Story 0.3 (AC1, AC3).
 * Inventário de telas alinhado à Story 0.11.
 *
 * Story 0.11 substitui os stubs por conteúdo real e envolve o navigator com
 * `FinanceiroProvider` para compartilhar carteira/saques/chave PIX entre as
 * 6 telas (5 originais + `Vendas`, nova rota — ver `navigation/types.ts`),
 * mesmo padrão de `PedidosStack`/`OrdersProvider` (Story 0.10).
 */
export function FinanceiroStack() {
  return (
    <FinanceiroProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Dashboard" component={Dashboard} />
        <Stack.Screen name="Vendas" component={Vendas} />
        <Stack.Screen name="Carteira" component={Carteira} />
        <Stack.Screen name="SolicitarSaque" component={SolicitarSaque} />
        <Stack.Screen name="ExtratoFinanceiro" component={ExtratoFinanceiro} />
        <Stack.Screen name="FormasRecebimento" component={FormasRecebimento} />
      </Stack.Navigator>
    </FinanceiroProvider>
  );
}
