import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AsyncStateBlock, DevStateToggle, StoreCard, toAsyncCallOptions, type DevSimState } from '../../components/discovery';
import { ImagePlaceholder } from '../../components/discovery/ImagePlaceholder';
import { Screen } from '../../components/ui';
import { useHubDetail } from '../../hooks/useHubDetail';
import { useStoresList } from '../../hooks/useStoresList';
import type { HomeStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Hub'>;

/**
 * Tela do Hub (Task 2, AC1-AC4): detalhe do hub + lojas daquele hub.
 */
export default function Hub({ route, navigation }: Props) {
  const { hubId } = route.params;
  const [devState, setDevState] = useState<DevSimState>('normal');
  const options = toAsyncCallOptions(devState);

  const { data: hub, loading: loadingHub, error: errorHub } = useHubDetail(hubId, options);
  const { data: lojas, loading: loadingLojas, error: errorLojas } = useStoresList(hubId, options);

  const loading = loadingHub || loadingLojas;
  const error = errorHub ?? errorLojas;

  return (
    <Screen>
      <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
        <Text style={styles.backIcon}>‹</Text>
      </Pressable>

      <DevStateToggle value={devState} onChange={setDevState} />

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
            {lojas.length === 0 ? (
              <AsyncStateBlock kind="empty" emptyLabel="Nenhuma loja neste hub ainda." />
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
