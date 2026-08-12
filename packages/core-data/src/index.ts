import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import type { AdminPort } from './ports/admin.port';
import type { AnalyticsPort } from './ports/analytics.port';
import type { AuthPort, PasswordRecoveryState } from './ports/auth.port';
import type { EstabelecimentoCadastroPort } from './ports/estabelecimento-cadastro.port';
import type { HubPort } from './ports/hub.port';
import type { LojistaAuthPort } from './ports/lojista-auth.port';
import type { OrderPort } from './ports/order.port';
import type { ProductPort } from './ports/product.port';
import type { StorePort } from './ports/store.port';
import type { WalletPort } from './ports/wallet.port';

import { createAdminMock } from './mock/admin.mock';
import { createAnalyticsMock } from './mock/analytics.mock';
import { createAuthMock } from './mock/auth.mock';
import { createMockDb } from './mock/db';
import { createEstabelecimentoCadastroMock } from './mock/estabelecimento-cadastro.mock';
import { createHubMock } from './mock/hub.mock';
import { createLojistaAuthMock } from './mock/lojista-auth.mock';
import { createOrderMock } from './mock/order.mock';
import { createProductMock } from './mock/product.mock';
import { createStoreMock } from './mock/store.mock';
import { createWalletMock } from './mock/wallet.mock';

import { createAdminSupabase } from './supabase/admin.supabase';
import { createAnalyticsSupabase } from './supabase/analytics.supabase';
import { createAuthSupabase } from './supabase/auth.supabase';
import { createEstabelecimentoCadastroSupabase } from './supabase/estabelecimento-cadastro.supabase';
import { createHubSupabase } from './supabase/hub.supabase';
import { createLojistaAuthSupabase } from './supabase/lojista-auth.supabase';
import { createOrderSupabase } from './supabase/order.supabase';
import { createProductSupabase } from './supabase/product.supabase';
import { createStoreSupabase } from './supabase/store.supabase';
import { createWalletSupabase } from './supabase/wallet.supabase';

export type DataSource = 'mock' | 'supabase';

export interface CreateDataClientOptions {
  /** Default: `'mock'`. `DATA_SOURCE` de cada app (env var) pode alimentar este parâmetro no bootstrap. */
  source?: DataSource;
  /**
   * Story 2.5.1 (AC3). Só tem efeito com `source: 'supabase'` — instância
   * única de `SupabaseClient` repassada aos oito adapters Supabase, em vez
   * de cada um criar a sua própria via `createClient()` sem argumento.
   * Omitido: cada adapter mantém o comportamento anterior a esta story
   * (cria/memoiza seu próprio client internamente). Ver
   * `docs/architecture/06-session-persistence.md` §3.2.
   */
  supabaseClient?: SupabaseClient<Database>;
  /**
   * Story 2.7 (AC5). Só tem efeito com `source: 'supabase'` — repassado ao
   * adapter Supabase de `auth` para impedir que uma sessão de recuperação
   * de senha promova o usuário à área logada (ver `PasswordRecoveryState`).
   * Omitido: o adapter usa um marcador em memória local (suficiente para
   * testes; apps reais devem injetar um baseado em storage persistente,
   * ver `apps/cliente/src/lib/dataClientBootstrap.ts`).
   */
  passwordRecoveryState?: PasswordRecoveryState;
}

/**
 * Client de dados — expõe as 8 ports do Épico 0/1.10 (auth, hub, store,
 * product, order, wallet, admin, analytics). As telas (Story 0.4+) consomem
 * SÓ a port, nunca a implementação mock/Supabase diretamente.
 */
export interface DataClient {
  auth: AuthPort;
  hub: HubPort;
  store: StorePort;
  product: ProductPort;
  order: OrderPort;
  wallet: WalletPort;
  admin: AdminPort;
  /** Vendas/top produtos/extrato do Lojista (Story 1.10, Task 7) — CREATE justificado nas Dev Notes da story. */
  analytics: AnalyticsPort;
  /**
   * Story 3.2 (AC4, AC7) — CREATE justificado no JSDoc de `LojistaAuthPort`
   * (`ports/lojista-auth.port.ts`). Port dedicada e mínima (só `signUp`
   * nesta fatia) para a identidade de auth do lojista, deliberadamente
   * separada de `auth` (que é tipada em `Cliente`).
   */
  lojistaAuth: LojistaAuthPort;
  /**
   * Story 3.5 (AC2, AC3, AC4) — CREATE justificado no JSDoc de
   * `EstabelecimentoCadastroPort` (`ports/estabelecimento-cadastro.port.ts`).
   * Upload da fachada + criação atômica de `estabelecimentos`/
   * `estabelecimentos_horarios` via a RPC `criar_estabelecimento_completo`
   * (Passo 3 do cadastro do lojista) — deliberadamente separada de `store`
   * (tipado no domínio público de Descoberta do Cliente).
   */
  estabelecimentoCadastro: EstabelecimentoCadastroPort;
}

