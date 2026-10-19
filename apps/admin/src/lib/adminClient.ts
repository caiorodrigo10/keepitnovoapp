import { getDataClient } from '@keepit/core-data';

/**
 * Ponto único de acesso ao `DataClient` mock dentro do Admin — evita
 * `getDataClient()` espalhado em cada componente. [IDS] REUSE: reexporta o
 * singleton de `@keepit/core-data`, não cria estado próprio.
 */
export function getAdminDataClient() {
  return getDataClient();
}
