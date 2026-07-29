import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type { AuthPort, Cliente, ClienteConfirmacaoTelefone, SignUpInput } from '../ports/auth.port';
import type { AsyncCallOptions } from '../types';
import { NotImplementedError } from './not-implemented-error';

const PORT = 'auth';
const EPIC = 'Épico 2';

/**
 * Esqueleto Supabase de `AuthPort` (Story 1.9). Cadastro/login do Cliente
 * (telefone + confirmação SMS) entra no Épico 2 — nenhum método aqui faz
 * chamada de rede ainda.
 *
 * `client` é opcional — se omitido, instancia um `createClient()` novo
 * (anon key, respeita RLS) por chamada de `createAuthSupabase`, nunca um
 * singleton global do módulo.
 */
export function createAuthSupabase(client?: SupabaseClient<Database>): AuthPort {
  // Lazy: só instancia um `SupabaseClient` de verdade se algum método
  // precisar (nenhum stub abaixo precisa hoje). Evita exigir
  // `SUPABASE_URL`/`SUPABASE_ANON_KEY` em ambientes (ex.: CI de
  // typecheck/test) que só verificam o contrato do esqueleto.
  const resolveClient = (): SupabaseClient<Database> => client ?? createClient();
  void resolveClient;

  return {
    async signUp(_input: SignUpInput, _options?: AsyncCallOptions): Promise<Cliente> {
      throw new NotImplementedError(PORT, 'signUp', EPIC);
    },

    async signIn(_telefone: string, _options?: AsyncCallOptions): Promise<Cliente> {
      throw new NotImplementedError(PORT, 'signIn', EPIC);
    },

    async currentUser(_options?: AsyncCallOptions): Promise<Cliente | null> {
      throw new NotImplementedError(PORT, 'currentUser', EPIC);
    },

    async signOut(_options?: AsyncCallOptions): Promise<void> {
      throw new NotImplementedError(PORT, 'signOut', EPIC);
    },

    async confirmPhone(
      _clienteId: string,
      _codigo: string,
      _options?: AsyncCallOptions,
    ): Promise<ClienteConfirmacaoTelefone> {
      throw new NotImplementedError(PORT, 'confirmPhone', EPIC);
    },

    async getById(_clienteId: string, _options?: AsyncCallOptions): Promise<Cliente | null> {
      throw new NotImplementedError(PORT, 'getById', EPIC);
    },

    async updateCpf(_clienteId: string, _cpf: string, _options?: AsyncCallOptions): Promise<Cliente> {
      throw new NotImplementedError(PORT, 'updateCpf', EPIC);
    },
  };
}
