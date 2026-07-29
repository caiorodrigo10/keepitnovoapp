import { useMemo } from 'react';

import type { AsyncCallOptions, Estabelecimento } from '@keepit/core-data';
import type { AsyncResourceState } from '@keepit/core-data/hooks';

import { useStoresList } from './useStoresList';

/**
 * [IDS] CREATE — busca por loja (Task 6, AC2/AC3). O schema real usa índice
 * trigram (`pg_trgm`) em `estabelecimentos.nome_fantasia`; aqui a busca é um
 * filtro local em memória sobre o resultado de `store.port.listByHub`
 * (comportamento funcional equivalente, sem replicar trigram — ver Dev Notes
 * da Story 0.5, seção "produtos"). `StorePort` não tem um método `search`,
 * então filtrar client-side é a única opção sem alterar `packages/core-data`
 * (fora do escopo desta story).
 */
export function useSearchLojas(
  hubId: string,
  query: string,
  categoria: string | undefined,
  options?: AsyncCallOptions,
): AsyncResourceState<Estabelecimento[]> {
  const { data, loading, error } = useStoresList(hubId, options);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return data.filter((loja) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        loja.nome_fantasia.toLowerCase().includes(normalizedQuery) ||
        loja.categoria.toLowerCase().includes(normalizedQuery);
      const matchesCategoria = !categoria || categoria === 'todos' || loja.categoria === categoria;
      return matchesQuery && matchesCategoria;
    });
  }, [data, query, categoria]);

  return { data: filtered, loading, error };
}
