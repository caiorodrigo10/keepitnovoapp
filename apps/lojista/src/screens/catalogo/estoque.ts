/** Abaixo deste valor um produto ativo mostra "Estoque baixo" (painel P7). */
export const ESTOQUE_BAIXO_LIMIAR = 5;

/**
 * Deriva um valor de estoque de EXIBIÇÃO estável a partir do id do produto —
 * ver nota de fidelidade em `types.ts` (`ProdutoCatalogo`). Puramente
 * determinístico (mesmo id → mesmo valor sempre), sem estado global.
 */
export function estoqueDisplayFromId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return hash % 41;
}
