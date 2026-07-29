import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type { CreateProdutoInput, Produto, ProductPort, UpdateProdutoInput } from '../ports/product.port';
import type { AsyncCallOptions } from '../types';
import { NotImplementedError } from './not-implemented-error';

const PORT = 'product';
const EPIC = 'Épico 4';

/**
 * Esqueleto Supabase de `ProductPort` (Story 1.9). CRUD de catálogo pelo
 * Lojista é Cadastros Base — Hubs & Catálogo (Épico 4).
 */
export function createProductSupabase(client?: SupabaseClient<Database>): ProductPort {
  // Lazy: só instancia um `SupabaseClient` de verdade se algum método
  // precisar (nenhum stub abaixo precisa hoje). Evita exigir
  // `SUPABASE_URL`/`SUPABASE_ANON_KEY` em ambientes (ex.: CI de
  // typecheck/test) que só verificam o contrato do esqueleto.
  const resolveClient = (): SupabaseClient<Database> => client ?? createClient();
  void resolveClient;

  return {
    async list(
      _estabelecimentoId: string,
      _options?: AsyncCallOptions & { incluirInativos?: boolean },
    ): Promise<Produto[]> {
      throw new NotImplementedError(PORT, 'list', EPIC);
    },

    async getById(_id: string, _options?: AsyncCallOptions): Promise<Produto | null> {
      throw new NotImplementedError(PORT, 'getById', EPIC);
    },

    async create(_input: CreateProdutoInput, _options?: AsyncCallOptions): Promise<Produto> {
      throw new NotImplementedError(PORT, 'create', EPIC);
    },

    async update(_id: string, _input: UpdateProdutoInput, _options?: AsyncCallOptions): Promise<Produto> {
      throw new NotImplementedError(PORT, 'update', EPIC);
    },

    async pause(_id: string, _options?: AsyncCallOptions): Promise<Produto> {
      throw new NotImplementedError(PORT, 'pause', EPIC);
    },

    async delete(_id: string, _options?: AsyncCallOptions): Promise<void> {
      throw new NotImplementedError(PORT, 'delete', EPIC);
    },
  };
}
