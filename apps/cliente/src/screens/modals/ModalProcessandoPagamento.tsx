import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AsyncStateBlock } from '../../components/discovery';
import { AppHeader, Button, FormScreen, Screen } from '../../components/ui';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { usePagamentoSimulado } from '../../hooks/usePagamentoSimulado';
import { usePedidoDetail } from '../../hooks/usePedidoDetail';
import { usePagamentoReal } from '../../hooks/usePagamentoReal';
import { canSubmitCard, paymentMessage } from '../../lib/paymentStatus';
import { isMockDataSource, isSupabaseDataSource } from '../../lib/dataSource';
import { formatReais } from '../../lib/format';
import { CardPaymentForm } from '../home/AdicionarCartao';
import { CARTAO_AUTO_CONFIRM_DELAY_MS } from '../../lib/pagamentoSimulado';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ModalProcessandoPagamento'>;

export default function ModalProcessandoPagamento(props: Props) {
  if (isSupabaseDataSource()) return <PagamentoCartaoReal {...props} />;
  if (isMockDataSource()) return <PagamentoCartaoDemo {...props} />;
  return <Screen><Text>Pagamento indisponível. Verifique a configuração do aplicativo.</Text></Screen>;
}

function PagamentoCartaoReal({ route, navigation }: Props) {
  const { pedidoId } = route.params;
  const { data: cliente } = useCurrentCliente();
  const { data: pedido, loading, error } = usePedidoDetail(cliente?.id ?? null, pedidoId);
  const complete = useCallback(() => navigation.replace('ModalConfirmarPin', { pedidoId }), [navigation, pedidoId]);
  const payment = usePagamentoReal(pedidoId, cliente?.id ?? null, complete);
  return <FormScreen>
    <AppHeader title="Cartão de crédito à vista" back={{ navigation, fallback: () => navigation.navigate('Main', { screen: 'PedidosTab', params: { screen: 'MeusPedidos' } }) }} />
    {(loading || !payment.loaded) && <ActivityIndicator />}
    {(error || payment.error) && <Text accessibilityRole="alert">{payment.error ?? 'Não foi possível carregar o pedido.'}</Text>}
    {pedido && <>
      <Text>Total: {formatReais(pedido.total_pago_reais)}</Text>
      <Text>{paymentMessage(payment.attempt)}</Text>
      {payment.loaded && !payment.error && pedido.status === 'aguardando_pagamento' && canSubmitCard(payment.attempt)
        && <CardPaymentForm onSubmit={payment.pagarCartao} disabled={payment.submitting} />}
    </>}
    <Button title="Atualizar pagamento" onPress={payment.refresh} disabled={payment.submitting} />
    <Text>Você pode sair e retomar este pagamento em Meus pedidos.</Text>
  </FormScreen>;
}

function PagamentoCartaoDemo({ route, navigation }: Props) {
  const { pedidoId } = route.params;
  const { data: cliente } = useCurrentCliente();
  const { data: pedido, loading, error } = usePedidoDetail(cliente?.id ?? null, pedidoId);

  const handleComplete = useCallback(() => {
    navigation.replace('ModalConfirmarPin', { pedidoId });
  }, [navigation, pedidoId]);

  const { status, retry } = usePagamentoSimulado(pedidoId, CARTAO_AUTO_CONFIRM_DELAY_MS, handleComplete);

  return (
    <Screen>
      <AppHeader
        title="Pagamento"
        back={{
          navigation,
          fallback: () =>
            navigation.navigate('Main', { screen: 'PedidosTab', params: { screen: 'MeusPedidos' } }),
        }}
      />

      <Text>Demonstração: nenhum cartão será cobrado.</Text>
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
