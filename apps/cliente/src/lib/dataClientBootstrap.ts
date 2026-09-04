import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@keepit/supabase-client';
import { useEffect, useState } from 'react';
import { getDataClient, initializeDataClient, type DataClient } from '@keepit/core-data';

import { clienteMockStorage } from './clienteMockStorage';

/**
 * Story 2.7 (AC5) — chave dedicada em `AsyncStorage`, mesmo storage já
 * injetado no `createClient()` abaixo. Só um booleano de fluxo é
 * persistido aqui; URL, token e senha do link de recuperação nunca passam
 * por este módulo (permanecem só dentro de `auth.supabase.ts`/no SDK). A
 * persistência (em vez de estado em memória) é o que faz a marca
 * sobreviver a um restart do app enquanto a sessão de recuperação
 * (reidratada pelo próprio `supabase-js`) ainda existir — sem isso,
 * `onAuthStateChange` poderia promover o usuário para `Main` num
 * `INITIAL_SESSION` após reabrir o app no meio do fluxo.
 */
const PASSWORD_RECOVERY_STATE_KEY = '@keepit/auth/password-recovery-active';

const passwordRecoveryState = {
  async isActive(): Promise<boolean> {
    return (await AsyncStorage.getItem(PASSWORD_RECOVERY_STATE_KEY)) === 'true';
  },
  async activate(): Promise<void> {
    await AsyncStorage.setItem(PASSWORD_RECOVERY_STATE_KEY, 'true');
  },
  async clear(): Promise<void> {
    await AsyncStorage.removeItem(PASSWORD_RECOVERY_STATE_KEY);
  },
};

/**
 * Bootstrap do `DataClient` do app Cliente — Story 2.5.1 (AC4).
 *
 * [IDS] CREATE — não existe módulo de bootstrap de `DataClient` em nenhum
 * app hoje (`docs/architecture/06-session-persistence.md` §1.2 confirma:
 * zero import de `@keepit/supabase-client` em `apps/`). Este é
 * deliberadamente o ÚNICO lugar do app Cliente que importa
 * `@keepit/supabase-client`; o adapter de storage fica isolado em
 * `clienteMockStorage.ts`. Telas e hooks continuam importando só
 * `@keepit/core-data` (fronteira do Épico 0 preservada, ver §3.3 do
 * documento acima).
 *
 * **Efeito colateral no import.** Este módulo cria `dataClientReady` na
 * avaliação (antes de qualquer render). Precisa ser o PRIMEIRO import de
 * `App.tsx` — antes do import de `RootNavigator` — para iniciar a hidratação
 * antes que qualquer consumidor de `getDataClient()` seja montado.
 *
 * **`EXPO_PUBLIC_DATA_SOURCE`** segue o mesmo padrão de prefixo Expo que
 * `@keepit/supabase-client` adota para URL/anon key nesta story (AC1) — é o
 * único jeito de uma env var chegar inlineada no bundle nativo/web do
 * Cliente (`process.env.DATA_SOURCE`, sem prefixo, não existe em runtime
 * RN). Ausente ou com qualquer valor diferente de `'supabase'`: o app
 * permanece 100% mock — o default seguro não muda para quem não configurou
 * nada, mesmo comportamento de todo o Épico 0-2.
 *
 * **Falha de configuração ou hidratação não pode travar o boot numa tela
 * branca.** O handler é instalado antes de executar qualquer inicialização:
 * primeiro tenta mock persistente e, se esse fallback também falhar, usa o
 * singleton mock volátil já criado. O aviso nunca inclui o erro original,
 * pois mensagens do SDK podem carregar URL ou outros dados sensíveis.
 */
function bootstrapDataClient(): Promise<DataClient> {
  return Promise.resolve()
    .then(() => {
      const dataSource =
        process.env.EXPO_PUBLIC_DATA_SOURCE?.trim() === 'supabase' ? 'supabase' : 'mock';

      if (dataSource !== 'supabase') {
        return initializeDataClient({ source: 'mock', clienteMockStorage });
      }

      const supabaseClient = createClient({
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
      });
      return initializeDataClient({ source: 'supabase', supabaseClient, passwordRecoveryState });
    })
    .catch(() => {
      console.warn('[dataClientBootstrap] inicialização indisponível; usando fallback mock.');
      return Promise.resolve()
        .then(() => initializeDataClient({ source: 'mock', clienteMockStorage }))
        .catch(() => getDataClient({ source: 'mock' }));
    });
}

export const dataClientReady: Promise<DataClient> = bootstrapDataClient();

/** Notifica readiness enquanto o consumidor estiver montado. */
export function subscribeToDataClientReady(
  readiness: Promise<unknown>,
  onReady: () => void,
): () => void {
  let mounted = true;
  const notifyWhenMounted = () => {
    if (mounted) {
      onReady();
    }
  };
  void readiness.then(notifyWhenMounted, notifyWhenMounted).catch(() => undefined);

  return () => {
    mounted = false;
  };
}

/** Expõe o estado de conclusão do bootstrap para o root React. */
export function useDataClientReady(): boolean {
  const [dataReady, setDataReady] = useState(false);

  useEffect(
    () => subscribeToDataClientReady(dataClientReady, () => setDataReady(true)),
    [],
  );

  return dataReady;
}
