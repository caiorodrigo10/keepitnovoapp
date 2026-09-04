// PRIMEIRO import do arquivo, deliberadamente: inicia a hidratação antes que
// qualquer consumidor de `getDataClient()` seja montado.
import { dataClientReady } from './src/lib/dataClientBootstrap';

import { useEffect, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getDataClient } from '@keepit/core-data';
import { fonts } from '@keepit/ui-tokens';

import { CartProvider } from './src/context/CartContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { createPasswordRecoveryLinking } from './src/navigation/passwordRecoveryLinking';

/**
 * Root do App Cliente — Épico 0, Story 0.1 (boot) + Story 0.3 (navegação).
 *
 * As fontes carregam antes de qualquer navegador montar (mesmo guard
 * `if (!fontsLoaded) return null` da Story 0.1). `RootNavigator` decide
 * entre `AuthStack` e `MainTabs` via `getDataClient().auth.onAuthStateChange`
 * (Story 2.3.1) — o `DataClient` consumido ali já foi configurado pelo
 * bootstrap importado no topo deste arquivo (Story 2.5.1).
 *
 * **Story 2.7 (AC3, AC5).** `linking` de `NavigationContainer` usa
 * `createPasswordRecoveryLinking` para tratar o callback de recuperação de
 * senha antes de qualquer token/URL chegar ao estado de navegação (ver
 * JSDoc de `passwordRecoveryLinking.ts`). Memoizado (`useMemo`, deps `[]`)
 * porque `getDataClient()` já devolve o singleton estável configurado pelo
 * bootstrap — recriar o objeto de `linking` a cada render não muda o
 * comportamento, só evitaria uma alocação desnecessária.
 */
export default function App() {
  const [dataReady, setDataReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts(fonts);

  useEffect(() => {
    let mounted = true;
    const markDataReady = () => {
      if (mounted) {
        setDataReady(true);
      }
    };
    void dataClientReady.then(markDataReady, markDataReady);

    return () => {
      mounted = false;
    };
  }, []);

  // Espera as fontes carregarem no nativo; se o carregamento falhar (ex.: alvo
  // web onde o .ttf não decodifica), renderiza mesmo assim com fonte fallback
  // em vez de travar em tela branca.
  if (!dataReady || (!fontsLoaded && !fontError)) {
    return null;
  }

  return <ReadyApp />;
}

function ReadyApp() {
  const linking = useMemo(() => createPasswordRecoveryLinking(getDataClient().auth, Linking), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <CartProvider>
          <NavigationContainer linking={linking}>
            <RootNavigator />
          </NavigationContainer>
          <StatusBar style="dark" />
        </CartProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
