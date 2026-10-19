import * as ExpoCrypto from 'expo-crypto';

type CryptoScope = { crypto?: Record<string, unknown> };

/** React Native precisa desta superfície para o challenge PKCE S256. */
export function installSupabaseCryptoPolyfill(scope: CryptoScope = globalThis as unknown as CryptoScope): void {
  const crypto = scope.crypto ?? {};
  if (typeof crypto.getRandomValues !== 'function') crypto.getRandomValues = ExpoCrypto.getRandomValues;

  const existingSubtle = crypto.subtle;
  const subtle = (existingSubtle ?? {}) as Record<string, unknown>;
  if (typeof subtle.digest !== 'function') {
    subtle.digest = async (algorithm: string, data: BufferSource): Promise<ArrayBuffer> => {
      if (algorithm.toUpperCase() !== 'SHA-256') throw new Error(`Algoritmo WebCrypto não suportado: ${algorithm}`);
      return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data);
    };
  }
  if (!existingSubtle) crypto.subtle = subtle;
  if (!scope.crypto) scope.crypto = crypto;
}
