import type { ProdutoComLoja } from '../hooks/useSearchProdutos';
import type { LojaComDisponibilidade } from './storeDiscovery';

export interface SearchSuggestion {
  label: string;
  category: string;
}

export interface CategoryRecentSearch {
  kind: 'category';
  label: string;
  category: string;
}

export type SearchRecentEntry = string | CategoryRecentSearch;

export const GENERAL_SEARCH_SUGGESTIONS: SearchSuggestion[] = [
  { label: 'Farmácias', category: 'farmacia' },
  { label: 'Roupas', category: 'vestuario' },
  { label: 'Conveniência', category: 'conveniencia' },
];

export interface SearchSuggestionSelection {
  query: '';
  category: string;
  recentQuery: string;
}

export function resolveSearchSuggestionSelection(
  suggestion: SearchSuggestion,
): SearchSuggestionSelection {
  return {
    query: '',
    category: suggestion.category,
    recentQuery: suggestion.label,
  };
}

export function createCategoryRecentSearch(suggestion: SearchSuggestion): CategoryRecentSearch {
  return {
    kind: 'category',
    label: suggestion.label,
    category: suggestion.category,
  };
}

export function getRecentSearchLabel(entry: SearchRecentEntry): string {
  return typeof entry === 'string' ? entry : entry.label;
}

export function resolveRecentSearchSelection(
  entry: SearchRecentEntry,
): { query: string; category: string } {
  if (typeof entry !== 'string') {
    return { query: '', category: entry.category };
  }

  const normalizedQuery = entry.trim();
  const legacySuggestion = GENERAL_SEARCH_SUGGESTIONS.find(
    ({ label }) => label.toLocaleLowerCase() === normalizedQuery.toLocaleLowerCase(),
  );

  return legacySuggestion
    ? { query: '', category: legacySuggestion.category }
    : { query: normalizedQuery, category: 'todos' };
}

export interface SearchViewInput {
  surface: 'combined' | 'stores';
  query: string;
  category: string;
  loading: boolean;
  error: Error | null;
  stores: LojaComDisponibilidade[];
  products: ProdutoComLoja[];
  recent: SearchRecentEntry[];
  suggestions: SearchSuggestion[];
}

export type SearchViewState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'suggestions'; recent: SearchRecentEntry[]; general: SearchSuggestion[] }
  | { kind: 'empty'; scope: 'all' | 'stores' | 'category' }
  | { kind: 'results'; showStores: boolean; showProducts: boolean };

export function resolveSearchViewState(input: SearchViewInput): SearchViewState {
  if (input.error) return { kind: 'error' };
  if (input.loading) return { kind: 'loading' };

  if (input.query.trim().length === 0 && input.category === 'todos') {
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
  return recordRecentSearch(current, query, limit) as string[];
}

export function recordRecentSearch(
  current: SearchRecentEntry[],
  entry: SearchRecentEntry,
  limit = 5,
): SearchRecentEntry[] {
  const normalizedLabel = getRecentSearchLabel(entry).trim();
  if (!normalizedLabel) return current;

  const normalizedEntry =
    typeof entry === 'string' ? normalizedLabel : { ...entry, label: normalizedLabel };
  const normalizedComparison = normalizedLabel.toLocaleLowerCase();

  return [
    normalizedEntry,
    ...current.filter(
      (item) => getRecentSearchLabel(item).toLocaleLowerCase() !== normalizedComparison,
    ),
  ].slice(0, limit);
}
