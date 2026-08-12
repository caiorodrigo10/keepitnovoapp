import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@keepit/supabase-client';
import { getDataClient } from '@keepit/core-data';

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
 * `@keepit/supabase-client` e `AsyncStorage` — telas e hooks continuam
 * importando só `@keepit/core-data` (fronteira do Épico 0 preservada, ver
 * §3.3 do documento acima).
 *
 * **Efeito colateral no import.** Este módulo roda seu corpo top-level na
 * avaliação do módulo (antes de qualquer render/`useEffect`). Precisa ser o
 * PRIMEIRO import de `App.tsx` — antes do import de `RootNavigator` — porque
 * `getDataClient()` memoiza a configuração da primeira chamada (Story 2.5.1,
 * "Sequência obrigatória" #1); um `useEffect` chegaria tarde demais.
 *
 * **`EXPO_PUBLIC_DATA_SOURCE`** segue o mesmo padrão de prefixo Expo que
 * `@keepit/supabase-client` adota para URL/anon key nesta story (AC1) — é o
 * único jeito de uma env var chegar inlineada no bundle nativo/web do
 * Cliente (`process.env.DATA_SOURCE`, sem prefixo, não existe em runtime
 * RN). Ausente ou com qualquer valor diferente de `'supabase'`: o app
 * permanece 100% mock — o default seguro não muda para quem não configurou
 * nada, mesmo comportamento de todo o Épico 0-2.
 *
 * **Falha ao criar o client Supabase não pode travar o boot numa tela
 * branca** (CodeRabbit Focus Areas da story). Se `createClient()` lançar
 * (ex.: `EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY` ausentes), este módulo
 * degrada para mock com um `console.warn` — mesmo espírito do guard de AC7
 * em `RootNavigator.tsx` (Story 2.3.1), sem retry/backoff (princípio nº2 do
 * `CLAUDE.md`).
 */
const dataSource = process.env.EXPO_PUBLIC_DATA_SOURCE?.trim() === 'supabase' ? 'supabase' : 'mock';

if (dataSource === 'supabase') {
  try {
    const supabaseClient = createClient({
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
    });
    getDataClient({ source: 'supabase', supabaseClient, passwordRecoveryState });
  } catch (error) {
    console.warn(
      '[dataClientBootstrap] falha ao inicializar o client Supabase — caindo para mock:',
      error,
    );
    getDataClient({ source: 'mock' });
  }
}
