import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, spacing, typography } from '@keepit/ui-tokens';

import {
  AsyncStateBlock,
  CategoryChips,
  DevStateToggle,
  SearchBar,
  StoreCard,
  toAsyncCallOptions,
  type DevSimState,
} from '../../components/discovery';
import { Screen } from '../../components/ui';
import { useSearchLojas } from '../../hooks/useSearchLojas';
import { CATEGORIAS_BUSCA, DEFAULT_HUB_ID } from '../../lib/discoveryDisplay';
import type { HomeStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'BuscaLoja'>;

/**
 * Busca por loja (Task 6, AC1-AC4) — variante focada em lojas (a partir de
 * "Ver todas"/categoria da Home), mesma linguagem visual de
 * `cliente-11-busca.png` (busca + tabs de categoria), só que sem a seção
 * "PRODUTOS" (essa fica em `BuscaProduto`).
 */
export default function BuscaLoja({ route, navigation }: Props) {
  const [devState, setDevState] = useState<DevSimState>('normal');
  const options = toAsyncCallOptions(devState);

  const [query, setQuery] = useState(route.params?.query ?? '');
  const [categoria, setCategoria] = useState(route.params?.categoria ?? 'todos');

  const { data: lojas, loading, error } = useSearchLojas(DEFAULT_HUB_ID, query, categoria, options);

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

      <DevStateToggle value={devState} onChange={setDevState} />

      <CategoryChips categorias={CATEGORIAS_BUSCA} selected={categoria} onSelect={setCategoria} />

      {error ? (
        <AsyncStateBlock kind="error" errorLabel="Não foi possível buscar agora. Tente novamente." />
      ) : loading ? (
        <AsyncStateBlock kind="loading" />
      ) : lojas.length === 0 ? (
        <AsyncStateBlock kind="empty" emptyLabel={query ? `Nenhuma loja para "${query}".` : 'Nenhuma loja encontrada.'} />
      ) : (
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
