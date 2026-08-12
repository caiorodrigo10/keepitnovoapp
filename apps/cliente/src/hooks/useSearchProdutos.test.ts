import { describe, expect, it } from 'vitest';

import type { Estabelecimento, Produto } from '@keepit/core-data';

import { sortProdutosByPrecoAsc, type ProdutoComLoja } from './useSearchProdutos';

/**
 * Story 5.6 (AC3) — ordenação por `preco_reais` ascendente, sem ranking por
 * relevância. `sortProdutosByPrecoAsc` é a única parte de `useSearchProdutos`
 * testável em `.test.ts` puro nesta app (sem harness de teste de hook React
 * configurado — ver Dev Agent Record da Story 5.4 para o mesmo gap de
 * infraestrutura, já registrado, não reintroduzido aqui).
 */
function produtoComLoja(id: string, precoReais: number): ProdutoComLoja {
  return {
    produto: { id, preco_reais: precoReais } as Produto,
    loja: { id: 'estab-1' } as Estabelecimento,
  };
}

describe('sortProdutosByPrecoAsc (Story 5.6, AC3)', () => {
  it('ordena por preco_reais ascendente', () => {
    const items = [produtoComLoja('c', 30), produtoComLoja('a', 10), produtoComLoja('b', 20)];

    const resultado = sortProdutosByPrecoAsc(items);

    expect(resultado.map((item) => item.produto.id)).toEqual(['a', 'b', 'c']);
  });

  it('não muta o array original (imutabilidade)', () => {
    const items = [produtoComLoja('b', 20), produtoComLoja('a', 10)];
    const original = [...items];

    sortProdutosByPrecoAsc(items);

    expect(items).toEqual(original);
  });

  it('trata lista vazia sem erro', () => {
    expect(sortProdutosByPrecoAsc([])).toEqual([]);
  });

  it('mantém preços iguais em ordem estável (sem ranking por relevância)', () => {
    const items = [produtoComLoja('x', 15), produtoComLoja('y', 15)];

    const resultado = sortProdutosByPrecoAsc(items);

    expect(resultado.map((item) => item.produto.id)).toEqual(['x', 'y']);
  });
});
