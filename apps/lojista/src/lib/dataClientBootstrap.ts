import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@keepit/supabase-client';
import { getDataClient } from '@keepit/core-data';

/**
 * Bootstrap do `DataClient` do app Lojista — Story 3.2 (Dependencies, item 4;
 * "Bootstrap do `DataClient` real do app Lojista").
 *
 * [IDS] ADAPT de `apps/cliente/src/lib/dataClientBootstrap.ts` (Story 2.5.1).
 * Mesma estrutura (gate por `EXPO_PUBLIC_DATA_SOURCE`, `AsyncStorage` como
 * storage — [AUTO-DECISION] mesma escolha do Cliente → reason: a mission
 * desta Story pede explicitamente "espelhe a decisão do Cliente: AsyncStorage
 * (não SecureStore — fora de escopo)"; a Story 2.5.1 já fixou essa decisão
 * para o app Cliente, e nada nesta Story exige um storage diferente para o
 * Lojista), fallback silencioso para mock sem tela branca.
 *
 * **Diferença deliberada:** SEM `passwordRecoveryState` — esse conceito é
 * exclusivo do fluxo de recuperação de senha do Cliente (Story 2.7), que não
 * existe no Lojista nesta fatia (login real do Lojista é a Story 3.10, fora
 * deste lote). Passar `undefined` para `getDataClient()` mantém o adapter de
 * `auth` (Cliente) usando seu próprio estado em memória — o Lojista não usa
 * `auth`, usa `lojistaAuth` (Story 3.2), que não tem esse conceito.
 *
 * **Sessão mock do Lojista preservada.** Este bootstrap só afeta
 * `getDataClient()` (o `DataClient` de `packages/core-data`, consumido pelo
 * novo `lojistaAuth.signUp`) — `lojistaSession.ts` (sessão mock local do
 * Lojista, Story 9.0.4) continua inteiramente à parte, sem nenhuma relação
 * com este módulo. Login real do Lojista (Story 3.10) decidirá se/como os
 * dois se reconciliam.
 *
 * Precisa ser o PRIMEIRO import de `App.tsx` (mesmo motivo documentado no
 * Cliente): `getDataClient()` memoiza a configuração da primeira chamada.
 */
const dataSource = process.env.EXPO_PUBLIC_DATA_SOURCE?.trim() === 'supabase' ? 'supabase' : 'mock';

if (dataSource === 'supabase') {
  try {
    const supabaseClient = createClient({
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
    });
    getDataClient({ source: 'supabase', supabaseClient });
  } catch (error) {
    console.warn(
      '[dataClientBootstrap] falha ao inicializar o client Supabase — caindo para mock:',
      error,
    );
    getDataClient({ source: 'mock' });
  }
}
