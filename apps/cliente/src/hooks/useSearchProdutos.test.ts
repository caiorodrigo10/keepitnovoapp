import { describe, expect, it } from 'vitest';

import type { Estabelecimento, Produto } from '@keepit/core-data';

import {
  joinSearchProducts,
  sortProdutosByPrecoAsc,
  type ProdutoComLoja,
  type StoreProductsInput,
} from './useSearchProdutos';

const NOW = new Date(2026, 8, 5, 12, 0, 0);

function estabelecimento(
  id: string,
  pausadoManualmente: boolean,
  horaFecha: string,
  status: Estabelecimento['status'] = 'ativo',
): Estabelecimento {
  return {
    id,
    status,
    pausado_manualmente: pausadoManualmente,
    excluido_em: null,
    horarios: [{ dia_semana: NOW.getDay(), aberto: true, hora_abre: '08:00', hora_fecha: horaFecha }],
  } as Estabelecimento;
}

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
    disponibilidade: {
      estado: 'aberta',
      visivelAoCliente: true,
      disponivelParaCompra: true,
      motivo: 'aberta',
    },
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

describe('joinSearchProducts (Story 12.10, Task 2)', () => {
  it('preserva produtos de lojas fechadas e pausadas com o estado associado e omite lojas administrativas', () => {
    const closed = estabelecimento('closed', false, '10:00');
    const paused = estabelecimento('paused', true, '18:00');
    const suspended = estabelecimento('suspended', false, '18:00', 'suspenso');

    const results = joinSearchProducts(
      [
        {
          loja: closed,
          products: [{ id: 'p-closed', estabelecimento_id: closed.id, ativo: true }],
        },
        {
          loja: paused,
          products: [{ id: 'p-paused', estabelecimento_id: paused.id, ativo: true }],
        },
        {
          loja: suspended,
          products: [{ id: 'p-hidden', estabelecimento_id: suspended.id, ativo: true }],
        },
      ] as StoreProductsInput[],
      NOW,
    );

    expect(results.map(({ produto }) => produto.id)).toEqual(['p-closed', 'p-paused']);
    expect(results.map(({ loja }) => loja.id)).toEqual(['closed', 'paused']);
    expect(results.map(({ disponibilidade }) => disponibilidade.estado)).toEqual(['fechada', 'pausada']);
  });
});
