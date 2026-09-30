// Story 3.2 (Dependencies, item 4) — PRIMEIRO import do arquivo,
// deliberadamente. Roda seu efeito colateral (bootstrap do `DataClient`, com
// AsyncStorage quando `EXPO_PUBLIC_DATA_SOURCE=supabase`) na avaliação do
// módulo, antes de qualquer outro import — mesma sequência obrigatória
// documentada em `apps/cliente/App.tsx` (Story 2.5.1).
import { useDataClientBootstrap } from './src/lib/dataClientBootstrap';

import { NavigationContainer } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { fonts } from '@keepit/ui-tokens';

import { RootNavigator } from './src/navigation/RootNavigator';

/**
 * Root do App Lojista — Épico 0, Story 0.1 (boot) + Story 0.3 (navegação).
 *
 * As fontes carregam antes de qualquer navegador montar (mesmo guard
 * `if (!fontsLoaded) return null` da Story 0.1). `RootNavigator` continua
 * decidindo entre `AuthStack` e `MainTabs` via guard mock local
 * (`lojistaSession.ts`, Story 9.0.4) — a Story 3.10 (login real do Lojista)
 * não substitui esse mecanismo, só passa a controlar QUANDO ele é acionado
 * (ver JSDoc de `lojistaSession.ts`/`Login.tsx`). O `DataClient` configurado
 * pelo bootstrap importado no topo deste arquivo é usado por
 * `CadastroPasso1` (`lojistaAuth.signUp`) e, desde a Story 3.10, por
 * `Login`/`Configuracoes` (`lojistaAuth.signIn`/`signOut`,
 * `estabelecimentoCadastro.getMeuEstabelecimento`) — não pela navegação em
 * si.
 */
export default function App() {
  const dataClient = useDataClientBootstrap();
  const [fontsLoaded, fontError] = useFonts(fonts);

  if (dataClient.status === 'error') {
    return <DataClientUnavailable onRetry={dataClient.retry} />;
  }

  // Espera as fontes no nativo; se falhar (ex.: alvo web onde o .ttf não
  // decodifica), renderiza mesmo assim com fonte fallback em vez de travar.
  if (dataClient.status !== 'ready' || (!fontsLoaded && !fontError)) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function DataClientUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <SafeAreaProvider>
      <View style={styles.unavailableContainer} accessibilityRole="alert">
        <Text style={styles.unavailableTitle}>Serviço indisponível</Text>
        <Text style={styles.unavailableMessage}>
          Não foi possível conectar aos dados. Verifique a configuração e tente novamente.
        </Text>
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Tentar novamente</Text>
        </Pressable>
      </View>
    </SafeAreaProvider>
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
