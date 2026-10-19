import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import type { MainTabParamList } from './types';
import { HomeStack } from './HomeStack';
import { PedidosStack } from './PedidosStack';
import { PerfilStack } from './PerfilStack';
import { lightColors } from '@keepit/ui-tokens';

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * Tab navigator principal do Cliente — Épico 0, Story 0.3 (AC1).
 * 3 tabs, cada uma com uma stack aninhada própria: Home, Meus Pedidos, Perfil.
 *
 * [IDS] ADAPT — `tabBarIcon` via `@expo/vector-icons` (Story 0.5, débito de
 * fidelidade visual): antes nenhum ícone era renderizado na tab bar. Fiel a
 * `cliente-02-home-hub.png`/`cliente-07-pedidos.png` (casa/recibo/pessoa),
 * dentro do subconjunto de 3 tabs já decidido na Story 0.3.
 */
export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: lightColors.accent.brand,
        tabBarInactiveTintColor: lightColors.text.tertiary,
        tabBarStyle: { backgroundColor: lightColors.bg.primary },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="PedidosTab"
        component={PedidosStack}
        options={{
          title: 'Meus Pedidos',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'receipt' : 'receipt-outline'} color={color} size={size} />
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
