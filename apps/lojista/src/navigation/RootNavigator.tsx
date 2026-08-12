import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { darkColors } from '@keepit/ui-tokens';

import type { RootStackParamList } from './types';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import type { LojistaSessao } from './lojistaSession';
import { onLojistaSessionChange } from './lojistaSession';
import ModalPermissaoPush from '../screens/modals/ModalPermissaoPush';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Navigator raiz do Lojista — Épico 0, Story 0.3 (AC1, AC3, AC4, AC5).
 *
 * **Story 9.0.4:** decide entre `AuthStack` (deslogado) e `Main` (`MainTabs`,
 * logado) via a sessão mock local do Lojista observada em
 * `onLojistaSessionChange` (`./lojistaSession`) — não mais via o guard stub
 * estático `isAuthenticated()` de `./authGuard.ts` (que sempre retornava
 * `true` e nunca refletia sessão nenhuma).
 *
 * `sessao === undefined` = estado inicial, ainda não se sabe se há sessão —
 * nem `Auth` nem `Main` montam, view em branco transitória. `sessao === null`
 * = sem sessão → `Auth`. `sessao` truthy = com sessão → `Main`.
 *
 * A assinatura de `onLojistaSessionChange` é protegida por `try/catch`: se
 * lançar de forma síncrona, degrada para `setSessao(null)` (`Auth`) com
 * `console.warn`, sem retry/backoff — mesmo cuidado do `RootNavigator` do
 * Cliente (Story 2.3.1, AC7).
 */
export function RootNavigator() {
  const [sessao, setSessao] = useState<LojistaSessao | null | undefined>(undefined);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = onLojistaSessionChange(setSessao);
    } catch (error) {
      console.warn('[RootNavigator] falha ao assinar onLojistaSessionChange:', error);
      setSessao(null);
    }
    return () => {
      unsubscribe?.();
    };
  }, []);

  if (sessao === undefined) {
    return <View style={{ flex: 1, backgroundColor: darkColors.bg.primary }} />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {sessao ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Auth" component={AuthStack} />
      )}
      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="ModalPermissaoPush" component={ModalPermissaoPush} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
