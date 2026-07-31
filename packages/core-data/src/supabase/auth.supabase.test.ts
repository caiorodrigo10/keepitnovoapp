import { describe, expect, it, vi } from 'vitest';
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

/** Story 2.3.1 (Task 7) — fake client com `auth.onAuthStateChange` mockado. */
function fakeClientWithAuthStateChange(
  onAuthStateChangeImpl: (callback: (event: unknown, session: unknown) => void) => unknown,
): SupabaseClient<Database> {
  return {
    auth: {
      onAuthStateChange: onAuthStateChangeImpl,
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

describe('auth.supabase.ts — onAuthStateChange (Story 2.3.1, Task 3/7, AC1/AC2)', () => {
  it('mapeia session.user para Cliente via callback interno', () => {
    const unsubscribe = vi.fn();
    let capturedCallback: ((event: unknown, session: unknown) => void) | undefined;
    const client = fakeClientWithAuthStateChange((callback: (event: unknown, session: unknown) => void) => {
      capturedCallback = callback;
      return { data: { subscription: { unsubscribe } } };
    });

    const port = createAuthSupabase(client);
    const received: unknown[] = [];
    const unsub = port.onAuthStateChange((cliente) => received.push(cliente));

    expect(capturedCallback).toBeDefined();
    capturedCallback!('SIGNED_IN', {
      user: {
        id: 'user-456',
        created_at: '2026-07-31T12:00:00.000Z',
        user_metadata: { nome: 'Fulano', telefone: '11988887777' },
      },
    });

    expect(received).toEqual([
      {
        id: 'user-456',
        nome: 'Fulano',
        telefone: '11988887777',
        cpf: null,
        criado_em: '2026-07-31T12:00:00.000Z',
      },
    ]);

    unsub();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('callback(null) quando session é null', () => {
    let capturedCallback: ((event: unknown, session: unknown) => void) | undefined;
    const client = fakeClientWithAuthStateChange((callback: (event: unknown, session: unknown) => void) => {
      capturedCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    const port = createAuthSupabase(client);
    const received: unknown[] = [];
    port.onAuthStateChange((cliente) => received.push(cliente));

    capturedCallback!('SIGNED_OUT', null);

    expect(received).toEqual([null]);
  });

  it('resolveClient() memoizada devolve a mesma instância entre onAuthStateChange e signUp (AC2)', async () => {
    const onAuthStateChangeMock = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
    const signUpMock = vi.fn(async () => ({
      data: {
        user: { id: 'user-789', created_at: '2026-07-31T12:00:00.000Z', identities: [{ id: 'identity-1' }] },
        session: null,
      },
      error: null,
    }));
    const client = {
      auth: {
        onAuthStateChange: onAuthStateChangeMock,
        signUp: signUpMock,
      },
    } as unknown as SupabaseClient<Database>;

    const port = createAuthSupabase(client);
    port.onAuthStateChange(() => {});
    await port.signUp({ nome: 'X', email: 'x@example.com', senha: 'senha1234', telefone: null });

    // Ambos os métodos foram chamados sobre o MESMO `client` passado
    // explicitamente — prova de que `cachedClient` não foi substituído
    // quando um `client` é injetado (Task 3, AC2).
    expect(onAuthStateChangeMock).toHaveBeenCalledOnce();
    expect(signUpMock).toHaveBeenCalledOnce();
  });
});
