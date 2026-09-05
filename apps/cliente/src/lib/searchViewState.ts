import type { ProdutoComLoja } from '../hooks/useSearchProdutos';
import type { LojaComDisponibilidade } from './storeDiscovery';

export interface SearchSuggestion {
  label: string;
  category: string;
}

export const GENERAL_SEARCH_SUGGESTIONS: SearchSuggestion[] = [
  { label: 'Farmácias', category: 'farmacia' },
  { label: 'Roupas', category: 'vestuario' },
  { label: 'Conveniência', category: 'conveniencia' },
];

export interface SearchViewInput {
  surface: 'combined' | 'stores';
  query: string;
  category: string;
  loading: boolean;
  error: Error | null;
  stores: LojaComDisponibilidade[];
  products: ProdutoComLoja[];
  recent: string[];
  suggestions: SearchSuggestion[];
}

export type SearchViewState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'suggestions'; recent: string[]; general: SearchSuggestion[] }
  | { kind: 'empty'; scope: 'all' | 'stores' | 'category' }
  | { kind: 'results'; showStores: boolean; showProducts: boolean };

export function resolveSearchViewState(input: SearchViewInput): SearchViewState {
  if (input.error) return { kind: 'error' };
  if (input.loading) return { kind: 'loading' };

  if (input.query.trim().length === 0) {
    return { kind: 'suggestions', recent: input.recent, general: input.suggestions };
  }

  const showStores = input.stores.length > 0;
  const showProducts = input.surface === 'combined' && input.products.length > 0;

  if (showStores || showProducts) {
    return { kind: 'results', showStores, showProducts };
  }

  if (input.surface === 'stores') return { kind: 'empty', scope: 'stores' };
  if (input.category !== 'todos') return { kind: 'empty', scope: 'category' };
  return { kind: 'empty', scope: 'all' };
}

export function recordRecentQuery(current: string[], query: string, limit = 5): string[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return current;

  const normalizedComparison = normalizedQuery.toLocaleLowerCase();
  return [
    normalizedQuery,
    ...current.filter((item) => item.toLocaleLowerCase() !== normalizedComparison),
  ].slice(0, limit);
}
