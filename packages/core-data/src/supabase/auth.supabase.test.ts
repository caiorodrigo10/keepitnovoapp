import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import type { PasswordRecoveryState } from '../ports/auth.port';

import { createAuthSupabase, PASSWORD_RECOVERY_REDIRECT_TO } from './auth.supabase';
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

/** Story 2.6 (Task, AC3) — fake client com `auth.signInWithPassword` mockado. */
function fakeClientWithSignIn(
  signInWithPasswordImpl: (...args: unknown[]) => unknown,
): SupabaseClient<Database> {
  return {
    auth: {
      signInWithPassword: signInWithPasswordImpl,
    },
  } as unknown as SupabaseClient<Database>;
}

/**
 * Story 2.8 (Task 2/3) — fake client com `auth.getUser` e um `.from('clientes')`
 * encadeável mínimo (`select().eq().maybeSingle()` e
 * `update().eq().select().maybeSingle()`), suficiente para os métodos desta
 * story sem precisar de um mock genérico de PostgREST.
 */
function fakeClientWithProfile(options: {
  getUserImpl?: () => Promise<{ data: { user: unknown }; error: unknown }>;
  selectImpl?: (eqArgs: [string, unknown]) => Promise<{ data: unknown; error: unknown }>;
  updateImpl?: (patch: unknown, eqArgs: [string, unknown]) => Promise<{ data: unknown; error: unknown }>;
  signOutImpl?: () => Promise<{ error: unknown }>;
  updateUserImpl?: (attrs: unknown) => Promise<{ data: { user: unknown }; error: unknown }>;
}): SupabaseClient<Database> {
  const { getUserImpl, selectImpl, updateImpl, signOutImpl, updateUserImpl } = options;

  return {
    auth: {
      getUser: getUserImpl,
      signOut: signOutImpl,
      updateUser: updateUserImpl,
    },
    from: (table: string) => {
      if (table !== 'clientes') {
        throw new Error(`[test] tabela inesperada: ${table}`);
      }
      return {
        select: () => ({
          eq: (...eqArgs: [string, unknown]) => ({
            maybeSingle: () => (selectImpl ? selectImpl(eqArgs) : Promise.resolve({ data: null, error: null })),
          }),
        }),
        update: (patch: unknown) => ({
          eq: (...eqArgs: [string, unknown]) => ({
            select: () => ({
              maybeSingle: () =>
                updateImpl ? updateImpl(patch, eqArgs) : Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient<Database>;
}

/**
 * Story 6.5 (Task) — fake client com `auth.getUser` e um `.from('clientes')`
 * encadeável para `updateCpf`: `update().eq().is().select().maybeSingle()`
 * (escrita "set once") e `select().eq().maybeSingle()` (releitura pós 0
 * linhas, mesmo padrão de `fakeClientWithProfile`, mas com o filtro extra
 * `.is('cpf', null)` que a Story 2.8 não precisava).
 */
function fakeClientWithCpf(options: {
  getUserImpl?: () => Promise<{ data: { user: unknown }; error: unknown }>;
  updateImpl?: (
    patch: unknown,
    eqArgs: [string, unknown],
    isArgs: [string, unknown],
  ) => Promise<{ data: unknown; error: unknown }>;
  selectImpl?: (eqArgs: [string, unknown]) => Promise<{ data: unknown; error: unknown }>;
}): SupabaseClient<Database> {
  const { getUserImpl, updateImpl, selectImpl } = options;

  return {
    auth: {
      getUser: getUserImpl,
    },
    from: (table: string) => {
      if (table !== 'clientes') {
        throw new Error(`[test] tabela inesperada: ${table}`);
      }
      return {
        update: (patch: unknown) => ({
          eq: (...eqArgs: [string, unknown]) => ({
            is: (...isArgs: [string, unknown]) => ({
              select: () => ({
                maybeSingle: () =>
                  updateImpl ? updateImpl(patch, eqArgs, isArgs) : Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        }),
        select: () => ({
          eq: (...eqArgs: [string, unknown]) => ({
            maybeSingle: () => (selectImpl ? selectImpl(eqArgs) : Promise.resolve({ data: null, error: null })),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient<Database>;
}

/** Story 2.7 (Task) — marca de recuperação com leitura síncrona para asserção em teste. */
function createRecoveryState(active = false): PasswordRecoveryState & { active(): boolean } {
  let value = active;
  return {
    async isActive() {
      return value;
    },
    async activate() {
      value = true;
    },
    async clear() {
      value = false;
    },
    active: () => value,
  };
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

describe('auth.supabase.ts — signIn (Story 2.6, AC3, AC4)', () => {
  it('mapeia sucesso do SDK para Cliente via signInWithPassword', async () => {
    const client = fakeClientWithSignIn(async (args: unknown) => {
      expect(args).toEqual({ email: 'existente@example.com', password: 'senha1234' });
      return {
        data: {
          user: {
            id: 'user-existente',
            created_at: '2026-08-12T10:00:00.000Z',
            user_metadata: { nome: 'Fulano', telefone: '11988887777' },
          },
          session: { access_token: 'token-fake' },
        },
        error: null,
      };
    });

    const port = createAuthSupabase(client);
    const cliente = await port.signIn('existente@example.com', 'senha1234');

    expect(cliente).toEqual({
      id: 'user-existente',
      nome: 'Fulano',
      telefone: '11988887777',
      cpf: null,
      criado_em: '2026-08-12T10:00:00.000Z',
    });
  });

  it('propaga o erro do SDK sem simular sucesso quando a credencial é inválida', async () => {
    const client = fakeClientWithSignIn(async () => ({
      data: { user: null, session: null },
      error: { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 },
    }));

    const port = createAuthSupabase(client);
    await expect(port.signIn('errado@example.com', 'senha-errada')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
  });

  it('lança erro explícito se o SDK devolver sem usuário e sem erro (guarda defensiva)', async () => {
    const client = fakeClientWithSignIn(async () => ({
      data: { user: null, session: null },
      error: null,
    }));

    const port = createAuthSupabase(client);
    await expect(port.signIn('qualquer@example.com', 'senha1234')).rejects.toThrow(
      /resposta sem usuário e sem erro/,
    );
  });
});

describe('auth.supabase.ts — recuperação de senha (Story 2.7, AC1, AC3, AC5, AC7)', () => {
  it('requestPasswordReset solicita o reset com o callback canônico, sem sucesso local fictício (AC1)', async () => {
    const resetPasswordForEmail = vi.fn(async () => ({ data: {}, error: null }));
    const client = { auth: { resetPasswordForEmail } } as unknown as SupabaseClient<Database>;

    const port = createAuthSupabase(client);
    await expect(port.requestPasswordReset('cliente@example.com')).resolves.toBeUndefined();
    expect(resetPasswordForEmail).toHaveBeenCalledWith('cliente@example.com', {
      redirectTo: PASSWORD_RECOVERY_REDIRECT_TO,
    });
  });

  it('requestPasswordReset propaga falha real do provedor sem mascarar (AC1)', async () => {
    const error = { code: 'over_request_rate_limit', message: 'provider detail' };
    const client = {
      auth: { resetPasswordForEmail: vi.fn(async () => ({ data: {}, error })) },
    } as unknown as SupabaseClient<Database>;

    const port = createAuthSupabase(client);
    await expect(port.requestPasswordReset('cliente@example.com')).rejects.toBe(error);
  });

  it('requestPasswordReset resolve da mesma forma para e-mail existente ou não — anti-enumeração (AC7)', async () => {
    // O SDK devolve `error: null` nos dois casos — não há branch de
    // "e-mail não encontrado" no adapter: o teste comprova que o mesmo
    // caminho de sucesso é seguido independentemente do e-mail informado.
    const resetPasswordForEmail = vi.fn(async () => ({ data: {}, error: null }));
    const client = { auth: { resetPasswordForEmail } } as unknown as SupabaseClient<Database>;
    const port = createAuthSupabase(client);

    await expect(port.requestPasswordReset('existe@example.com')).resolves.toBeUndefined();
    await expect(port.requestPasswordReset('nao-existe@example.com')).resolves.toBeUndefined();
  });

  it('establishPasswordRecoverySession cria sessão a partir dos tokens do callback (fluxo implícito), só dentro do adapter (AC3, AC5)', async () => {
    const setSession = vi.fn(async () => ({ data: { session: {} }, error: null }));
    const client = { auth: { setSession } } as unknown as SupabaseClient<Database>;
    const port = createAuthSupabase(client);

    await port.establishPasswordRecoverySession(
      `${PASSWORD_RECOVERY_REDIRECT_TO}#access_token=access-secret&refresh_token=refresh-secret&type=recovery`,
    );

    expect(setSession).toHaveBeenCalledWith({ access_token: 'access-secret', refresh_token: 'refresh-secret' });
  });

  it('establishPasswordRecoverySession troca o code por sessão no fluxo PKCE (AC3)', async () => {
    const exchangeCodeForSession = vi.fn(async () => ({ data: { session: {} }, error: null }));
    const client = { auth: { exchangeCodeForSession } } as unknown as SupabaseClient<Database>;
    const port = createAuthSupabase(client);

    await port.establishPasswordRecoverySession(`${PASSWORD_RECOVERY_REDIRECT_TO}?code=pkce-code-secret`);

    expect(exchangeCodeForSession).toHaveBeenCalledWith('pkce-code-secret');
  });

  it('establishPasswordRecoverySession rejeita callback de outra rota sem chamar o SDK (AC3)', async () => {
    const setSession = vi.fn();
    const client = { auth: { setSession } } as unknown as SupabaseClient<Database>;
    const port = createAuthSupabase(client);

    await expect(
      port.establishPasswordRecoverySession('com.keepithub.cliente://auth/other#access_token=x&refresh_token=y'),
    ).rejects.toThrow(/callback de outra rota/);
    expect(setSession).not.toHaveBeenCalled();
  });

  it('establishPasswordRecoverySession rejeita link com erro do Supabase (expirado/inválido) sem chamar o SDK (AC3)', async () => {
    const setSession = vi.fn();
    const client = { auth: { setSession } } as unknown as SupabaseClient<Database>;
    const port = createAuthSupabase(client);

    await expect(
      port.establishPasswordRecoverySession(`${PASSWORD_RECOVERY_REDIRECT_TO}#error=access_denied&error_description=expired`),
    ).rejects.toThrow(/link inválido ou expirado/);
    expect(setSession).not.toHaveBeenCalled();
  });

  it('establishPasswordRecoverySession desfaz a marca de recuperação se a troca de sessão falhar', async () => {
    const state = createRecoveryState();
    const setSession = vi.fn(async () => ({ data: { session: null }, error: { message: 'invalid token' } }));
    const client = { auth: { setSession } } as unknown as SupabaseClient<Database>;
    const port = createAuthSupabase(client, state);

    await expect(
      port.establishPasswordRecoverySession(
        `${PASSWORD_RECOVERY_REDIRECT_TO}#access_token=a&refresh_token=b&type=recovery`,
      ),
    ).rejects.toMatchObject({ message: 'invalid token' });
    expect(state.active()).toBe(false);
  });

  it('updatePassword rejeita sem sessão de recuperação ativa, sem chamar o SDK (AC5)', async () => {
    const updateUser = vi.fn();
    const client = { auth: { updateUser } } as unknown as SupabaseClient<Database>;
    const port = createAuthSupabase(client);

    await expect(port.updatePassword('nova-senha')).rejects.toThrow(/nenhuma sessão de recuperação ativa/);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('updatePassword atualiza a senha e encerra a sessão de recuperação (AC3, AC4, AC5)', async () => {
    const setSession = vi.fn(async () => ({ data: { session: {} }, error: null }));
    const updateUser = vi.fn(async () => ({ data: { user: {} }, error: null }));
    const signOut = vi.fn(async () => ({ error: null }));
    const client = { auth: { setSession, updateUser, signOut } } as unknown as SupabaseClient<Database>;
    const port = createAuthSupabase(client);

    await port.establishPasswordRecoverySession(
      `${PASSWORD_RECOVERY_REDIRECT_TO}#access_token=access-secret&refresh_token=refresh-secret&type=recovery`,
    );

    await expect(port.updatePassword('nova-senha')).resolves.toBeUndefined();
    expect(updateUser).toHaveBeenCalledWith({ password: 'nova-senha' });
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('updatePassword mantém a marca ativa se updateUser funcionar mas signOut falhar (nunca libera Main com sessão inconsistente)', async () => {
    const state = createRecoveryState();
    const setSession = vi.fn(async () => ({ data: { session: {} }, error: null }));
    const updateUser = vi.fn(async () => ({ data: { user: {} }, error: null }));
    const signOut = vi.fn(async () => ({ error: { message: 'logout failed' } }));
    const client = { auth: { setSession, updateUser, signOut } } as unknown as SupabaseClient<Database>;
    const port = createAuthSupabase(client, state);

    await port.establishPasswordRecoverySession(
      `${PASSWORD_RECOVERY_REDIRECT_TO}#access_token=access-secret&refresh_token=refresh-secret&type=recovery`,
    );

    await expect(port.updatePassword('nova-senha')).rejects.toEqual({ message: 'logout failed' });
    expect(state.active()).toBe(true);
  });
});

describe('auth.supabase.ts — onAuthStateChange (Story 2.3.1, Task 3/7, AC1/AC2; Story 2.7, AC5)', () => {
  it('mapeia session.user para Cliente via callback interno', async () => {
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

    // Story 2.7: a checagem de `passwordRecoveryState` passou a rodar numa
    // Promise isolada dentro do callback — precisa de um microtask extra.
    await Promise.resolve();

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

  it('callback(null) quando session é null', async () => {
    let capturedCallback: ((event: unknown, session: unknown) => void) | undefined;
    const client = fakeClientWithAuthStateChange((callback: (event: unknown, session: unknown) => void) => {
      capturedCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    const port = createAuthSupabase(client);
    const received: unknown[] = [];
    port.onAuthStateChange((cliente) => received.push(cliente));

    capturedCallback!('SIGNED_OUT', null);
    await Promise.resolve();

    expect(received).toEqual([null]);
  });

  it('Story 2.7 (AC5): sessão de recuperação ativa nunca promove o usuário, mesmo com session válida', async () => {
    const state = createRecoveryState(true);
    let capturedCallback: ((event: unknown, session: unknown) => void) | undefined;
    const client = fakeClientWithAuthStateChange((callback: (event: unknown, session: unknown) => void) => {
      capturedCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    // Simula um adapter recém-criado após o SDK reidratar uma sessão
    // persistida no restart do app (`INITIAL_SESSION`).
    const port = createAuthSupabase(client, state);
    const received: unknown[] = [];
    port.onAuthStateChange((cliente) => received.push(cliente));

    capturedCallback!('INITIAL_SESSION', {
      user: { id: 'user-recovery', created_at: '2026-08-12T00:00:00.000Z' },
    });
    await Promise.resolve();

    expect(received).toEqual([null]);
    expect(state.active()).toBe(true);
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

describe('auth.supabase.ts — perfil real (Story 2.8, AC1, AC2, AC8)', () => {
  it('currentUser lê a própria linha em clientes via RLS, sem service_role (AC2)', async () => {
    const client = fakeClientWithProfile({
      getUserImpl: async () => ({ data: { user: { id: 'user-perfil' } }, error: null }),
      selectImpl: async ([column, value]) => {
        expect(column).toBe('id');
        expect(value).toBe('user-perfil');
        return {
          data: { id: 'user-perfil', nome: 'Fulano', telefone: '11988887777', cpf: null, criado_em: '2026-08-12T00:00:00.000Z' },
          error: null,
        };
      },
    });
    const port = createAuthSupabase(client);

    await expect(port.currentUser()).resolves.toEqual({
      id: 'user-perfil',
      nome: 'Fulano',
      telefone: '11988887777',
      cpf: null,
      criado_em: '2026-08-12T00:00:00.000Z',
    });
  });

  it('currentUser resolve null sem sessão, sem tentar SELECT (AC1)', async () => {
    const selectSpy = vi.fn();
    const client = fakeClientWithProfile({
      getUserImpl: async () => ({ data: { user: null }, error: null }),
      selectImpl: selectSpy,
    });
    const port = createAuthSupabase(client);

    await expect(port.currentUser()).resolves.toBeNull();
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it('currentUser lança erro explícito se a sessão existir mas a linha em clientes não (nunca simula perfil vazio)', async () => {
    const client = fakeClientWithProfile({
      getUserImpl: async () => ({ data: { user: { id: 'user-orfao' } }, error: null }),
      selectImpl: async () => ({ data: null, error: null }),
    });
    const port = createAuthSupabase(client);

    await expect(port.currentUser()).rejects.toThrow(/sem linha em clientes/);
  });

  it('currentEmail lê o e-mail da sessão via getUser, nunca de clientes (AC2)', async () => {
    const client = fakeClientWithProfile({
      getUserImpl: async () => ({ data: { user: { id: 'user-perfil', email: 'fulano@example.com' } }, error: null }),
    });
    const port = createAuthSupabase(client);

    await expect(port.currentEmail()).resolves.toBe('fulano@example.com');
  });

  it('signOut chama o SDK sem sucesso fictício e propaga erro real (AC8)', async () => {
    const signOutOk = vi.fn(async () => ({ error: null }));
    const portOk = createAuthSupabase(fakeClientWithProfile({ signOutImpl: signOutOk }));
    await expect(portOk.signOut()).resolves.toBeUndefined();
    expect(signOutOk).toHaveBeenCalledOnce();

    const error = { message: 'network down' };
    const portFail = createAuthSupabase(fakeClientWithProfile({ signOutImpl: async () => ({ error }) }));
    await expect(portFail.signOut()).rejects.toBe(error);
  });
});

describe('auth.supabase.ts — updateProfile (Story 2.8, AC3, AC4, AC6)', () => {
  it('atualiza nome/telefone filtrando pelo id da sessão autenticada, não pelo clienteId da UI', async () => {
    const client = fakeClientWithProfile({
      getUserImpl: async () => ({ data: { user: { id: 'user-real' } }, error: null }),
      updateImpl: async (patch, [column, value]) => {
        expect(patch).toEqual({ nome: 'Novo Nome', telefone: '11999998888' });
        expect(column).toBe('id');
        expect(value).toBe('user-real');
        return {
          data: { id: 'user-real', nome: 'Novo Nome', telefone: '11999998888', cpf: null, criado_em: '2026-08-12T00:00:00.000Z' },
          error: null,
        };
      },
    });
    const port = createAuthSupabase(client);

    const atualizado = await port.updateProfile('user-real', { nome: 'Novo Nome', telefone: '11999998888' });
    expect(atualizado.nome).toBe('Novo Nome');
  });

  it('telefone: null limpa o campo sem disparar verificação (AC4, decisão 10.4)', async () => {
    const client = fakeClientWithProfile({
      getUserImpl: async () => ({ data: { user: { id: 'user-real' } }, error: null }),
      updateImpl: async (patch) => {
        expect(patch).toEqual({ telefone: null });
        return {
          data: { id: 'user-real', nome: 'Fulano', telefone: null, cpf: null, criado_em: '2026-08-12T00:00:00.000Z' },
          error: null,
        };
      },
    });
    const port = createAuthSupabase(client);

    await expect(port.updateProfile('user-real', { telefone: null })).resolves.toMatchObject({ telefone: null });
  });

  it('rejeita nome vazio sem chamar o SDK de escrita', async () => {
    const updateSpy = vi.fn();
    const client = fakeClientWithProfile({
      getUserImpl: async () => ({ data: { user: { id: 'user-real' } }, error: null }),
      updateImpl: updateSpy,
    });
    const port = createAuthSupabase(client);

    await expect(port.updateProfile('user-real', { nome: '   ' })).rejects.toThrow(/nome não pode ser vazio/);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('rejeita clienteId que não corresponde à sessão autenticada — autorização negativa, nunca confia na UI (AC6)', async () => {
    const updateSpy = vi.fn();
    const client = fakeClientWithProfile({
      getUserImpl: async () => ({ data: { user: { id: 'user-real' } }, error: null }),
      updateImpl: updateSpy,
    });
    const port = createAuthSupabase(client);

    await expect(port.updateProfile('user-outro-cliente', { nome: 'Invasor' })).rejects.toThrow(
      /não corresponde à sessão autenticada/,
    );
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('trata 0 linhas afetadas (RLS bloqueou) como erro explícito, nunca sucesso fictício', async () => {
    const client = fakeClientWithProfile({
      getUserImpl: async () => ({ data: { user: { id: 'user-real' } }, error: null }),
      updateImpl: async () => ({ data: null, error: null }),
    });
    const port = createAuthSupabase(client);

    await expect(port.updateProfile('user-real', { nome: 'Novo Nome' })).rejects.toThrow(
      /RLS bloqueou a escrita ou o perfil não existe/,
    );
  });
});

describe('auth.supabase.ts — updateCpf (Story 6.5, AC3)', () => {
  it('grava o CPF filtrando pela sessão autenticada e por cpf IS NULL ("set once")', async () => {
    const client = fakeClientWithCpf({
      getUserImpl: async () => ({ data: { user: { id: 'user-real' } }, error: null }),
      updateImpl: async (patch, [column, value], [isColumn, isValue]) => {
        expect(patch).toEqual({ cpf: '11144477735' });
        expect(column).toBe('id');
        expect(value).toBe('user-real');
        expect(isColumn).toBe('cpf');
        expect(isValue).toBeNull();
        return {
          data: {
            id: 'user-real',
            nome: 'Fulano',
            telefone: null,
            cpf: '11144477735',
            criado_em: '2026-08-12T00:00:00.000Z',
          },
          error: null,
        };
      },
    });
    const port = createAuthSupabase(client);

    const atualizado = await port.updateCpf('user-real', '11144477735');
    expect(atualizado.cpf).toBe('11144477735');
  });

  it('rejeita clienteId que não corresponde à sessão autenticada, sem chamar o SDK de escrita — nunca confia no clienteId da UI', async () => {
    const updateSpy = vi.fn();
    const client = fakeClientWithCpf({
      getUserImpl: async () => ({ data: { user: { id: 'user-real' } }, error: null }),
      updateImpl: updateSpy,
    });
    const port = createAuthSupabase(client);

    await expect(port.updateCpf('user-outro-cliente', '11144477735')).rejects.toThrow(
      /não corresponde à sessão autenticada/,
    );
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('set once: cliente já tem CPF → 0 linhas afetadas vira no-op honesto (relê e devolve o CPF original, sem erro)', async () => {
    const client = fakeClientWithCpf({
      getUserImpl: async () => ({ data: { user: { id: 'user-com-cpf' } }, error: null }),
      updateImpl: async () => ({ data: null, error: null }),
      selectImpl: async ([column, value]) => {
        expect(column).toBe('id');
        expect(value).toBe('user-com-cpf');
        return {
          data: {
            id: 'user-com-cpf',
            nome: 'Fulano',
            telefone: null,
            cpf: '52998224725',
            criado_em: '2026-08-12T00:00:00.000Z',
          },
          error: null,
        };
      },
    });
    const port = createAuthSupabase(client);

    const cliente = await port.updateCpf('user-com-cpf', '11144477735');
    expect(cliente.cpf).toBe('52998224725');
  });

  it('trata 0 linhas + perfil realmente inexistente como erro explícito, nunca sucesso fictício', async () => {
    const client = fakeClientWithCpf({
      getUserImpl: async () => ({ data: { user: { id: 'user-fantasma' } }, error: null }),
      updateImpl: async () => ({ data: null, error: null }),
      selectImpl: async () => ({ data: null, error: null }),
    });
    const port = createAuthSupabase(client);

    await expect(port.updateCpf('user-fantasma', '11144477735')).rejects.toThrow(
      /RLS bloqueou a escrita ou o perfil não existe/,
    );
  });

  it('propaga erro real do SDK sem mascarar como sucesso', async () => {
    const error = { message: 'network down' };
    const client = fakeClientWithCpf({
      getUserImpl: async () => ({ data: { user: { id: 'user-real' } }, error: null }),
      updateImpl: async () => ({ data: null, error }),
    });
    const port = createAuthSupabase(client);

    await expect(port.updateCpf('user-real', '11144477735')).rejects.toBe(error);
  });

  it('rejeita sem sessão autenticada', async () => {
    const client = fakeClientWithCpf({ getUserImpl: async () => ({ data: { user: null }, error: null }) });
    const port = createAuthSupabase(client);

    await expect(port.updateCpf('user-qualquer', '11144477735')).rejects.toThrow(/sem sessão autenticada/);
  });
});

describe('auth.supabase.ts — updateEmail (Story 2.8, AC5, decisão 10.5)', () => {
  it('chama o fluxo oficial do Supabase Auth e devolve updated quando não há confirmação pendente', async () => {
    const updateUser = vi.fn(async (attrs: unknown) => {
      expect(attrs).toEqual({ email: 'novo@example.com' });
      return { data: { user: { id: 'user-real' } }, error: null };
    });
    const port = createAuthSupabase(fakeClientWithProfile({ updateUserImpl: updateUser }));

    await expect(port.updateEmail('novo@example.com')).resolves.toEqual({ status: 'updated' });
  });

  it('devolve confirmation_required quando o provedor sinaliza double opt-in pendente', async () => {
    const port = createAuthSupabase(
      fakeClientWithProfile({
        updateUserImpl: async () => ({ data: { user: { id: 'user-real', new_email: 'novo@example.com' } }, error: null }),
      }),
    );

    await expect(port.updateEmail('novo@example.com')).resolves.toEqual({ status: 'confirmation_required' });
  });

  it('propaga erro real do SDK sem mascarar como sucesso, sem expor payload sensível', async () => {
    const error = { message: 'email_exists' };
    const port = createAuthSupabase(fakeClientWithProfile({ updateUserImpl: async () => ({ data: { user: null }, error }) }));

    await expect(port.updateEmail('ocupado@example.com')).rejects.toBe(error);
  });
});
