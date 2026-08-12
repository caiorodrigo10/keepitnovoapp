import { afterEach, describe, expect, it } from 'vitest';

import { createClient, createServiceRoleClient } from './index';

/**
 * Testes de `createClient()`/`createServiceRoleClient()` — Story 2.5.1
 * (AC1, AC2). Nenhum destes testes toca rede: o construtor do
 * `@supabase/supabase-js` só valida formato de URL/chave, não abre conexão.
 */

const ENV_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe('createClient — leitura de env (Story 2.5.1, AC1)', () => {
  const originalEnv = snapshotEnv();

  afterEach(() => {
    restoreEnv(originalEnv);
  });

  it('lança erro claro quando nem a versão EXPO_PUBLIC_ nem a sem prefixo estão presentes (regressão)', () => {
    clearEnv();
    expect(() => createClient()).toThrow(/SUPABASE_URL/);
  });

  it('mantém o fallback sem prefixo funcionando (server-side/scripts/Next.js admin — não regride)', () => {
    clearEnv();
    process.env.SUPABASE_URL = 'https://sem-prefixo.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key-sem-prefixo';

    expect(() => createClient()).not.toThrow();
  });

  it('lê EXPO_PUBLIC_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_ANON_KEY quando é a única fonte disponível (bundle Expo)', () => {
    clearEnv();
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://com-prefixo.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-com-prefixo';

    expect(() => createClient()).not.toThrow();
  });

  it('cada variável é resolvida independentemente (URL com prefixo + chave sem prefixo, e vice-versa)', () => {
    clearEnv();
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://com-prefixo.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key-sem-prefixo';
    expect(() => createClient()).not.toThrow();

    clearEnv();
    process.env.SUPABASE_URL = 'https://sem-prefixo.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-com-prefixo';
    expect(() => createClient()).not.toThrow();
  });
});

describe('createClient — options aditivas (Story 2.5.1, AC2)', () => {
  const originalEnv = snapshotEnv();

  afterEach(() => {
    restoreEnv(originalEnv);
  });

  it('sem options, continua criando o client normalmente (comportamento anterior preservado)', () => {
    clearEnv();
    process.env.SUPABASE_URL = 'https://sem-options.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';

    const client = createClient();
    expect(client.auth).toBeDefined();
  });

  it('aceita storage/persistSession/autoRefreshToken sem lançar e sem importar nada de React Native', () => {
    clearEnv();
    process.env.SUPABASE_URL = 'https://com-options.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';

    // Fake storage estruturalmente compatível com `SupportedStorage` — o
    // ponto do teste é que `@keepit/supabase-client` aceita QUALQUER objeto
    // com este formato, sem importar `@react-native-async-storage/async-storage`
    // (ver `package.json` deste pacote: não há dependência RN nenhuma).
    const fakeStorage = {
      getItem: async (_key: string) => null,
      setItem: async (_key: string, _value: string) => undefined,
      removeItem: async (_key: string) => undefined,
    };

    expect(() =>
      createClient({
        storage: fakeStorage,
        persistSession: true,
        autoRefreshToken: true,
      }),
    ).not.toThrow();
  });
});

describe('createServiceRoleClient — não muda nesta story (Story 2.5.1, escopo)', () => {
  const originalEnv = snapshotEnv();

  afterEach(() => {
    restoreEnv(originalEnv);
  });

  it('continua exigindo SUPABASE_SERVICE_ROLE_KEY e lança se ausente', () => {
    clearEnv();
    process.env.SUPABASE_URL = 'https://service-role.supabase.co';
    expect(() => createServiceRoleClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('cria o client com persistSession: false quando as env vars estão presentes', () => {
    clearEnv();
    process.env.SUPABASE_URL = 'https://service-role.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

    expect(() => createServiceRoleClient()).not.toThrow();
  });
});
