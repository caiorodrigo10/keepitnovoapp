import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AsyncStateBlock, StoreCard } from '../../components/discovery';
import { ImagePlaceholder } from '../../components/discovery/ImagePlaceholder';
import { Screen } from '../../components/ui';
import { useQaSimulation } from '../../context/QaScenarioContext';
import { useHubDetail } from '../../hooks/useHubDetail';
import { useStoresList } from '../../hooks/useStoresList';
import { isForcedLoading, simulationToAsyncCallOptions } from '../../lib/qaSimulation';
import { selectStoresForSurface } from '../../lib/storeDiscovery';
import type { HomeStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Hub'>;

/**
 * Tela do Hub (Task 2, AC1-AC4): detalhe do hub + lojas daquele hub.
 */
export default function Hub({ route, navigation }: Props) {
  const { hubId } = route.params;
  const hubsSimulation = useQaSimulation('hubs');
  const storesSimulation = useQaSimulation('stores');

  const { data: hub, loading: hubLoading, error: errorHub } = useHubDetail(
    hubId,
    simulationToAsyncCallOptions(hubsSimulation),
  );
  const { data: lojas, loading: storesLoading, error: errorLojas } = useStoresList(
    hubId,
    simulationToAsyncCallOptions(storesSimulation),
  );

  const loadingHub = hubLoading || isForcedLoading(hubsSimulation);
  const loadingLojas = storesLoading || isForcedLoading(storesSimulation);
  const loading = loadingHub || loadingLojas;
  const error = errorHub ?? errorLojas;
  const lojasDisponiveis = useMemo(() => selectStoresForSurface(lojas, 'purchase'), [lojas]);

  return (
    <Screen>
      <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
        <Text style={styles.backIcon}>‹</Text>
      </Pressable>

      {error ? (
        <AsyncStateBlock kind="error" errorLabel="Não foi possível carregar este hub. Tente novamente." />
      ) : loading ? (
        <AsyncStateBlock kind="loading" />
      ) : !hub ? (
        <AsyncStateBlock kind="empty" emptyLabel="Hub não encontrado." />
      ) : (
        <>
          <ImagePlaceholder uri={hub.foto_url} style={styles.foto} borderRadius={radii.card} />
          <Text style={styles.nome}>{hub.nome}</Text>
          <Text style={styles.endereco}>{hub.endereco}</Text>
          {hub.ponto_referencia && <Text style={styles.pontoReferencia}>{hub.ponto_referencia}</Text>}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Lojas neste hub</Text>
            {lojasDisponiveis.length === 0 ? (
              <AsyncStateBlock kind="empty" emptyLabel="Nenhuma loja neste hub ainda." />
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
  foto: {
    width: '100%',
    height: 160,
    marginBottom: spacing['4'],
  },
  nome: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
    color: lightColors.text.primary,
  },
  endereco: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.secondary,
    marginTop: spacing['1'],
  },
  pontoReferencia: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.tertiary,
    marginTop: spacing['1'],
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
});
