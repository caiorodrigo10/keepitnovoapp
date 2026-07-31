import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import { createAuthSupabase } from './auth.supabase';
import { EmailJaExisteError } from './auth-errors';

/**
 * Story 2.3 (Task 8) — decisão (a) do Dev Notes: mockar `SupabaseClient.auth.signUp`
 * neste arquivo, sem precedente de mock de rede já estabelecido no repo para
 * `supabase/*.test.ts` (os testes existentes só verificam `NotImplementedError`,
 * que não precisa de mock). Não é possível testar a chamada de rede real ao
 * Supabase Auth em Vitest sem isso.
 *
 * Cobre só a lógica de mapeamento SDK → `Cliente`/`EmailJaExisteError`
 * (Task 6) — não cobre o trigger SQL nem RLS (isso é `verify-2.3.sh`,
 * @data-engineer, Task 4b, contra o `keepit-dev` real).
 */
function fakeClient(signUpImpl: (...args: unknown[]) => unknown): SupabaseClient<Database> {
  return {
    auth: {
      signUp: signUpImpl,
    },
  } as unknown as SupabaseClient<Database>;
}

describe('auth.supabase.ts — signUp (Story 2.3, Task 6)', () => {
  it('mapeia sucesso do SDK para Cliente (sem email, telefone/nome do input)', async () => {
    const client = fakeClient(async () => ({
      data: {
        user: {
          id: 'user-123',
          created_at: '2026-07-31T10:00:00.000Z',
          identities: [{ id: 'identity-1' }],
        },
        session: null,
      },
      error: null,
    }));

    const port = createAuthSupabase(client);
    const cliente = await port.signUp({
      nome: 'Novo Cliente',
      email: 'novo@example.com',
      senha: 'senha1234',
      telefone: '11999999999',
    });

    expect(cliente).toEqual({
      id: 'user-123',
      nome: 'Novo Cliente',
      telefone: '11999999999',
      cpf: null,
      criado_em: '2026-07-31T10:00:00.000Z',
    });
    expect(cliente).not.toHaveProperty('email');
  });

  it('lança EmailJaExisteError quando o SDK retorna error.code de duplicidade', async () => {
    const client = fakeClient(async () => ({
      data: { user: null, session: null },
      error: { code: 'user_already_exists', message: 'User already registered', status: 400 },
    }));

    const port = createAuthSupabase(client);
    await expect(
      port.signUp({ nome: 'X', email: 'ja-existe@example.com', senha: 'senha1234', telefone: null }),
    ).rejects.toBeInstanceOf(EmailJaExisteError);
  });

  it('lança EmailJaExisteError na obfuscação do Supabase (error: null, identities: [])', async () => {
    const client = fakeClient(async () => ({
      data: {
        user: { id: 'user-obfuscado', created_at: '2026-07-31T10:00:00.000Z', identities: [] },
        session: null,
      },
      error: null,
    }));

    const port = createAuthSupabase(client);
    await expect(
      port.signUp({ nome: 'X', email: 'ja-existe@example.com', senha: 'senha1234', telefone: null }),
    ).rejects.toBeInstanceOf(EmailJaExisteError);
  });

  it('propaga outros erros do SDK sem mascarar como EmailJaExisteError', async () => {
    const client = fakeClient(async () => ({
      data: { user: null, session: null },
      error: { code: 'weak_password', message: 'Password too weak', status: 422 },
    }));

    const port = createAuthSupabase(client);
    await expect(
      port.signUp({ nome: 'X', email: 'a@example.com', senha: '123', telefone: null }),
    ).rejects.not.toBeInstanceOf(EmailJaExisteError);
  });
});
