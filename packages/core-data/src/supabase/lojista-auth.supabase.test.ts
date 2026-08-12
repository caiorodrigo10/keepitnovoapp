import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import { createLojistaAuthSupabase } from './lojista-auth.supabase';
import { EmailJaExisteError } from './auth-errors';

/**
 * Story 3.2 (AC4, AC7) — mesmo padrão de fake client de `auth.supabase.test.ts`
 * (Story 2.3, Task 8): mocka só `SupabaseClient.auth.signUp`.
 */
function fakeClient(signUpImpl: (...args: unknown[]) => unknown): SupabaseClient<Database> {
  return {
    auth: {
      signUp: signUpImpl,
    },
  } as unknown as SupabaseClient<Database>;
}

const INPUT = {
  nome_fantasia: 'Farmácia Vida',
  cnpj: '11.222.333/0001-44',
  telefone: '(11) 91234-5678',
  responsavel_nome: 'Fulano de Tal',
  email: 'novo.lojista@example.com',
  senha: 'senha1234',
};

describe('lojista-auth.supabase.ts — signUp (Story 3.2, AC4, AC7)', () => {
  it('envia role: "lojista" em options.data — discriminador exigido pelo trigger corrigido (AC7)', async () => {
    let capturedArgs: unknown;
    const client = fakeClient(async (args: unknown) => {
      capturedArgs = args;
      return {
        data: {
          user: { id: 'user-lojista-1', created_at: '2026-08-12T10:00:00.000Z', identities: [{ id: 'identity-1' }] },
          session: null,
        },
        error: null,
      };
    });

    const port = createLojistaAuthSupabase(client);
    await port.signUp(INPUT);

    expect(capturedArgs).toMatchObject({
      email: INPUT.email,
      password: INPUT.senha,
      options: {
        data: {
          role: 'lojista',
          nome_fantasia: 'Farmácia Vida',
          cnpj: INPUT.cnpj,
          telefone: INPUT.telefone,
          responsavel_nome: 'Fulano de Tal',
        },
      },
    });
  });

  it('NUNCA envia as chaves normativas do Cliente (nome/telefone sem role) — evita colisão com o contrato da Story 2.3', async () => {
    let capturedArgs: unknown;
    const client = fakeClient(async (args: unknown) => {
      capturedArgs = args;
      return {
        data: { user: { id: 'user-lojista-2', created_at: '2026-08-12T10:00:00.000Z', identities: [{ id: 'x' }] }, session: null },
        error: null,
      };
    });

    const port = createLojistaAuthSupabase(client);
    await port.signUp(INPUT);

    const data = (capturedArgs as { options: { data: Record<string, unknown> } }).options.data;
    expect(data).not.toHaveProperty('nome');
    expect(data.role).toBe('lojista');
  });

  it('mapeia sucesso do SDK para LojistaConta — sem nenhum campo de Cliente/Estabelecimento (AC4)', async () => {
    const client = fakeClient(async () => ({
      data: {
        user: { id: 'user-lojista-3', created_at: '2026-08-12T10:00:00.000Z', identities: [{ id: 'identity-1' }] },
        session: null,
      },
      error: null,
    }));

    const port = createLojistaAuthSupabase(client);
    const conta = await port.signUp(INPUT);

    expect(conta).toEqual({
      id: 'user-lojista-3',
      email: INPUT.email,
      criado_em: '2026-08-12T10:00:00.000Z',
    });
  });

  it('lança EmailJaExisteError quando o SDK retorna error.code de duplicidade', async () => {
    const client = fakeClient(async () => ({
      data: { user: null, session: null },
      error: { code: 'user_already_exists', message: 'User already registered', status: 400 },
    }));

    const port = createLojistaAuthSupabase(client);
    await expect(port.signUp(INPUT)).rejects.toBeInstanceOf(EmailJaExisteError);
  });

  it('lança EmailJaExisteError na obfuscação do Supabase (error: null, identities: [])', async () => {
    const client = fakeClient(async () => ({
      data: {
        user: { id: 'user-obfuscado', created_at: '2026-08-12T10:00:00.000Z', identities: [] },
        session: null,
      },
      error: null,
    }));

    const port = createLojistaAuthSupabase(client);
    await expect(port.signUp(INPUT)).rejects.toBeInstanceOf(EmailJaExisteError);
  });

  it('propaga outros erros do SDK sem mascarar como EmailJaExisteError — sem sucesso fictício', async () => {
    const client = fakeClient(async () => ({
      data: { user: null, session: null },
      error: { code: 'weak_password', message: 'Password too weak', status: 422 },
    }));

    const port = createLojistaAuthSupabase(client);
    await expect(port.signUp(INPUT)).rejects.not.toBeInstanceOf(EmailJaExisteError);
  });
});

