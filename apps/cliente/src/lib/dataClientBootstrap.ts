import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@keepit/supabase-client';
import { useEffect, useState } from 'react';
import { initializeDataClient, recoverDataClient, type DataClient } from '@keepit/core-data';

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
 * branca.** Cada tentativa principal é limitada a 5 s. Uma falha no modo
 * Supabase recupera com um singleton mock persistente novo; uma falha no
 * próprio mock persistente recupera com um singleton volátil novo. O aviso
 * nunca inclui o erro original, pois mensagens do SDK podem carregar URL ou
 * outros dados sensíveis.
 */
const DATA_CLIENT_BOOTSTRAP_TIMEOUT_MS = 5_000;

export interface BootstrapDataClientOptions {
  timeoutMs?: number;
}

function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('DataClient bootstrap timeout')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export async function bootstrapDataClient(
  options: BootstrapDataClientOptions = {},
): Promise<DataClient> {
  const timeoutMs = options.timeoutMs ?? DATA_CLIENT_BOOTSTRAP_TIMEOUT_MS;
  const dataSource =
    process.env.EXPO_PUBLIC_DATA_SOURCE?.trim() === 'supabase' ? 'supabase' : 'mock';

  try {
    if (dataSource === 'mock') {
      return await settleWithin(
        initializeDataClient({ source: 'mock', clienteMockStorage }),
        timeoutMs,
      );
    }

    const supabaseClient = createClient({
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
    });
    return await settleWithin(
      initializeDataClient({ source: 'supabase', supabaseClient, passwordRecoveryState }),
      timeoutMs,
    );
  } catch {
    console.warn('[dataClientBootstrap] inicialização indisponível; usando fallback mock.');
    const fallbackOptions =
      dataSource === 'supabase'
        ? { source: 'mock' as const, clienteMockStorage }
        : { source: 'mock' as const };
    try {
      return await settleWithin(recoverDataClient(fallbackOptions), timeoutMs);
    } catch {
      return recoverDataClient({ source: 'mock' });
    }
  }
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
