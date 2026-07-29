import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import {
  AsyncStateBlock,
  DevStateToggle,
  SearchBar,
  StoreCard,
  toAsyncCallOptions,
  type DevSimState,
} from '../../components/discovery';
import { Screen } from '../../components/ui';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { useHubsList } from '../../hooks/useHubsList';
import { useStoresList } from '../../hooks/useStoresList';
import { CATEGORIAS_HOME, DEFAULT_HUB_ID, isFavorito } from '../../lib/discoveryDisplay';
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
  const [devState, setDevState] = useState<DevSimState>('normal');
  const options = toAsyncCallOptions(devState);

  const { data: cliente } = useCurrentCliente();
  const { data: hubs, loading: loadingHubs, error: errorHubs } = useHubsList(options);
  const hubAtual = hubs[0];
  const hubId = hubAtual?.id ?? DEFAULT_HUB_ID;

  const { data: lojas, loading: loadingLojas, error: errorLojas } = useStoresList(hubId, options);

  const favoritas = useMemo(() => lojas.filter((loja) => isFavorito(loja.id)), [lojas]);
  const lojasPorCategoria = useMemo(() => {
    const grupos = new Map<string, typeof lojas>();
    for (const loja of lojas) {
      const grupo = grupos.get(loja.categoria) ?? [];
      grupo.push(loja);
      grupos.set(loja.categoria, grupo);
    }
    return grupos;
  }, [lojas]);

  const inicial = (cliente?.nome ?? '?').trim().charAt(0).toUpperCase() || '?';
  const loading = loadingHubs || loadingLojas;
  const error = errorHubs ?? errorLojas;

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.retirarEmLabel}>RETIRAR EM</Text>
          <Pressable
            style={styles.hubSelector}
            onPress={() => hubAtual && navigation.navigate('Hub', { hubId: hubAtual.id })}
          >
            <Text style={styles.hubNome}>{hubAtual?.nome ?? (loadingHubs ? 'Carregando…' : 'Selecionar hub')}</Text>
            <Text style={styles.hubChevron}>⌄</Text>
          </Pressable>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{inicial}</Text>
        </View>
      </View>

      <DevStateToggle value={devState} onChange={setDevState} />

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
            {lojas.length === 0 ? (
              <AsyncStateBlock kind="empty" emptyLabel="Nenhuma loja por perto ainda." />
            ) : (
              lojas.map((loja) => (
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
              {lojasDaCategoria.map((loja) => (
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
  hubChevron: {
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.secondary,
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
