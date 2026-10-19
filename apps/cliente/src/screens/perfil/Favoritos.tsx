import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  getDataClient,
  resolveLojaDisponibilidade,
  type Estabelecimento,
  type Hub,
} from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AsyncStateBlock, StoreCard } from '../../components/discovery';
import { FavoriteButton } from '../../components/discovery/FavoriteButton';
import { ImagePlaceholder } from '../../components/discovery/ImagePlaceholder';
import { Screen } from '../../components/ui';
import { useFavorites } from '../../context/FavoritesContext';
import {
  resolveFavoriteEntities,
  shouldResolveFavoriteSnapshot,
} from '../../lib/discoveryDisplay';
import type { MainTabParamList, PerfilStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PerfilStackParamList, 'Favoritos'>;

interface FavoriteSnapshot {
  hubs: Hub[];
  stores: Estabelecimento[];
}

const INITIAL_SNAPSHOT: FavoriteSnapshot = { hubs: [], stores: [] };

export default function Favoritos({ navigation }: Props) {
  const client = getDataClient();
  const {
    favoriteHubIds,
    favoriteStoreIds,
    loading: favoritesLoading,
    error: favoritesError,
  } = useFavorites();
  const [snapshot, setSnapshot] = useState<FavoriteSnapshot>(INITIAL_SNAPSHOT);
  const [hasResolvedSnapshot, setHasResolvedSnapshot] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolutionError, setResolutionError] = useState<Error | null>(null);
  const lastResolvedHubIdsRef = useRef(favoriteHubIds);
  const lastResolvedStoreIdsRef = useRef(favoriteStoreIds);

  useEffect(() => {
    const favoriteCollectionsChanged =
      favoriteHubIds !== lastResolvedHubIdsRef.current ||
      favoriteStoreIds !== lastResolvedStoreIdsRef.current;
    if (
      !shouldResolveFavoriteSnapshot(
        favoritesLoading,
        favoritesError !== null,
        favoriteCollectionsChanged,
      )
    ) {
      return;
    }

    let active = true;
    setResolving(true);
    setResolutionError(null);

    void Promise.all([
      resolveFavoriteEntities(favoriteHubIds, (id) => client.hub.getById(id)),
      resolveFavoriteEntities(
        favoriteStoreIds,
        (id) => client.store.getById(id),
        (store) => resolveLojaDisponibilidade(store).visivelAoCliente,
      ),
    ])
      .then(([hubs, stores]) => {
        if (!active) return;
        setSnapshot({ hubs, stores });
        setHasResolvedSnapshot(true);
        lastResolvedHubIdsRef.current = favoriteHubIds;
        lastResolvedStoreIdsRef.current = favoriteStoreIds;
      })
      .catch(() => {
        if (active) {
          setResolutionError(new Error('Não foi possível atualizar seus favoritos. Tente novamente.'));
        }
      })
      .finally(() => {
        if (active) setResolving(false);
      });

    return () => {
      active = false;
    };
  }, [
    client.hub,
    client.store,
    favoriteHubIds,
    favoriteStoreIds,
    favoritesError,
    favoritesLoading,
  ]);

  function openHub(hubId: string) {
    navigation
      .getParent<BottomTabNavigationProp<MainTabParamList>>()
      ?.navigate('HomeTab', { screen: 'Hub', params: { hubId } });
  }

  function openStore(estabelecimentoId: string) {
    navigation
      .getParent<BottomTabNavigationProp<MainTabParamList>>()
      ?.navigate('HomeTab', { screen: 'Loja', params: { estabelecimentoId } });
  }

  const initialError = !hasResolvedSnapshot && (favoritesError ?? resolutionError);
  const initialLoading = !hasResolvedSnapshot && (favoritesLoading || resolving);
  const empty = snapshot.hubs.length === 0 && snapshot.stores.length === 0;

  return (
    <Screen>
      <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
        <Text style={styles.backIcon}>‹</Text>
      </Pressable>
      <Text style={styles.title}>Favoritos</Text>

      {initialError ? (
        <AsyncStateBlock
          kind="error"
          errorLabel="Não foi possível carregar seus favoritos. Tente novamente."
        />
      ) : initialLoading ? (
        <AsyncStateBlock kind="loading" />
      ) : empty ? (
        <AsyncStateBlock kind="empty" emptyLabel="Você ainda não tem hubs ou lojas favoritas." />
      ) : (
        <>
          {snapshot.hubs.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Hubs</Text>
              {snapshot.hubs.map((hub) => (
                <View key={hub.id} style={styles.hubRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !hub.ativo }}
                    disabled={!hub.ativo}
                    onPress={() => openHub(hub.id)}
                    style={styles.hubContent}
                  >
                    <ImagePlaceholder uri={hub.foto_url} />
                    <View style={styles.entityInfo}>
                      <Text style={styles.entityName} numberOfLines={1}>{hub.nome}</Text>
                      <Text style={styles.entityMeta} numberOfLines={2}>{hub.endereco}</Text>
                      {!hub.ativo && <Text style={styles.unavailable}>Indisponível</Text>}
                    </View>
                  </Pressable>
                  <FavoriteButton
                    kind="hub"
                    resourceId={hub.id}
                    resourceName={hub.nome}
                  />
                </View>
              ))}
            </View>
          )}

          {snapshot.stores.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Lojas</Text>
              {snapshot.stores.map((store) => {
                const availability = resolveLojaDisponibilidade(store);
                return (
                  <View key={store.id}>
                    <StoreCard
                      loja={store}
                      disponibilidade={availability}
                      onPress={() => openStore(store.id)}
                    />
                    {!availability.disponivelParaCompra && (
                      <Text style={styles.storeUnavailable}>Indisponível</Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: lightColors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing['4'],
  },
  backIcon: {
    fontSize: typography.sizes.xl.fontSize,
    color: lightColors.text.primary,
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
    color: lightColors.text.primary,
  },
  section: {
    marginTop: spacing['6'],
  },
  sectionTitle: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
    marginBottom: spacing['1'],
  },
  hubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
    paddingVertical: spacing['3'],
  },
  hubContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
  },
  entityInfo: {
    flex: 1,
  },
  entityName: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  entityMeta: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
    marginTop: 2,
  },
  unavailable: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.warning,
    marginTop: spacing['1'],
  },
  storeUnavailable: {
    alignSelf: 'flex-end',
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.warning,
    marginTop: -spacing['2'],
  },
});