/**
 * Lê `DATA_SOURCE` de `process.env` como fallback quando `options.source` não
 * é passado explicitamente (Story 1.9, AC4). Nenhum app hoje passa
 * `{ source }` para `getDataClient()` — todas as chamadas em
 * `apps/cliente|lojista|admin/src/hooks` usam `getDataClient()` sem
 * argumento, então este é o único ponto em que a env var tem efeito prático
 * até uma story futura tocar o bootstrap dos apps. Default: `'mock'` quando
 * a env var está ausente, vazia, ou contém qualquer valor que não seja
 * exatamente `'supabase'`.
 */
function resolveDataSource(explicit?: DataSource): DataSource {
  if (explicit) {
    return explicit;
  }
  const envValue = process.env.DATA_SOURCE?.trim();
  return envValue === 'supabase' ? 'supabase' : 'mock';
}

/**
 * Cria um novo `DataClient` isolado — nova instância do "banco" mock
 * (`source: 'mock'`) ou novas instâncias dos 8 adaptadores Supabase
 * (`source: 'supabase'`, cada um criando seu próprio `SupabaseClient` via
 * `createClient()` de `@keepit/supabase-client` — nunca um singleton global
 * dentro de `src/supabase/`). Use `getDataClient()` para o singleton
 * compartilhado consumido pelos hooks.
 */
export function createDataClient(options: CreateDataClientOptions = {}): DataClient {
  const source = resolveDataSource(options.source);

  if (source === 'supabase') {
    // Story 2.5.1 (AC3): `options.supabaseClient`, quando informado, é a
    // ÚNICA instância de `SupabaseClient` repassada aos oito factories —
    // fecha o bloqueador "8 SupabaseClient distintos por DataClient"
    // registrado em `docs/architecture/06-session-persistence.md` §1.4(b).
    // Quando omitido, cada factory mantém seu comportamento anterior
    // (`client?` undefined → cria/memoiza o próprio client).
    const client = options.supabaseClient;
    return {
      auth: options.passwordRecoveryState
        ? createAuthSupabase(client, options.passwordRecoveryState)
        : createAuthSupabase(client),
      hub: createHubSupabase(client),
      store: createStoreSupabase(client),
      product: createProductSupabase(client),
      order: createOrderSupabase(client),
      wallet: createWalletSupabase(client),
      admin: createAdminSupabase(client),
      analytics: createAnalyticsSupabase(client),
      lojistaAuth: createLojistaAuthSupabase(client),
      estabelecimentoCadastro: createEstabelecimentoCadastroSupabase(client),
    };
  }

  const db = createMockDb();

  return {
    auth: createAuthMock(db),
    hub: createHubMock(db),
    store: createStoreMock(db),
    product: createProductMock(db),
    order: createOrderMock(db),
    wallet: createWalletMock(db),
    admin: createAdminMock(db),
    analytics: createAnalyticsMock(db),
    lojistaAuth: createLojistaAuthMock(db),
    estabelecimentoCadastro: createEstabelecimentoCadastroMock(db),
  };
}

let sharedClient: DataClient | null = null;

/**
 * Singleton do `DataClient` para o processo/sessão atual — usado pelos hooks
 * (`@keepit/core-data/hooks`) para que múltiplos componentes compartilhem o
 * mesmo "banco" mock em memória.
 */
export function getDataClient(options?: CreateDataClientOptions): DataClient {
  if (!sharedClient) {
    sharedClient = createDataClient(options);
  }
  return sharedClient;
}

/** Reseta o singleton — uso exclusivo de testes. */
export function __resetDataClientForTests(): void {
  sharedClient = null;
}

export * from './ports/admin.port';
export * from './ports/analytics.port';
export * from './ports/auth.port';
export * from './ports/estabelecimento-cadastro.port';
export * from './ports/hub.port';
export * from './ports/lojista-auth.port';
export * from './ports/order.port';
export * from './ports/product.port';
export * from './ports/store.port';
export * from './ports/wallet.port';
export * from './types';
/** Story 2.3 (Task 6/7) — `EmailJaExisteError`, consumido por `CriarConta.tsx` (AC4). */
export * from './supabase/auth-errors';
/** Story 3.5 (AC3, AC4) — 4 erros nomeados da RPC, consumidos por `CadastroPasso3.tsx`. */
export * from './supabase/estabelecimento-cadastro-errors';