/** Story 3.10 (AC1, AC6) — `signIn`/`signOut`. */
function fakeAuthClient(overrides: {
  signInWithPassword?: (...args: unknown[]) => unknown;
  signOut?: (...args: unknown[]) => unknown;
  getUser?: (...args: unknown[]) => unknown;
}): SupabaseClient<Database> {
  return {
    auth: {
      signInWithPassword: overrides.signInWithPassword ?? (async () => ({ data: { user: null }, error: null })),
      signOut: overrides.signOut ?? (async () => ({ error: null })),
      getUser: overrides.getUser ?? (async () => ({ data: { user: null }, error: null })),
    },
  } as unknown as SupabaseClient<Database>;
}

describe('lojista-auth.supabase.ts — signIn (Story 3.10, AC1, AC6)', () => {
  it('chama signInWithPassword com email/senha e mapeia sucesso para LojistaConta', async () => {
    let capturedArgs: unknown;
    const client = fakeAuthClient({
      signInWithPassword: async (args: unknown) => {
        capturedArgs = args;
        return {
          data: { user: { id: 'user-1', email: 'lojista@example.com', created_at: '2026-08-12T10:00:00.000Z' } },
          error: null,
        };
      },
    });

    const port = createLojistaAuthSupabase(client);
    const conta = await port.signIn('lojista@example.com', 'senha1234');

    expect(capturedArgs).toEqual({ email: 'lojista@example.com', password: 'senha1234' });
    expect(conta).toEqual({ id: 'user-1', email: 'lojista@example.com', criado_em: '2026-08-12T10:00:00.000Z' });
  });

  it('propaga o erro do SDK em credencial inválida — sem sessão/sucesso fictício (AC1)', async () => {
    const client = fakeAuthClient({
      signInWithPassword: async () => ({ data: { user: null }, error: { message: 'Invalid login credentials' } }),
    });

    const port = createLojistaAuthSupabase(client);
    await expect(port.signIn('lojista@example.com', 'errada')).rejects.toMatchObject({
      message: 'Invalid login credentials',
    });
  });
});

describe('lojista-auth.supabase.ts — signOut (Story 3.10)', () => {
  it('chama auth.signOut e propaga erro real sem mascarar', async () => {
    const client = fakeAuthClient({ signOut: async () => ({ error: { message: 'network down' } }) });
    const port = createLojistaAuthSupabase(client);
    await expect(port.signOut()).rejects.toMatchObject({ message: 'network down' });
  });

  it('resolve sem erro quando o SDK sucede', async () => {
    const client = fakeAuthClient({ signOut: async () => ({ error: null }) });
    const port = createLojistaAuthSupabase(client);
    await expect(port.signOut()).resolves.toBeUndefined();
  });
});

describe('lojista-auth.supabase.ts — getCadastroMetadata (Story 3.10, AC4)', () => {
  it('resolve os 4 campos a partir de user_metadata quando completos', async () => {
    const client = fakeAuthClient({
      getUser: async () => ({
        data: {
          user: {
            id: 'user-1',
            user_metadata: {
              nome_fantasia: 'Farmácia Vida',
              cnpj: '11.222.333/0001-44',
              telefone: '(11) 91234-5678',
              responsavel_nome: 'Fulano de Tal',
            },
          },
        },
        error: null,
      }),
    });

    const port = createLojistaAuthSupabase(client);
    const metadata = await port.getCadastroMetadata();

    expect(metadata).toEqual({
      nome_fantasia: 'Farmácia Vida',
      cnpj: '11.222.333/0001-44',
      telefone: '(11) 91234-5678',
      responsavel_nome: 'Fulano de Tal',
    });
  });

  it('resolve strings vazias para campos ausentes/parciais — nunca lança (AC4)', async () => {
    const client = fakeAuthClient({
      getUser: async () => ({
        data: { user: { id: 'user-1', user_metadata: { nome_fantasia: 'Farmácia Vida' } } },
        error: null,
      }),
    });

    const port = createLojistaAuthSupabase(client);
    const metadata = await port.getCadastroMetadata();

    expect(metadata).toEqual({
      nome_fantasia: 'Farmácia Vida',
      cnpj: '',
      telefone: '',
      responsavel_nome: '',
    });
  });

  it('resolve null sem sessão', async () => {
    const client = fakeAuthClient({ getUser: async () => ({ data: { user: null }, error: null }) });
    const port = createLojistaAuthSupabase(client);
    await expect(port.getCadastroMetadata()).resolves.toBeNull();
  });

  it('propaga erro real do SDK', async () => {
    const client = fakeAuthClient({ getUser: async () => ({ data: { user: null }, error: { message: 'timeout' } }) });
    const port = createLojistaAuthSupabase(client);
    await expect(port.getCadastroMetadata()).rejects.toMatchObject({ message: 'timeout' });
  });
});
