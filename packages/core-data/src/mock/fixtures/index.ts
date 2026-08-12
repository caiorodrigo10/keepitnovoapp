/**
 * Barrel de fixtures — dados semeados a partir de `keepit-app/index.html`.
 * Ver cada arquivo para a origem/trecho específico do protótipo.
 * Nenhuma fixture é mutada aqui: `mock/db.ts` faz uma cópia profunda antes
 * de expor os dados às implementações mock (para persistência apenas
 * durante a sessão do processo, sem contaminar as fixtures originais entre
 * execuções de teste).
 */
export * from './hubs';
export * from './estabelecimentos';
export * from './estabelecimentos-admin';
export * from './produtos';
export * from './clientes';
export * from './pedidos';
export * from './falhas';
export * from './reembolsos';
