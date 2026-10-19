/**
 * Tipos compartilhados por todas as ports/mocks de `@keepit/core-data`.
 *
 * `AsyncCallOptions` é o mecanismo de injeção de estado por chamada (AC4):
 * toda função de port aceita um `options?: AsyncCallOptions` opcional como
 * último parâmetro, permitindo que as telas (a partir da Story 0.4) exercitem
 * os 3 estados — loading (via `delayMs`), vazio (`forceEmpty`) e erro
 * (`forceError`) — sem precisar de um backend real.
 *
 * Decisão do @dev (Story 0.2): nome escolhido é `AsyncCallOptions` (não
 * `MockOptions`) porque o contrato é da PORT (assíncrona por design), não
 * uma particularidade do mock — a implementação Supabase real (Épico 1)
 * também deve aceitar o mesmo shape, ainda que ignore `forceError`/`forceEmpty`
 * fora de ambiente de teste.
 */
export interface AsyncCallOptions {
  /** Latência simulada em ms. Default definido por cada mock (ver `mock/async-helpers.ts`). */
  delayMs?: number;
  /** Se `true`, a Promise rejeita com um erro simulado — para exercitar o estado de erro da tela. */
  forceError?: boolean;
  /** Se `true`, a Promise resolve com uma coleção/valor vazio — para exercitar o estado vazio da tela. */
  forceEmpty?: boolean;
}
