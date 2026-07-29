import type { AsyncCallOptions } from '../types';

/** Latência default de uma chamada mock quando `options.delayMs` não é informado. */
export const DEFAULT_MOCK_DELAY_MS = 350;

/**
 * Envolve um resultado síncrono numa Promise genuinamente assíncrona
 * (via `setTimeout`, nunca `Promise.resolve()` puro) para que as telas
 * (Story 0.4+) tenham loading de verdade para exercitar (AC2/AC4).
 *
 * - `options.forceError` → rejeita com um `Error` simulado.
 * - `options.forceEmpty` → resolve com `emptyValue` em vez do resultado real.
 * - `options.delayMs` → sobrepõe `DEFAULT_MOCK_DELAY_MS`.
 */
export function simulateAsync<T>(
  resultFactory: () => T,
  emptyValue: T,
  options?: AsyncCallOptions,
): Promise<T> {
  const delayMs = options?.delayMs ?? DEFAULT_MOCK_DELAY_MS;

  return new Promise<T>((resolve, reject) => {
    setTimeout(() => {
      if (options?.forceError) {
        reject(new Error('[mock] Erro simulado via AsyncCallOptions.forceError'));
        return;
      }
      if (options?.forceEmpty) {
        resolve(emptyValue);
        return;
      }
      try {
        resolve(resultFactory());
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }, delayMs);
  });
}

/** Gera um PIN numérico de 4 dígitos, como texto (`pedidos.pin_texto`). */
export function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** Gera um id de mock legível (não é um uuid real — decisão do @dev, Story 0.2, mocks não precisam de formato uuid). */
export function generateMockId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
