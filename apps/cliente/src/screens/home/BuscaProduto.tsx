import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, spacing, typography } from '@keepit/ui-tokens';

import {
  AsyncStateBlock,
  CategoryChips,
  DevStateToggle,
  ProductRow,
  SearchBar,
  StoreCard,
  toAsyncCallOptions,
  type DevSimState,
} from '../../components/discovery';
import { Screen } from '../../components/ui';
import { useSearchLojas } from '../../hooks/useSearchLojas';
import { useSearchProdutos } from '../../hooks/useSearchProdutos';
import { CATEGORIAS_BUSCA, DEFAULT_HUB_ID } from '../../lib/discoveryDisplay';
import type { HomeStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'BuscaProduto'>;

/**
 * Busca por produto (Task 5, AC1-AC4). Fiel a `cliente-11-busca.png`:
 * campo de busca + tabs de categoria + seção "PRODUTOS" (foco desta rota) +
 * seção "LOJAS" (o protótipo mostra ambas na mesma tela de busca — mantido
 * aqui; `BuscaLoja` cobre a variante focada só em lojas, acessível via
 * "Ver todas" da Home).
 */
export default function BuscaProduto({ route, navigation }: Props) {
  const [devState, setDevState] = useState<DevSimState>('normal');
  const options = toAsyncCallOptions(devState);

  const [query, setQuery] = useState(route.params?.query ?? '');
  const [categoria, setCategoria] = useState(route.params?.categoria ?? 'todos');

  const {
    data: produtos,
    loading: loadingProdutos,
    error: errorProdutos,
  } = useSearchProdutos(DEFAULT_HUB_ID, query, categoria, options);
  const { data: lojas, loading: loadingLojas, error: errorLojas } = useSearchLojas(DEFAULT_HUB_ID, query, categoria, options);

  const loading = loadingProdutos || loadingLojas;
  const error = errorProdutos ?? errorLojas;
  const semResultados = !loading && !error && produtos.length === 0 && lojas.length === 0;

  return (
    <Screen>
      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar produto" autoFocus />
        </View>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.cancelar}>Cancelar</Text>
        </Pressable>
      </View>

      <DevStateToggle value={devState} onChange={setDevState} />

      <CategoryChips categorias={CATEGORIAS_BUSCA} selected={categoria} onSelect={setCategoria} />

      {error ? (
        <AsyncStateBlock kind="error" errorLabel="Não foi possível buscar agora. Tente novamente." />
      ) : loading ? (
        <AsyncStateBlock kind="loading" />
      ) : semResultados ? (
        <AsyncStateBlock kind="empty" emptyLabel={`Nenhum resultado para "${query}".`} />
      ) : (
        <>
          {produtos.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>PRODUTOS</Text>
              {produtos.map(({ produto, loja }) => (
                <ProductRow
                  key={produto.id}
                  produto={produto}
                  subtitulo={loja.nome_fantasia}
                  onPress={() => navigation.navigate('DetalheProduto', { produtoId: produto.id })}
                />
              ))}
            </View>
          )}

          {lojas.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>LOJAS</Text>
              {lojas.map((loja) => (
                <StoreCard
                  key={loja.id}
                  loja={loja}
                  onPress={() => navigation.navigate('Loja', { estabelecimentoId: loja.id })}
                />
              ))}
            </View>
          )}
        </>
      )}
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
});
