import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { businessConfig } from '@keepit/config';
import { getDataClient } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AsyncStateBlock } from '../../components/discovery';
import { Button, Screen } from '../../components/ui';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { usePedidoDetail } from '../../hooks/usePedidoDetail';
import type { PedidosStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PedidosStackParamList, 'ChegueiAoHub'>;

/**
 * "Cheguei ao hub" (Task 3, AC1/AC2/AC3/AC4) — sem trecho literal
 * confirmado no protótipo bundled (busca textual não encontrou), segue os
 * padrões visuais já estabelecidos nas demais telas desta story (mesma
 * tipografia/cores de `@keepit/ui-tokens`) — sinalizar para @ux-expert
 * validar quando houver mais telas do protótipo/Figma disponíveis.
 *
 * Religado para `client.order.markClienteChegou` (Story 1.10, Task 2) —
 * `cliente_chegou_em` agora persiste no mock db real (antes era gravado só
 * em `OrderStatusOverrideContext` local, removido nesta story).
 */
export default function ChegueiAoHub({ route, navigation }: Props) {
  const { data: cliente } = useCurrentCliente();
  const { data: pedido, loading, error, refresh } = usePedidoDetail(cliente?.id ?? null, route.params?.pedidoId);
  const [confirmando, setConfirmando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const jaChegou = !!pedido?.cliente_chegou_em;

  const handleConfirmar = async () => {
    if (!pedido) return;
    setConfirmando(true);
    setErroAcao(null);
    try {
      await getDataClient().order.markClienteChegou(pedido.id);
      refresh();
      setConfirmado(true);
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : 'Não foi possível confirmar. Tente novamente.');
    } finally {
      setConfirmando(false);
    }
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.roundButton}>
          <Text style={styles.roundButtonIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Cheguei ao hub</Text>
        <View style={styles.roundButton} />
      </View>

      {loading && <AsyncStateBlock kind="loading" />}
      {!loading && !!error && <AsyncStateBlock kind="error" />}
      {!loading && !error && !pedido && (
        <AsyncStateBlock kind="empty" emptyLabel="Nenhum pedido em andamento para confirmar chegada." />
      )}

      {!loading && !error && pedido && (
        <>
          <Text style={styles.copy}>
            Toque no botão abaixo assim que você chegar ao hub. O lojista também precisa confirmar a chegada dele —
            vocês terão até {businessConfig.janelaToleranciaHubMin} minutos para se encontrarem.
          </Text>

          {(confirmado || jaChegou) ? (
            <View style={styles.confirmadoCard}>
              <Text style={styles.confirmadoTitulo}>Chegada confirmada</Text>
              <Text style={styles.confirmadoCopy}>
                Aguardando o lojista. Mostre o código de retirada quando ele chegar.
              </Text>
            </View>
          ) : (
            <>
              {!!erroAcao && <Text style={styles.erro}>{erroAcao}</Text>}
              <Button title="Cheguei ao hub" onPress={handleConfirmar} loading={confirmando} />
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing['5'],
  },
  roundButton: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: lightColors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButtonIcon: {
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
    color: lightColors.text.primary,
  },
  copy: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.secondary,
    lineHeight: typography.sizes.md.lineHeight,
    marginBottom: spacing['6'],
  },
  confirmadoCard: {
    backgroundColor: lightColors.accent.successBgAlt,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: lightColors.accent.successBorder,
    padding: spacing['4'],
  },
  confirmadoTitulo: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.accent.successFg,
    marginBottom: spacing['1'],
  },
  confirmadoCopy: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.successFg,
  },
  erro: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.warning,
    marginBottom: spacing['3'],
  },
});
