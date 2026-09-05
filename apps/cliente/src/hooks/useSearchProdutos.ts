import { getDataClient } from '@keepit/core-data';
import type {
  AsyncCallOptions,
  Estabelecimento,
  LojaDisponibilidade,
  Produto,
} from '@keepit/core-data';
import { useAsyncResource, type AsyncResourceState } from '@keepit/core-data/hooks';

import { selectStoresForSurface } from '../lib/storeDiscovery';

export interface ProdutoComLoja {
  produto: Produto;
  loja: Estabelecimento;
  disponibilidade: LojaDisponibilidade;
}

export interface StoreProductsInput {
  loja: Estabelecimento;
  products: Produto[];
}

/**
 * [IDS] ADAPT (Story 5.6, AC3) — ordena o resultado por `preco_reais`
 * ascendente, conforme o texto do épico ("MVP usa ILIKE simples +
 * ordenação por preço"), sem ranking por relevância. Extraída como função
 * pura (não usa hooks) para ser testável em `.test.ts` puro — mesmo padrão
 * já usado por `resolveTicketMinimoReais` (Story 5.4), já que
 * `apps/cliente` não tem harness de teste de componente/hook React
 * configurado (`vitest.config.ts#include` só cobre `src/**\/*.test.ts`).
 */
export function sortProdutosByPrecoAsc(items: ProdutoComLoja[]): ProdutoComLoja[] {
  return [...items].sort((a, b) => a.produto.preco_reais - b.produto.preco_reais);
}

export function joinSearchProducts(inputs: StoreProductsInput[], now: Date = new Date()): ProdutoComLoja[] {
  const disponibilidadePorLoja = new Map(
    selectStoresForSurface(
      inputs.map(({ loja }) => loja),
      'search',
      now,
    ).map(({ loja, disponibilidade }) => [loja.id, disponibilidade]),
  );

  return inputs.flatMap(({ loja, products }) => {
    const disponibilidade = disponibilidadePorLoja.get(loja.id);
    if (!disponibilidade) return [];

    return products.map((produto) => ({ produto, loja, disponibilidade }));
  });
}

/**
 * [IDS] CREATE — busca por produto (Task 5, AC2/AC3). `ProductPort.list`
 * exige `estabelecimentoId` (não existe "listar todos os produtos" na port,
 * já que no schema real a busca roda direto no banco via `pg_trgm`). Para o
 * mock, a busca "global" é montada aqui: lista as lojas do hub
 * (`store.port.listByHub`) e busca o catálogo de cada uma
 * (`product.port.list`), depois filtra por texto em memória — sem replicar
 * trigram, só o comportamento funcional (Dev Notes da Story 0.5).
 *
 * `options` é repassado apenas para `listByHub` (a chamada "de entrada"):
 * basta para exercitar loading/vazio/erro (AC3) sem precisar propagar para
 * cada chamada de catálogo individualmente.
 */
export function useSearchProdutos(
  hubId: string,
  query: string,
  categoria: string | undefined,
  options?: AsyncCallOptions,
): AsyncResourceState<ProdutoComLoja[]> {
  const client = getDataClient();

  return useAsyncResource<ProdutoComLoja[]>(
    async () => {
      const lojas = await client.store.listByHub(hubId, options);
      const porLoja = await Promise.all(
        lojas.map(async (loja) => {
          const products = await client.product.list(loja.id);
          return { loja, products };
        }),
      );

      const normalizedQuery = query.trim().toLowerCase();

      const filtrados = joinSearchProducts(porLoja).filter(({ produto, loja }) => {
        const matchesQuery = normalizedQuery.length === 0 || produto.nome.toLowerCase().includes(normalizedQuery);
        const matchesCategoria = !categoria || categoria === 'todos' || loja.categoria === categoria;
        return matchesQuery && matchesCategoria;
      });

      return sortProdutosByPrecoAsc(filtrados);
    },
    [],
    [hubId, query, categoria, options?.forceEmpty, options?.forceError, options?.delayMs],
  );
}
