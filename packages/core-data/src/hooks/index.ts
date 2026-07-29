/**
 * Sub-export `@keepit/core-data/hooks` — hooks React de consumo das ports.
 *
 * Decisão do @dev (Story 0.2): hooks residem DENTRO de `packages/core-data`
 * (não em cada app) para que a troca mock→Supabase (Épico 1) não exija
 * alterar imports nas telas. Consumidos como:
 *
 * ```ts
 * import { useHubs, useOrders } from '@keepit/core-data/hooks';
 * ```
 */
export * from './useAsyncResource';
export * from './useHubs';
export * from './useOrders';
export * from './useStores';
export * from './useWallet';
