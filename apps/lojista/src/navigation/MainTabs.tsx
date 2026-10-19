import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import type { MainTabParamList } from './types';
import { PedidosStack } from './PedidosStack';
import { CatalogoStack } from './CatalogoStack';
import { FinanceiroStack } from './FinanceiroStack';
import { PerfilStack } from './PerfilStack';
import { darkColors } from '@keepit/ui-tokens';

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * Tab navigator principal do Lojista — Épico 0, Story 0.3 (AC1).
 * 4 tabs, cada uma com uma stack aninhada própria: Pedidos, Catálogo,
 * Financeiro, Perfil.
 *
 * [IDS] ADAPT — `tabBarIcon` via `@expo/vector-icons` (débito de fidelidade
 * visual pós-Stories 0.8-0.11): antes nenhum ícone era renderizado na tab
 * bar. Fiel a `lojista-02-pedidos.png`/`lojista-01-painel.png` (recibo/
 * grade/carteira/pessoa), mesmo padrão de `apps/cliente/MainTabs.tsx`.
 */
export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: darkColors.accent.brand,
        tabBarInactiveTintColor: darkColors.text.tertiary,
        tabBarStyle: { backgroundColor: darkColors.bg.primary },
      }}
    >
      <Tab.Screen
        name="PedidosTab"
        component={PedidosStack}
        options={{
          title: 'Pedidos',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'receipt' : 'receipt-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="CatalogoTab"
        component={CatalogoStack}
        options={{
          title: 'Catálogo',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="FinanceiroTab"
        component={FinanceiroStack}
        options={{
          title: 'Financeiro',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'wallet' : 'wallet-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="PerfilTab"
        component={PerfilStack}
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
