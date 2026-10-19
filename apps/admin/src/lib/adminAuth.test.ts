import { describe, expect, it, vi } from 'vitest';

const signInWithPassword = vi.hoisted(() => vi.fn());

vi.mock('./dataClientBootstrap', () => ({
  adminDataSource: 'supabase',
  getAdminSupabaseClient: () => ({
    auth: { signInWithPassword },
  }),
}));

import { signIn } from './adminAuth';

describe('signIn do Admin', () => {
  it('traduz credenciais inválidas do Supabase para PT-BR', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });

    await expect(signIn('admin@keepit.com.br', 'senha-incorreta'))
      .rejects.toThrow('E-mail ou senha inválidos');
  });
});
