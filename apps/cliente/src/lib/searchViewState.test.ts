import { describe, expect, it } from 'vitest';

import type { ProdutoComLoja } from '../hooks/useSearchProdutos';
import {
  GENERAL_SEARCH_SUGGESTIONS,
  recordRecentQuery,
  resolveSearchSuggestionSelection,
  resolveSearchViewState,
  type SearchViewInput,
  type SearchViewState,
} from './searchViewState';
import type { LojaComDisponibilidade } from './storeDiscovery';

const store = {
  loja: { id: 'store' },
  disponibilidade: { estado: 'aberta' },
} as LojaComDisponibilidade;
const product = {
  produto: { id: 'product' },
  loja: store.loja,
  disponibilidade: store.disponibilidade,
} as ProdutoComLoja;

const baseInput = (override: Partial<SearchViewInput>): SearchViewInput => ({
  surface: 'combined',
  query: 'x',
  category: 'todos',
  loading: false,
  error: null,
  stores: [],
  products: [],
  recent: ['arroz'],
  suggestions: GENERAL_SEARCH_SUGGESTIONS,
  ...override,
});

describe('resolveSearchViewState', () => {
  const cases: Array<[Partial<SearchViewInput>, Partial<SearchViewState>]> = [
    [{ loading: true }, { kind: 'loading' }],
    [{ error: new Error('offline') }, { kind: 'error' }],
    [{ query: '', stores: [], products: [] }, { kind: 'suggestions' }],
    [{ query: 'x', category: 'todos', stores: [], products: [] }, { kind: 'empty', scope: 'all' }],
    [
      { query: 'x', category: 'farmacia', stores: [], products: [] },
      { kind: 'empty', scope: 'category' },
    ],
    [{ surface: 'stores', query: 'x', stores: [], products: [] }, { kind: 'empty', scope: 'stores' }],
    [
      { query: 'x', stores: [store], products: [] },
      { kind: 'results', showStores: true, showProducts: false },
    ],
    [
      { query: 'x', stores: [], products: [product] },
      { kind: 'results', showStores: false, showProducts: true },
    ],
  ];

  it.each(cases)('resolve estado sem sobreposição', (input, expected) => {
    expect(resolveSearchViewState(baseInput(input))).toMatchObject(expected);
  });

  it('preserva recentes e identifica sugestões gerais quando a busca está vazia', () => {
    expect(resolveSearchViewState(baseInput({ query: '', recent: ['arroz'] }))).toEqual({
      kind: 'suggestions',
      recent: ['arroz'],
      general: GENERAL_SEARCH_SUGGESTIONS,
    });
  });

  it('seleciona sugestões por categoria sem adicionar o label ao predicado textual', () => {
    const selections = GENERAL_SEARCH_SUGGESTIONS.map(resolveSearchSuggestionSelection);

    expect(selections).toEqual([
      { query: '', category: 'farmacia', recentQuery: 'Farmácias' },
      { query: '', category: 'vestuario', recentQuery: 'Roupas' },
      { query: '', category: 'conveniencia', recentQuery: 'Conveniência' },
    ]);
    expect(
      resolveSearchViewState(
        baseInput({
          ...selections[0],
          stores: [store],
          products: [product],
        }),
      ),
    ).toEqual({ kind: 'results', showStores: true, showProducts: true });
  });
});

describe('recordRecentQuery', () => {
  it('normaliza espaços, move duplicata case-insensitive ao início e preserva a nova grafia', () => {
    expect(recordRecentQuery(['arroz', 'leite'], ' LEITE ')).toEqual(['LEITE', 'arroz']);
  });

  it('ignora uma busca composta somente por espaços', () => {
    expect(recordRecentQuery([], '   ')).toEqual([]);
  });

  it('mantém somente o limite mais recente solicitado', () => {
    expect(recordRecentQuery(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
  });
});
