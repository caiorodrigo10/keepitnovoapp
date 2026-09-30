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

  const initialize = options.recover ? recoverDataClient : initializeDataClient;
  if (dataSource === 'mock') {
    const client = await initialize({ source: 'mock' });
    sharedSupabaseClient = null;
    adminDataSource = 'mock';
    return client;
  }

  const supabaseClient = createClient();
  const client = await initialize({ source: 'supabase', supabaseClient });
  sharedSupabaseClient = supabaseClient;
  adminDataSource = 'supabase';
  return client;
}

export function getAdminSupabaseClient(): SupabaseClient<Database> | null {
  return sharedSupabaseClient;
}
