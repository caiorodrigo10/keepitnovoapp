import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { Cliente } from '@keepit/core-data';
import { getDataClient } from '@keepit/core-data';
import { darkColors } from '@keepit/ui-tokens';

import type { RootStackParamList } from './types';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import ModalCPF from '../screens/modals/ModalCPF';
import ModalConfirmarPin from '../screens/modals/ModalConfirmarPin';
import ModalPermissaoPush from '../screens/modals/ModalPermissaoPush';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Story 2.6 (AC7) — "aproximadamente 5 segundos" conforme a AC. */
const SESSION_TIMEOUT_MS = 5000;

/**
 * Navigator raiz do Cliente — Épico 0, Story 0.3 (AC1, AC3, AC4, AC5).
 *
 * **Story 2.3.1 (fecha REL-006 do gate da Story 2.3):** decide entre
 * `AuthStack` (deslogado) e `Main` (`MainTabs`, logado) via estado de
 * sessão observado em `getDataClient().auth.onAuthStateChange(...)`
 * (assinado no mount, cancelado no unmount) — não mais via o guard stub
 * estático de `apps/cliente/src/navigation/authGuard.ts` (função pura sem
 * estado), que nunca refletia a sessão real e mantinha `Auth`/`Main`
 * mutuamente exclusivos de forma incorreta (ver `docs/stories/2.3.1.story.md`,
 * "O problema").
 *
 * `cliente === undefined` = estado inicial, ainda não se sabe se há sessão
 * (AC4: nem `Auth` nem `Main` montam — tela transitória em branco, mesmo
 * padrão de `AuthStack.tsx` para a flag de onboarding). `cliente === null`
 * = sem sessão → `Auth`. `cliente` truthy = com sessão → `Main`.
 *
 * **AC7 — falha ao assinar não pode travar o app numa tela em branco.**
 * `onAuthStateChange` pode lançar de forma síncrona (`createClient()` de
 * `@keepit/supabase-client` lança se `SUPABASE_URL`/`SUPABASE_ANON_KEY`
 * estiverem ausentes — esta é a primeira chamada de rede no boot do app).
 * Em caso de exceção, degrada para `setCliente(null)` (`Auth`) com um
 * `console.warn` — sem retry, sem backoff (princípio nº2 do `CLAUDE.md`).
 *
 * **Story 2.6 (AC7, fecha REL-007 do gate 2.3.1).** Com persistência real
 * de sessão (Story 2.5.1), o primeiro evento de `onAuthStateChange` lê o
 * storage de forma assíncrona de verdade — pode nunca chegar (bug de
 * plataforma, storage corrompido). Um `setTimeout` de ~5s degrada para
 * `setCliente(null)` + `console.warn` (sem dado sensível) se `cliente`
 * ainda for `undefined` nesse momento. O timeout é cancelado (a) ao
 * receber o primeiro estado de sessão/sem sessão de `onAuthStateChange` —
 * via a flag `settled`, e (b) no unmount — mesmo padrão de cleanup de
 * `unsubscribe`. Não há novo timeout por re-render: o efeito roda uma
 * única vez (deps `[]`), igual ao resto do hook.
 *
 * **AC6 — regressão de boot, caminho de acesso do desenvolvedor.** Antes
 * desta story, o stub `authGuard.ts` (com sua flag interna desligada por
 * padrão) fazia o app abrir direto na `MainTabs` (é assim que todo o
 * desenvolvimento visual do Épico 0 vem
 * sendo feito). Com `source: 'mock'` (default de `resolveDataSource`) e
 * `db.sessionClienteId: null` no seed (`packages/core-data/src/mock/db.ts`),
 * o app agora abre no `Auth` — comportamento correto, mas quem for
 * desenvolver telas internas com o mock precisa entrar por
 * `Auth → CriarConta` (o `signUp` do mock seta `db.sessionClienteId` sem
 * rede, `onAuthStateChange` dispara, `Main` monta). **Não** existe bypass
 * por flag para isso, e **não** foi semeada sessão no mock `db` — isso
 * contaminaria outros consumidores do mock (ver Dev Agent Record da Story
 * 2.3.1 para o registro completo).
 */
export function RootNavigator() {
  const [cliente, setCliente] = useState<Cliente | null | undefined>(undefined);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let settled = false;

    // Story 2.6 (AC7): degrada para "sem sessão" se o 1º estado não chegar
    // em ~5s — cancelado ao receber sessão/sem sessão e no unmount.
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.warn('[RootNavigator] onAuthStateChange não emitiu o primeiro estado em ~5s — assumindo sem sessão.');
      setCliente(null);
    }, SESSION_TIMEOUT_MS);

    function handleAuthStateChange(next: Cliente | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      setCliente(next);
    }

    try {
      unsubscribe = getDataClient().auth.onAuthStateChange(handleAuthStateChange);
    } catch (error) {
      // AC7 — sem retry/backoff, degrada para "sem sessão".
      console.warn('[RootNavigator] falha ao assinar onAuthStateChange:', error);
      settled = true;
      clearTimeout(timeoutId);
      setCliente(null);
    }

    return () => {
      clearTimeout(timeoutId);
      unsubscribe?.();
    };
  }, []);

  if (cliente === undefined) {
    return <View style={{ flex: 1, backgroundColor: darkColors.bg.primary }} />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {cliente ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Auth" component={AuthStack} />
      )}
      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="ModalCPF" component={ModalCPF} />
        <Stack.Screen name="ModalConfirmarPin" component={ModalConfirmarPin} />
        <Stack.Screen name="ModalPermissaoPush" component={ModalPermissaoPush} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
