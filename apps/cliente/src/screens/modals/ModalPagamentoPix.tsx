import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AsyncStateBlock } from '../../components/discovery';
import { AppHeader, Button, Screen } from '../../components/ui';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { usePagamentoSimulado } from '../../hooks/usePagamentoSimulado';
import { usePedidoDetail } from '../../hooks/usePedidoDetail';
import { PIX_AUTO_CONFIRM_DELAY_MS, pixCopiaCola } from '../../lib/pagamentoSimulado';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ModalPagamentoPix'>;

/** Rótulo temporário "Copiado!" — sem lib de toast nova (Scope Excluído da Story). */
const COPIADO_LABEL_MS = 2000;

/**
 * `ModalPagamentoPix` (Story 6.7.1, AC1, AC2, AC7, AC8) — feedback visual
 * entre "Pagar" (PIX, `Pagamento.tsx`) e a tela do PIN (`ModalConfirmarPin`,
 * Story 6.7): QR REAL (escaneável) gerado a partir do payload PIX 100% FAKE
 * (`pixCopiaCola`, `lib/pagamentoSimulado.ts`) + código copia-e-cola com
 * botão "Copiar" + confirmação automática simulada (~5s) via
 * `usePagamentoSimulado` (motor puro `startPagamentoSimulado`).
 *
 * O payload nunca é enviado a nenhum PSP real — é só uma string plausível
 * para o QR/copia-e-cola parecerem produto pronto no demo (Épico 7/Bloco
 * 08-PIX, deferido, é quem trará o QR/cobrança PIX reais).
 *
 * AC8 — erro/retry: se `confirmarPagamento` falhar, mostra estado de erro
 * com "Tentar novamente" — nunca fica preso num loading infinito nem navega
 * ao PIN sem confirmação real.
 */
export default function ModalPagamentoPix({ route, navigation }: Props) {
  const { pedidoId } = route.params;
  const { data: cliente } = useCurrentCliente();
  const { data: pedido, loading, error } = usePedidoDetail(cliente?.id ?? null, pedidoId);
  const [copiado, setCopiado] = useState(false);
  const copiadoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiadoTimeoutRef.current !== null) {
        clearTimeout(copiadoTimeoutRef.current);
      }
    };
  }, []);

  const handleComplete = useCallback(() => {
    navigation.replace('ModalConfirmarPin', { pedidoId });
  }, [navigation, pedidoId]);

  const { status, retry } = usePagamentoSimulado(pedidoId, PIX_AUTO_CONFIRM_DELAY_MS, handleComplete);

  const handleCopiar = useCallback(async () => {
    if (!pedido) return;
    await Clipboard.setStringAsync(pixCopiaCola(pedido));
    setCopiado(true);
    if (copiadoTimeoutRef.current !== null) {
      clearTimeout(copiadoTimeoutRef.current);
    }
    copiadoTimeoutRef.current = setTimeout(() => setCopiado(false), COPIADO_LABEL_MS);
  }, [pedido]);

  return (
    <Screen>
      <AppHeader
        title="Pagamento PIX"
        back={{
          navigation,
          fallback: () =>
            navigation.navigate('Main', { screen: 'PedidosTab', params: { screen: 'MeusPedidos' } }),
        }}
      />

      {loading && <AsyncStateBlock kind="loading" />}
      {!loading && (!!error || !pedido) && (
        <AsyncStateBlock kind="error" errorLabel="Não foi possível carregar o pedido." />
      )}

      {!loading && pedido && (
        <>
          <View style={styles.qrCard}>
            <QRCode value={pixCopiaCola(pedido)} size={200} backgroundColor={lightColors.bg.primary} />
          </View>

          <Text style={styles.codigoLabel}>Código copia e cola</Text>
          <Text style={styles.codigo} numberOfLines={3}>
            {pixCopiaCola(pedido)}
          </Text>
          <Pressable onPress={handleCopiar} style={styles.copiarButton}>
            <Text style={styles.copiarButtonLabel}>{copiado ? 'Copiado!' : 'Copiar'}</Text>
          </Pressable>

          {status === 'erro' ? (
            <View style={styles.statusCard}>
              <Text style={styles.statusErroTexto}>Não foi possível confirmar o pagamento.</Text>
              <Button title="Tentar novamente" onPress={retry} />
            </View>
          ) : (
            <View style={styles.statusCard}>
              <Text style={styles.statusTexto}>
                {status === 'confirmado' ? 'Pagamento confirmado' : 'Aguardando pagamento'}
              </Text>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  qrCard: {
    backgroundColor: lightColors.bg.primary,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: lightColors.border.default,
    padding: spacing['5'],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing['4'],
  },
  codigoLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.xs.fontSize,
    color: lightColors.text.tertiary,
    marginBottom: spacing['2'],
  },
  codigo: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.md,
    padding: spacing['3'],
    marginBottom: spacing['3'],
  },
  copiarButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing['2'],
    marginBottom: spacing['5'],
  },
  copiarButtonLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.accent.successFg,
  },
  statusCard: {
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.card,
    padding: spacing['4'],
    alignItems: 'center',
    gap: spacing['3'],
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
