import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, spacing, typography } from '@keepit/ui-tokens';

import {
  AsyncStateBlock,
  CategoryChips,
  SearchBar,
  StoreCard,
} from '../../components/discovery';
import { Button, Screen } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useQaSimulation } from '../../context/QaScenarioContext';
import { useSearchLojas } from '../../hooks/useSearchLojas';
import { CATEGORIAS_BUSCA } from '../../lib/discoveryDisplay';
import { isForcedLoading, simulationToAsyncCallOptions } from '../../lib/qaSimulation';
import {
  createCategoryRecentSearch,
  GENERAL_SEARCH_SUGGESTIONS,
  getRecentSearchLabel,
  recordRecentSearch,
  resolveRecentSearchSelection,
  resolveSearchSuggestionSelection,
  resolveSearchViewState,
  type SearchRecentEntry,
} from '../../lib/searchViewState';
import type { HomeStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'BuscaLoja'>;

/**
 * Busca por loja (Task 6, AC1-AC4) — variante focada em lojas (a partir de
 * "Ver todas"/categoria da Home), mesma linguagem visual de
 * `cliente-11-busca.png` (busca + tabs de categoria), só que sem a seção
 * "PRODUTOS" (essa fica em `BuscaProduto`).
 */
export default function BuscaLoja({ route, navigation }: Props) {
  const cart = useCart();
  const searchSimulation = useQaSimulation('search');

  const [query, setQuery] = useState(route.params?.query ?? '');
  const [categoria, setCategoria] = useState(route.params?.categoria ?? 'todos');
  const [recentQueries, setRecentQueries] = useState<SearchRecentEntry[]>([]);

  // Story 5.6 (AC5) — mesma correção de escopo de hub (`cart.hubId`, não
  // `DEFAULT_HUB_ID`) e guard de hub ausente, herdados aqui sem duplicar a
  // decisão (ver `BuscaProduto.tsx` para o texto completo do raciocínio).
  const hubId = cart.hubId;

  const { data: lojas, loading: storesLoading, error } = useSearchLojas(
    hubId ?? '',
    query,
    categoria,
    simulationToAsyncCallOptions(searchSimulation),
  );
  const loading = storesLoading || isForcedLoading(searchSimulation);

  const viewState = resolveSearchViewState({
    surface: 'stores',
    query,
    category: categoria,
    loading,
    error,
    stores: lojas,
    products: [],
    recent: recentQueries,
    suggestions: GENERAL_SEARCH_SUGGESTIONS,
  });

  const selectRecent = (recent: SearchRecentEntry) => {
    const selection = resolveRecentSearchSelection(recent);
    setQuery(selection.query);
    setCategoria(selection.category);
    setRecentQueries((current) => recordRecentSearch(current, recent));
  };

  if (hubId === null) {
    return (
      <Screen>
        <View style={styles.searchRow}>
          <View style={styles.searchInput} />
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={styles.cancelar}>Cancelar</Text>
          </Pressable>
        </View>

        <AsyncStateBlock kind="empty" emptyLabel="Escolha um hub para buscar lojas perto de você." />

        <View style={styles.guardButton}>
          <Button title="Escolher hub" onPress={() => navigation.navigate('EscolhaRetirada')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar loja" autoFocus />
        </View>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.cancelar}>Cancelar</Text>
        </Pressable>
      </View>

      <CategoryChips categorias={CATEGORIAS_BUSCA} selected={categoria} onSelect={setCategoria} />

      {viewState.kind === 'error' ? (
        <AsyncStateBlock kind="error" errorLabel="Não foi possível buscar agora. Tente novamente." />
      ) : viewState.kind === 'loading' ? (
        <AsyncStateBlock kind="loading" />
      ) : viewState.kind === 'suggestions' ? (
        <>
          {viewState.recent.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>BUSCAS RECENTES</Text>
              {viewState.recent.map((recent) => {
                const label = getRecentSearchLabel(recent);
                return (
                  <Pressable key={label} style={styles.suggestionRow} onPress={() => selectRecent(recent)}>
                    <Text style={styles.suggestionLabel}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SUGESTÕES</Text>
            {viewState.general.map((suggestion) => (
              <Pressable
                key={suggestion.category}
                style={styles.suggestionRow}
                onPress={() => {
                  const selection = resolveSearchSuggestionSelection(suggestion);
                  setCategoria(selection.category);
                  setQuery(selection.query);
                  setRecentQueries((current) =>
                    recordRecentSearch(current, createCategoryRecentSearch(suggestion)),
                  );
                }}
              >
                <Text style={styles.suggestionLabel}>{suggestion.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : viewState.kind === 'empty' ? (
        <AsyncStateBlock
          kind="empty"
          emptyLabel={
            viewState.scope === 'category'
              ? `Nenhuma loja nesta categoria para "${query}".`
              : `Nenhuma loja para "${query}".`
          }
        />
      ) : viewState.showStores ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LOJAS</Text>
          {lojas.map(({ loja, disponibilidade }) => (
            <StoreCard
              key={loja.id}
              loja={loja}
              disponibilidade={disponibilidade}
              onPress={() => {
                setRecentQueries((current) => recordRecentSearch(current, query));
                navigation.navigate('Loja', { estabelecimentoId: loja.id });
              }}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
    marginBottom: spacing['3'],
  },
  searchInput: {
    flex: 1,
  },
  guardButton: {
    marginTop: spacing['4'],
  },
  cancelar: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.accent.successFg,
  },
  section: {
    marginTop: spacing['5'],
  },
  sectionTitle: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    letterSpacing: typography.letterSpacing.section,
    color: lightColors.text.tertiary,
    marginBottom: spacing['2'],
  },
  suggestionRow: {
    minHeight: spacing['12'],
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border.subtle,
  },
  suggestionLabel: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
  },
});
