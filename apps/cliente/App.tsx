// PRIMEIRO import do arquivo, deliberadamente: inicia a hidratação antes que
// qualquer consumidor de `getDataClient()` seja montado.
import { useDataClientBootstrap } from './src/lib/dataClientBootstrap';

import { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getDataClient } from '@keepit/core-data';
import { fonts } from '@keepit/ui-tokens';

import { SimulatedStateBanner } from './src/components/qa/SimulatedStateBanner';
import { QA_BUILD_ENABLED } from './src/config/buildInfo';
import { CartProvider } from './src/context/CartContext';
import { QaScenarioProvider } from './src/context/QaScenarioContext';
import { canMountReadyApp } from './src/lib/appReadiness';
import { isQaRuntimeEnabled } from './src/lib/qaAccess';
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
  const dataClient = useDataClientBootstrap();
  const [fontsLoaded, fontError] = useFonts(fonts);

  if (dataClient.status === 'error') {
    return <DataClientUnavailable onRetry={dataClient.retry} />;
  }

  // Espera as fontes carregarem no nativo; se o carregamento falhar (ex.: alvo
  // web onde o .ttf não decodifica), renderiza mesmo assim com fonte fallback
  // em vez de travar em tela branca.
  if (!canMountReadyApp(dataClient.status === 'ready', fontsLoaded, Boolean(fontError))) {
    return null;
  }

  return <ReadyApp />;
}

function DataClientUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <SafeAreaProvider>
      <View style={styles.unavailableContainer} accessibilityRole="alert">
        <Text style={styles.unavailableTitle}>Serviço indisponível</Text>
        <Text style={styles.unavailableMessage}>
          Não foi possível conectar aos dados. Verifique a configuração e tente novamente.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={styles.retryButton}
        >
          <Text style={styles.retryButtonText}>Tentar novamente</Text>
        </Pressable>
      </View>
    </SafeAreaProvider>
  );
}

function ReadyApp() {
  const client = getDataClient();
  const linking = useMemo(() => createPasswordRecoveryLinking(client.auth, Linking), [client]);
  const qaEnabled = isQaRuntimeEnabled(QA_BUILD_ENABLED, client.demoScenario);
  const navigation = (
    <NavigationContainer linking={linking}>
      <RootNavigator />
    </NavigationContainer>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <CartProvider>
          {qaEnabled ? (
            <QaScenarioProvider>
              <SimulatedStateBanner />
              {navigation}
            </QaScenarioProvider>
          ) : (
            navigation
          )}
          <StatusBar style="dark" />
        </CartProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  unavailableContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F7F7F7',
  },
  unavailableTitle: {
    color: '#1F1F1F',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  unavailableMessage: {
    marginTop: 12,
    color: '#5F5F5F',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 24,
    borderRadius: 10,
    backgroundColor: '#1F6B45',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
