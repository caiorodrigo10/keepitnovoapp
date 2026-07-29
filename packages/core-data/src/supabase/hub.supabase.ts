import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type { Hub, HubPort } from '../ports/hub.port';
import type { AsyncCallOptions } from '../types';
import { NotImplementedError } from './not-implemented-error';

const PORT = 'hub';
const EPIC = 'Épico 5';

/**
 * Esqueleto Supabase de `HubPort` (Story 1.9). Leitura de Hubs pelo Cliente
 * (`listNearby`/`getById`) é Descoberta (Épico 5) — cadastro de Hubs pelo
 * Admin vive em `AdminPort.hubsCrud` (Épico 4), não aqui.
 */
export function createHubSupabase(client?: SupabaseClient<Database>): HubPort {
  // Lazy: só instancia um `SupabaseClient` de verdade se algum método
  // precisar (nenhum stub abaixo precisa hoje). Evita exigir
  // `SUPABASE_URL`/`SUPABASE_ANON_KEY` em ambientes (ex.: CI de
  // typecheck/test) que só verificam o contrato do esqueleto.
  const resolveClient = (): SupabaseClient<Database> => client ?? createClient();
  void resolveClient;

  return {
    async listNearby(_options?: AsyncCallOptions): Promise<Hub[]> {
      throw new NotImplementedError(PORT, 'listNearby', EPIC);
    },

    async getById(_id: string, _options?: AsyncCallOptions): Promise<Hub | null> {
      throw new NotImplementedError(PORT, 'getById', EPIC);
    },
  };
}
