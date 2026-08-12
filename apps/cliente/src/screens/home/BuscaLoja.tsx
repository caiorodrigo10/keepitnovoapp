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
import { Button, Screen } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useSearchLojas } from '../../hooks/useSearchLojas';
import { CATEGORIAS_BUSCA } from '../../lib/discoveryDisplay';
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
  const [devState, setDevState] = useState<DevSimState>('normal');
  const options = toAsyncCallOptions(devState);

  const [query, setQuery] = useState(route.params?.query ?? '');
  const [categoria, setCategoria] = useState(route.params?.categoria ?? 'todos');

  // Story 5.6 (AC5) — mesma correção de escopo de hub (`cart.hubId`, não
  // `DEFAULT_HUB_ID`) e guard de hub ausente, herdados aqui sem duplicar a
  // decisão (ver `BuscaProduto.tsx` para o texto completo do raciocínio).
  const hubId = cart.hubId;

  const { data: lojas, loading, error } = useSearchLojas(hubId ?? '', query, categoria, options);

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
});
