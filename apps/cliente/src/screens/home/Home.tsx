import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';
import { resolveLojaDisponibilidade } from '@keepit/core-data';

import {
  AsyncStateBlock,
  SearchBar,
  StoreCard,
} from '../../components/discovery';
import { Screen } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useFavorites } from '../../context/FavoritesContext';
import { useQaSimulation } from '../../context/QaScenarioContext';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { useHubsList } from '../../hooks/useHubsList';
import { useStoresList } from '../../hooks/useStoresList';
import { CATEGORIAS_HOME, selectFavoriteEntities } from '../../lib/discoveryDisplay';
import { isForcedLoading, simulationToAsyncCallOptions } from '../../lib/qaSimulation';
import { selectStoresForSurface } from '../../lib/storeDiscovery';
import type { HomeStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Home'>;

/**
 * [IDS] ADAPT — ícones reais de `@expo/vector-icons` (Story 0.5, débito de
 * fidelidade visual) substituindo os placeholders de texto ('+', '⌂', '▭')
 * usados antes da lib estar instalada. Farmácia→cruz médica, Roupas→cabide,
 * Conveniência→cesta, fiel a `cliente-02-home-hub.png`.
 */
function CategoriaIcon({ categoriaId, color, size }: { categoriaId: string; color: string; size: number }) {
  switch (categoriaId) {
    case 'farmacia':
      return <Ionicons name="medkit-outline" size={size} color={color} />;
    case 'vestuario':
      return <MaterialCommunityIcons name="hanger" size={size} color={color} />;
    case 'conveniencia':
      return <Ionicons name="basket-outline" size={size} color={color} />;
    default:
      return <Ionicons name="ellipse-outline" size={size} color={color} />;
  }
}

/**
 * Home (Task 1, AC1-AC4). Fiel a `docs/design-refs/cliente-02-home-hub.png`:
 * "Retirar em {hub}" + avatar, busca, categorias, "Lojas perto do hub".
 * Seções adicionais exigidas pelo AC1 mas sem tela dedicada no protótipo
 * ("favoritos", "lojas por categoria") seguem a mesma linguagem visual dos
 * cards de loja, adicionadas abaixo da seção principal.
 */
export default function Home({ navigation }: Props) {
  const hubsSimulation = useQaSimulation('hubs');
  const storesSimulation = useQaSimulation('stores');

  const cart = useCart();
  const { favoriteStoreIds } = useFavorites();
  const { data: cliente } = useCurrentCliente();
  const { data: hubs, loading: hubsLoading, error: errorHubs } = useHubsList(
    simulationToAsyncCallOptions(hubsSimulation),
  );
  const loadingHubs = hubsLoading || isForcedLoading(hubsSimulation);
  // AC1 (Story 5.1.1): Home reflete o hub SELECIONADO (`cart.hubId`), não mais sempre `hubs[0]` fixo.
  const hubAtual = hubs.find((hub) => hub.id === cart.hubId);

  const { data: lojas, loading: storesLoading, error: errorLojas } = useStoresList(
    cart.hubId ?? '',
    simulationToAsyncCallOptions(storesSimulation),
  );
  const loadingLojas = storesLoading || isForcedLoading(storesSimulation);

  const favoritas = useMemo(
    () => selectFavoriteEntities(lojas, favoriteStoreIds),
    [favoriteStoreIds, lojas],
  );
  const lojasDisponiveis = useMemo(() => selectStoresForSurface(lojas, 'purchase'), [lojas]);
  const lojasPorCategoria = useMemo(() => {
    const grupos = new Map<string, typeof lojasDisponiveis>();
    for (const item of lojasDisponiveis) {
      const { loja } = item;
      const grupo = grupos.get(loja.categoria) ?? [];
      grupo.push(item);
      grupos.set(loja.categoria, grupo);
    }
    return grupos;
  }, [lojasDisponiveis]);

  const inicial = (cliente?.nome ?? '?').trim().charAt(0).toUpperCase() || '?';
  const loading = loadingHubs || loadingLojas;
  const error = errorHubs ?? errorLojas;

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.retirarEmLabel}>RETIRAR EM</Text>
          <Pressable style={styles.hubSelector} onPress={() => navigation.navigate('EscolhaRetirada')}>
            <Text style={styles.hubNome}>{hubAtual?.nome ?? (loadingHubs ? 'Carregando…' : 'Selecionar hub')}</Text>
            {!!hubAtual && <Text style={styles.hubAction}>Alterar</Text>}
          </Pressable>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{inicial}</Text>
        </View>
      </View>

      <SearchBar
        readOnly
        value=""
        placeholder="Buscar lojas ou produtos"
        onPress={() => navigation.navigate('BuscaProduto', undefined)}
      />

      <View style={styles.categoriasRow}>
        {CATEGORIAS_HOME.map((categoria) => (
          <Pressable
            key={categoria.id}
            style={styles.categoriaCard}
            onPress={() => navigation.navigate('BuscaLoja', { categoria: categoria.id })}
          >
            <View style={styles.categoriaIconWrapper}>
              <CategoriaIcon categoriaId={categoria.id} color={lightColors.text.primary} size={20} />
            </View>
            <Text style={styles.categoriaLabel}>{categoria.label}</Text>
          </Pressable>
        ))}
      </View>

      {error ? (
        <AsyncStateBlock kind="error" errorLabel="Não foi possível carregar a Home. Tente novamente." />
      ) : loading ? (
        <AsyncStateBlock kind="loading" />
      ) : (
        <>
          {favoritas.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Favoritos</Text>
              {favoritas.map((loja) => (
                <StoreCard
                  key={loja.id}
                  loja={loja}
                  disponibilidade={resolveLojaDisponibilidade(loja)}
                  onPress={() => navigation.navigate('Loja', { estabelecimentoId: loja.id })}
                />
              ))}
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Lojas perto do hub</Text>
              <Pressable onPress={() => navigation.navigate('BuscaLoja', undefined)}>
                <Text style={styles.verTodas}>Ver todas</Text>
              </Pressable>
            </View>
            {lojasDisponiveis.length === 0 ? (
              <AsyncStateBlock kind="empty" emptyLabel="Nenhuma loja por perto ainda." />
            ) : (
              lojasDisponiveis.map(({ loja }) => (
                <StoreCard
                  key={loja.id}
                  loja={loja}
                  onPress={() => navigation.navigate('Loja', { estabelecimentoId: loja.id })}
                />
              ))
            )}
          </View>

          {[...lojasPorCategoria.entries()].map(([categoriaId, lojasDaCategoria]) => (
            <View key={categoriaId} style={styles.section}>
              <Text style={styles.sectionTitle}>
                {CATEGORIAS_HOME.find((c) => c.id === categoriaId)?.label ?? categoriaId}
              </Text>
              {lojasDaCategoria.map(({ loja }) => (
                <StoreCard
                  key={loja.id}
                  loja={loja}
                  onPress={() => navigation.navigate('Loja', { estabelecimentoId: loja.id })}
                />
              ))}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing['4'],
  },
  retirarEmLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.xs.fontSize,
    letterSpacing: typography.letterSpacing.section,
    color: lightColors.text.tertiary,
  },
  hubSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['1'],
  },
  hubNome: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
    color: lightColors.text.primary,
  },
  hubAction: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.successFg,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: lightColors.accent.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
  },
  categoriasRow: {
    flexDirection: 'row',
    gap: spacing['3'],
    marginTop: spacing['5'],
    marginBottom: spacing['2'],
  },
  categoriaCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.card,
    paddingVertical: spacing['4'],
    gap: spacing['2'],
  },
  categoriaIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: lightColors.bg.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoriaLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.primary,
  },
  section: {
    marginTop: spacing['6'],
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
    marginBottom: spacing['1'],
  },
  verTodas: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.successFg,
  },
});
