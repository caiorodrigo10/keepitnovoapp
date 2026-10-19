import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'sha256' },
  digest: vi.fn(async () => new ArrayBuffer(32)),
  getRandomValues: vi.fn((values: Uint8Array) => values.fill(7)),
}));

import { installSupabaseCryptoPolyfill } from './supabaseCrypto';

describe('installSupabaseCryptoPolyfill', () => {
  it('instala getRandomValues e subtle.digest antes de o client Supabase usar PKCE', async () => {
    const scope: { crypto?: Record<string, unknown> } = {};

    installSupabaseCryptoPolyfill(scope);

    expect(typeof scope.crypto?.getRandomValues).toBe('function');
    expect(typeof (scope.crypto?.subtle as { digest?: unknown }).digest).toBe('function');
    await expect((scope.crypto?.subtle as { digest: (algorithm: string, data: Uint8Array) => Promise<ArrayBuffer> }).digest(
      'SHA-256', new Uint8Array([1]),
    )).resolves.toBeInstanceOf(ArrayBuffer);
  });
});
