import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { AccountDeletionRecord, Cliente } from '@keepit/core-data';
import { getDataClient } from '@keepit/core-data';
import { darkColors } from '@keepit/ui-tokens';

import { FavoritesProvider } from '../context/FavoritesContext';
import {
  createAccountDeletionLookupCoordinator,
  isAccountDeletionGuardSessionCurrent,
  resolveAccountRoute,
  setAccountDeletionGuardSession,
  subscribeAccountDeletionPersisted,
  type AccountDeletionLookup,
} from '../lib/accountDeletionRoute';
import type { RootStackParamList } from './types';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import ExclusaoAgendada from '../screens/auth/ExclusaoAgendada';
import ModalCPF from '../screens/modals/ModalCPF';
import ModalConfirmarPin from '../screens/modals/ModalConfirmarPin';
import ModalPagamentoPix from '../screens/modals/ModalPagamentoPix';
import ModalPermissaoPush from '../screens/modals/ModalPermissaoPush';
import ModalProcessandoPagamento from '../screens/modals/ModalProcessandoPagamento';

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
 * = sem sessão → `Auth`. Uma sessão só monta `Main` depois que
 * `accountDeletion.status()` resolve sem exclusão ativa; loading, erro e
 * qualquer estado não cancelado montam apenas `ScheduledDeletion`.
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
  const [deletionLookup, setDeletionLookup] = useState<AccountDeletionLookup>({ status: 'loading' });
  const deletionLookupCoordinatorRef = useRef(createAccountDeletionLookupCoordinator());
  const activeClienteIdRef = useRef<string | null>(null);

  const commitAccountDeletion = useCallback((deletion: AccountDeletionRecord | null) => {
    setDeletionLookup(deletionLookupCoordinatorRef.current.commit(deletion));
  }, []);

  const loadAccountDeletion = useCallback(async () => {
    const { requestId, lookup } = deletionLookupCoordinatorRef.current.begin();
    setDeletionLookup(lookup);
    try {
      const deletion = await getDataClient().accountDeletion.status();
      const nextLookup = deletionLookupCoordinatorRef.current.complete(requestId, {
        status: 'resolved',
        deletion,
      });
      if (nextLookup) setDeletionLookup(nextLookup);
    } catch {
      const nextLookup = deletionLookupCoordinatorRef.current.complete(requestId, { status: 'failed' });
      if (nextLookup) setDeletionLookup(nextLookup);
    }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let settled = false;

    const unsubscribeDeletion = subscribeAccountDeletionPersisted(({ deletion, session }) => {
      if (
        activeClienteIdRef.current !== session.clienteId
        || !isAccountDeletionGuardSessionCurrent(session)
      ) return;
      // A mutação já foi persistida. Invalida qualquer status anterior antes
      // de desmontar Main, inclusive enquanto o sign-out ainda está pendente.
      commitAccountDeletion(deletion);
    });

    const appStateSubscription = AppState.addEventListener('change', (status) => {
      if (status === 'active' && activeClienteIdRef.current) {
        // Mudanças feitas em outra sessão/dispositivo são revalidadas ao
        // retornar ao app. `loadAccountDeletion` incrementa o request id, por
        // isso respostas sobrepostas/antigas nunca substituem a mais recente.
        void loadAccountDeletion();
      }
    });

    // Story 2.6 (AC7): degrada para "sem sessão" se o 1º estado não chegar
    // em ~5s — cancelado ao receber sessão/sem sessão e no unmount.
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      setAccountDeletionGuardSession(null);
      deletionLookupCoordinatorRef.current.commit(null);
      setDeletionLookup({ status: 'loading' });
      console.warn('[RootNavigator] onAuthStateChange não emitiu o primeiro estado em ~5s — assumindo sem sessão.');
      setCliente(null);
    }, SESSION_TIMEOUT_MS);

    function handleAuthStateChange(next: Cliente | null) {
      // O primeiro evento cancela o timeout de fallback (Story 2.6, AC7).
      // `settled` NÃO pode bloquear eventos seguintes: signUp/signIn/signOut
      // emitem novas sessões depois do 1º estado e PRECISAM re-renderizar
      // Auth<->Main (REL-008: o guard anterior engolia o SIGNED_IN pós-boot).
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
      }
      activeClienteIdRef.current = next?.id ?? null;
      setAccountDeletionGuardSession(next?.id ?? null);
      setCliente(next);
      if (next) {
        // O adapter também encaminha TOKEN_REFRESHED/USER_UPDATED. Revalidar
        // nesses eventos detecta mudança externa da mesma sessão sem polling;
        // a consulta não altera auth, portanto não forma loop.
        void loadAccountDeletion();
      } else {
        deletionLookupCoordinatorRef.current.commit(null);
        setDeletionLookup({ status: 'loading' });
      }
    }

    try {
      unsubscribe = getDataClient().auth.onAuthStateChange(handleAuthStateChange);
    } catch (error) {
      // AC7 — sem retry/backoff, degrada para "sem sessão".
      console.warn('[RootNavigator] falha ao assinar onAuthStateChange:', error);
      settled = true;
      clearTimeout(timeoutId);
      setAccountDeletionGuardSession(null);
      deletionLookupCoordinatorRef.current.commit(null);
      setDeletionLookup({ status: 'loading' });
      setCliente(null);
    }

    return () => {
      clearTimeout(timeoutId);
      setAccountDeletionGuardSession(null);
      deletionLookupCoordinatorRef.current.commit(null);
      appStateSubscription.remove();
      unsubscribeDeletion();
      unsubscribe?.();
    };
  }, [commitAccountDeletion, loadAccountDeletion]);

  if (cliente === undefined) {
    return <View style={{ flex: 1, backgroundColor: darkColors.bg.primary }} />;
  }

  const route = resolveAccountRoute(cliente, deletionLookup);

  if (route === 'Auth' || !cliente) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Auth" component={AuthStack} />
      </Stack.Navigator>
    );
  }

  if (route === 'ScheduledDeletion') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="ScheduledDeletion">
          {(props) => (
            <ExclusaoAgendada
              {...props}
              lookup={deletionLookup}
              onDeletionChange={commitAccountDeletion}
              onRetry={() => void loadAccountDeletion()}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    );
  }

  return (
    <FavoritesProvider key={cliente.id}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Group screenOptions={{ presentation: 'modal' }}>
          <Stack.Screen name="ModalCPF" component={ModalCPF} />
          <Stack.Screen name="ModalConfirmarPin" component={ModalConfirmarPin} />
          {/* Story 6.7.1 — feedback visual de pagamento (PIX/cartão), entre "Pagar" e ModalConfirmarPin. */}
          <Stack.Screen name="ModalPagamentoPix" component={ModalPagamentoPix} />
          <Stack.Screen name="ModalProcessandoPagamento" component={ModalProcessandoPagamento} />
          <Stack.Screen name="ModalPermissaoPush" component={ModalPermissaoPush} />
        </Stack.Group>
      </Stack.Navigator>
    </FavoritesProvider>
  );
}
