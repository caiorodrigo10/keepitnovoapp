import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AsyncStateBlock } from '../../components/discovery';
import { AppHeader, Button, Screen } from '../../components/ui';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { usePagamentoSimulado } from '../../hooks/usePagamentoSimulado';
import { usePedidoDetail } from '../../hooks/usePedidoDetail';
import { usePagamentoReal } from '../../hooks/usePagamentoReal';
import { canSubmitCard, paymentMessage } from '../../lib/paymentStatus';
import { isMockDataSource, isSupabaseDataSource } from '../../lib/dataSource';
import { PIX_AUTO_CONFIRM_DELAY_MS, pixCopiaCola } from '../../lib/pagamentoSimulado';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ModalPagamentoPix'>;

/** Rótulo temporário "Copiado!" — sem lib de toast nova (Scope Excluído da Story). */
const COPIADO_LABEL_MS = 2000;

export default function ModalPagamentoPix(props: Props) {
  if (isSupabaseDataSource()) return <PagamentoPixReal {...props} />;
  if (isMockDataSource()) return <PagamentoPixDemo {...props} />;
  return <Screen><Text>Pagamento indisponível. Verifique a configuração do aplicativo.</Text></Screen>;
}

function PagamentoPixReal({ route, navigation }: Props) {
  const { pedidoId } = route.params;
  const { data: cliente } = useCurrentCliente();
  const { data: pedido, loading, error } = usePedidoDetail(cliente?.id ?? null, pedidoId);
  const complete = useCallback(() => navigation.replace('ModalConfirmarPin', { pedidoId }), [navigation, pedidoId]);
  const payment = usePagamentoReal(pedidoId, cliente?.id ?? null, complete);
  const pix = payment.attempt?.pix;
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const expires = pix?.expiraEm ? Date.parse(pix.expiraEm) : NaN;
  const expired = Number.isFinite(expires) && expires <= Date.now();
  const payable = payment.attempt?.estado === 'pendente' && !expired;
  const copy = async () => {
    if (!pix || !payable) return;
    try { await Clipboard.setStringAsync(pix.copiaCola); setCopyMessage('Copiado!'); }
    catch { setCopyMessage('Não foi possível copiar. Tente novamente.'); }
  };
  return <Screen>
    <AppHeader title="Pagamento PIX" back={{ navigation, fallback: () => navigation.navigate('Main', { screen: 'PedidosTab', params: { screen: 'MeusPedidos' } }) }} />
    {(loading || !payment.loaded) && <AsyncStateBlock kind="loading" />}
    {(error || payment.error) && <Text accessibilityRole="alert">{payment.error ?? 'Não foi possível carregar o pedido.'}</Text>}
    {pedido && <>
      {pix && payable && <>
        <View style={styles.qrCard}><Image accessibilityLabel="QR Code PIX" source={{ uri: `data:image/png;base64,${pix.imagemBase64}` }} style={{ width: 200, height: 200 }} /></View>
        <Text style={styles.codigoLabel}>Código copia e cola</Text><Text style={styles.codigo}>{pix.copiaCola}</Text>
        <Button title="Copiar PIX" onPress={copy} />
        {copyMessage && <Text>{copyMessage}</Text>}
      </>}
      {pix?.expiraEm && <Text>Expira em: {Number.isFinite(expires) ? new Date(expires).toLocaleString('pt-BR') : pix.expiraEm}</Text>}
      {expired && <>
        <Text>O prazo deste QR terminou. Encerre a tentativa antes de gerar outro PIX.</Text>
        <Button title="Encerrar tentativa vencida" onPress={payment.encerrarTentativa} disabled={payment.submitting} />
      </>}
      <Text>{paymentMessage(payment.attempt)}</Text>
      {payment.loaded && !payment.error && pedido.status === 'aguardando_pagamento'
        && (canSubmitCard(payment.attempt) || (payment.attempt?.estado === 'pendente' && !pix))
        && <Button title={payment.attempt?.estado === 'pendente' ? 'Carregar QR PIX' : 'Gerar PIX'} onPress={payment.iniciarPix} loading={payment.submitting} />}
    </>}
    <Button title="Atualizar pagamento" onPress={payment.refresh} disabled={payment.submitting} />
    <Text>Você pode sair e retomar este pagamento em Meus pedidos.</Text>
  </Screen>;
}

function PagamentoPixDemo({ route, navigation }: Props) {
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

      <Text>Demonstração: este código não realiza pagamento.</Text>
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
