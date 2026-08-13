import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AsyncStateBlock } from '../../components/discovery';
import { Button, Screen } from '../../components/ui';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { usePagamentoSimulado } from '../../hooks/usePagamentoSimulado';
import { usePedidoDetail } from '../../hooks/usePedidoDetail';
import { CARTAO_AUTO_CONFIRM_DELAY_MS } from '../../lib/pagamentoSimulado';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ModalProcessandoPagamento'>;

/**
 * `ModalProcessandoPagamento` (Story 6.7.1, AC3, AC7, AC8) — feedback visual
 * entre "Pagar" (cartão salvo, `Pagamento.tsx`) e a tela do PIN
 * (`ModalConfirmarPin`, Story 6.7): "Processando pagamento…" → "Pagamento
 * aprovado" (~2s simulado), via `usePagamentoSimulado` (mesmo motor puro
 * `startPagamentoSimulado` de `ModalPagamentoPix.tsx`, sem QR/copia-e-cola).
 *
 * AC8 — erro/retry: se `confirmarPagamento` falhar, mostra estado de erro
 * com "Tentar novamente" — nunca fica preso num loading infinito nem navega
 * ao PIN sem confirmação real.
 */
export default function ModalProcessandoPagamento({ route, navigation }: Props) {
  const { pedidoId } = route.params;
  const { data: cliente } = useCurrentCliente();
  const { data: pedido, loading, error } = usePedidoDetail(cliente?.id ?? null, pedidoId);

  const handleComplete = useCallback(() => {
    navigation.replace('ModalConfirmarPin', { pedidoId });
  }, [navigation, pedidoId]);

  const { status, retry } = usePagamentoSimulado(pedidoId, CARTAO_AUTO_CONFIRM_DELAY_MS, handleComplete);

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.roundButton}>
          <Text style={styles.roundButtonIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Pagamento</Text>
        <View style={styles.roundButton} />
      </View>

      {loading && <AsyncStateBlock kind="loading" />}
      {!loading && (!!error || !pedido) && (
        <AsyncStateBlock kind="error" errorLabel="Não foi possível carregar o pedido." />
      )}

      {!loading && pedido && (
        <View style={styles.statusCard}>
          {status === 'erro' ? (
            <>
              <Text style={styles.statusErroTexto}>Não foi possível confirmar o pagamento.</Text>
              <Button title="Tentar novamente" onPress={retry} />
            </>
          ) : (
            <>
              {status === 'aguardando' && <ActivityIndicator color={lightColors.accent.brand} />}
              <Text style={styles.statusTexto}>
                {status === 'confirmado' ? 'Pagamento aprovado' : 'Processando pagamento…'}
              </Text>
            </>
          )}
        </View>
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
  statusCard: {
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.card,
    padding: spacing['8'],
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing['4'],
    marginTop: spacing['8'],
  },
  statusTexto: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
    textAlign: 'center',
  },
  statusErroTexto: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.warning,
    textAlign: 'center',
  },
});
