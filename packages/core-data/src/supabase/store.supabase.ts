import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type { Produto } from '../ports/product.port';
import type { Estabelecimento, LojaEstado, StorePort } from '../ports/store.port';
import type { AsyncCallOptions } from '../types';
import { NotImplementedError } from './not-implemented-error';

const PORT = 'store';
const EPIC_DESCOBERTA = 'Épico 5';
const EPIC_LOJISTA = 'Épico 4';

/**
 * Esqueleto Supabase de `StorePort` (Story 1.9). Navegação de loja/catálogo
 * pelo Cliente (`listByHub`/`getCatalog`/`getById`/`getState`) é Descoberta
 * (Épico 5); `setPausadoManualmente` é escrita do Lojista (Épico 4).
 */
export function createStoreSupabase(client?: SupabaseClient<Database>): StorePort {
  // Lazy: só instancia um `SupabaseClient` de verdade se algum método
  // precisar (nenhum stub abaixo precisa hoje). Evita exigir
  // `SUPABASE_URL`/`SUPABASE_ANON_KEY` em ambientes (ex.: CI de
  // typecheck/test) que só verificam o contrato do esqueleto.
  const resolveClient = (): SupabaseClient<Database> => client ?? createClient();
  void resolveClient;

  return {
    async listByHub(_hubId: string, _options?: AsyncCallOptions): Promise<Estabelecimento[]> {
      throw new NotImplementedError(PORT, 'listByHub', EPIC_DESCOBERTA);
    },

    async getCatalog(_estabelecimentoId: string, _options?: AsyncCallOptions): Promise<Produto[]> {
      throw new NotImplementedError(PORT, 'getCatalog', EPIC_DESCOBERTA);
    },

    async getById(_id: string, _options?: AsyncCallOptions): Promise<Estabelecimento | null> {
      throw new NotImplementedError(PORT, 'getById', EPIC_DESCOBERTA);
    },

    async getState(_id: string, _options?: AsyncCallOptions): Promise<LojaEstado> {
      throw new NotImplementedError(PORT, 'getState', EPIC_DESCOBERTA);
    },

    async setPausadoManualmente(
      _estabelecimentoId: string,
      _pausado: boolean,
      _options?: AsyncCallOptions,
    ): Promise<Estabelecimento> {
      throw new NotImplementedError(PORT, 'setPausadoManualmente', EPIC_LOJISTA);
    },
  };
}
