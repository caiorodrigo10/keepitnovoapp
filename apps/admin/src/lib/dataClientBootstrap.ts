import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';
import {
  initializeDataClient,
  recoverDataClient,
  resolveDataMode,
  type DataClient,
  type DataMode,
} from '@keepit/core-data';

export interface BootstrapAdminDataClientOptions {
  recover?: boolean;
}

let sharedSupabaseClient: SupabaseClient<Database> | null = null;
let sharedBootstrap: Promise<DataClient> | null = null;

/** Live binding usado por `adminAuth` somente depois do bootstrap do provider. */
export let adminDataSource: DataMode = 'mock';

/** A avaliação no SSR não toca storage nem instancia o SDK do browser. */
export async function bootstrapAdminDataClient(
  options: BootstrapAdminDataClientOptions = {},
): Promise<DataClient | null> {
  const dataSource = resolveDataMode(process.env.DATA_SOURCE);
  if (typeof window === 'undefined') {
    return null;
  }

  if (!options.recover && sharedBootstrap) {
    return sharedBootstrap;
  }

  const initialize = options.recover ? recoverDataClient : initializeDataClient;
  const initialization = (async () => {
    if (dataSource === 'mock') {
      const client = await initialize({ source: 'mock' });
      sharedSupabaseClient = null;
      adminDataSource = 'mock';
      return client;
    }

    // Next substitui somente leituras estáticas de process.env no bundle do browser.
    const supabaseClient = createClient({
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY,
    });
    const client = await initialize({ source: 'supabase', supabaseClient });
    sharedSupabaseClient = supabaseClient;
    adminDataSource = 'supabase';
    return client;
  })();

  let guardedInitialization: Promise<DataClient>;
  guardedInitialization = initialization.catch((error: unknown) => {
    if (error instanceof Error && /SUPABASE_(URL|ANON_KEY)/.test(error.message)) {
      console.error(
        '[admin] Falha na configuração do Supabase: SUPABASE_URL e SUPABASE_ANON_KEY precisam estar disponíveis no build do Admin.',
        error,
      );
    }
    if (sharedBootstrap === guardedInitialization) {
      sharedBootstrap = null;
    }
    throw error;
  });
  sharedBootstrap = guardedInitialization;
  return guardedInitialization;
}

export function getAdminSupabaseClient(): SupabaseClient<Database> | null {
  return sharedSupabaseClient;
}
