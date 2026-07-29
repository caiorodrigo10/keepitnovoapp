import { NavigationContainer } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { fonts } from '@keepit/ui-tokens';

import { CartProvider } from './src/context/CartContext';
import { RootNavigator } from './src/navigation/RootNavigator';

/**
 * Root do App Cliente — Épico 0, Story 0.1 (boot) + Story 0.3 (navegação).
 *
 * As fontes carregam antes de qualquer navegador montar (mesmo guard
 * `if (!fontsLoaded) return null` da Story 0.1). Nenhuma chamada de
 * rede/backend — `RootNavigator` decide entre `AuthStack` e `MainTabs` via
 * guard stub, sem consumir `packages/core-data`.
 */
export default function App() {
  const [fontsLoaded, fontError] = useFonts(fonts);

  // Espera as fontes carregarem no nativo; se o carregamento falhar (ex.: alvo
  // web onde o .ttf não decodifica), renderiza mesmo assim com fonte fallback
  // em vez de travar em tela branca.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <CartProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
          <StatusBar style="dark" />
        </CartProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
