import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type { CarteiraLojista, Saque, WalletPort } from '../ports/wallet.port';
import type { AsyncCallOptions } from '../types';
import { NotImplementedError } from './not-implemented-error';

const PORT = 'wallet';
const EPIC = 'Épico 7';

/**
 * Esqueleto Supabase de `WalletPort` (Story 1.9). Carteira do Lojista/saques
 * é Pagamento & Carteira (Épico 7).
 */
export function createWalletSupabase(client?: SupabaseClient<Database>): WalletPort {
  // Lazy: só instancia um `SupabaseClient` de verdade se algum método
  // precisar (nenhum stub abaixo precisa hoje). Evita exigir
  // `SUPABASE_URL`/`SUPABASE_ANON_KEY` em ambientes (ex.: CI de
  // typecheck/test) que só verificam o contrato do esqueleto.
  const resolveClient = (): SupabaseClient<Database> => client ?? createClient();
  void resolveClient;

  return {
    async getBalance(_estabelecimentoId: string, _options?: AsyncCallOptions): Promise<CarteiraLojista> {
      throw new NotImplementedError(PORT, 'getBalance', EPIC);
    },

    async requestWithdrawal(
      _estabelecimentoId: string,
      _valorReais: number,
      _options?: AsyncCallOptions,
    ): Promise<Saque> {
      throw new NotImplementedError(PORT, 'requestWithdrawal', EPIC);
    },

    async statement(_estabelecimentoId: string, _options?: AsyncCallOptions): Promise<Saque[]> {
      throw new NotImplementedError(PORT, 'statement', EPIC);
    },
  };
}
