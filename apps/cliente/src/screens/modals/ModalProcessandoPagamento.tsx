import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AsyncStateBlock } from '../../components/discovery';
import { AppHeader, Button, FormScreen, Screen } from '../../components/ui';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { useCurrentEmail } from '../../hooks/useCurrentEmail';
import { useSavedCards } from '../../hooks/useSavedCards';
import { usePagamentoSimulado } from '../../hooks/usePagamentoSimulado';
import { usePedidoDetail } from '../../hooks/usePedidoDetail';
import { usePagamentoReal } from '../../hooks/usePagamentoReal';
import { canSubmitCard, paymentMessage } from '../../lib/paymentStatus';
import { isMockDataSource, isSupabaseDataSource } from '../../lib/dataSource';
import { formatReais } from '../../lib/format';
import { CardPaymentForm } from '../../components/checkout/CardPaymentForm';
import { CARTAO_AUTO_CONFIRM_DELAY_MS } from '../../lib/pagamentoSimulado';
import { CARD_TOKENIZATION_ENABLED } from '../../config/featureFlags';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ModalProcessandoPagamento'>;

export default function ModalProcessandoPagamento(props: Props) {
  if (isSupabaseDataSource()) return <PagamentoCartaoReal {...props} />;
  if (isMockDataSource()) return <PagamentoCartaoDemo {...props} />;
  return <Screen><Text>Pagamento indisponível. Verifique a configuração do aplicativo.</Text></Screen>;
}

function PagamentoCartaoReal({ route, navigation }: Props) {
  const { pedidoId, cartaoSalvoId } = route.params;
  const [choice, setChoice] = useState<{ type: 'novo' } | { type: 'salvo'; id: string } | null>(
    () => CARD_TOKENIZATION_ENABLED && cartaoSalvoId ? { type: 'salvo', id: cartaoSalvoId } : { type: 'novo' },
  );
  const { data: cliente } = useCurrentCliente();
  const savedCards = useSavedCards(cliente?.id ?? null);
  const { data: email } = useCurrentEmail();
  const { data: pedido, loading, error } = usePedidoDetail(cliente?.id ?? null, pedidoId);
  const complete = useCallback(() => navigation.replace('ModalConfirmarPin', { pedidoId }), [navigation, pedidoId]);
  const payment = usePagamentoReal(pedidoId, cliente?.id ?? null, complete);
  useEffect(() => {
    if (payment.actionCode === 'CARTAO_TOKEN_INVALIDO') {
      setChoice(null);
      void savedCards.refresh();
    }
  }, [payment.actionCode, savedCards.refresh]);
  const visibleCards = CARD_TOKENIZATION_ENABLED ? savedCards.cards : [];
  const selectedCard = choice?.type === 'salvo' ? visibleCards.find((card) => card.id === choice.id) : undefined;
  const selectedUnavailable = choice?.type === 'salvo' && !savedCards.loading && !selectedCard;
  const terminal = payment.attempt?.estado === 'recusado' || payment.attempt?.estado === 'expirado';
  const canChangeMethod = terminal || selectedUnavailable || payment.actionCode === 'CARTAO_TOKEN_INVALIDO' || payment.actionCode === 'CARD_TOKENIZATION_DISABLED';
  const canPay = payment.loaded && (!payment.error || terminal)
    && pedido?.status === 'aguardando_pagamento' && canSubmitCard(payment.attempt);
  return <FormScreen>
    <AppHeader title="Cartão de crédito à vista" back={{ navigation, fallback: () => navigation.navigate('Main', { screen: 'PedidosTab', params: { screen: 'MeusPedidos' } }) }} />
    {(loading || !payment.loaded) && <ActivityIndicator />}
    {(error || payment.error) && <Text accessibilityRole="alert">{payment.error ?? 'Não foi possível carregar o pedido.'}</Text>}
    {pedido && <>
      <Text>Resumo do pedido</Text>
      <Text>Total: {formatReais(pedido.total_pago_reais)}</Text>
      <Text>{paymentMessage(payment.attempt)}</Text>
      {payment.attempt?.avisoCartao === 'nao_salvo'
        && <Text accessibilityRole="alert">O pagamento segue válido, mas este cartão não foi salvo. Você poderá adicioná-lo novamente depois.</Text>}
      {selectedCard && <Text>Cartão salvo •••• {selectedCard.ultimo4}</Text>}
      {selectedUnavailable && <Text accessibilityRole="alert">Este cartão não está mais disponível. Escolha outro cartão ou pague com PIX.</Text>}
      {canPay && selectedCard
        && <Button title="Pagar" onPress={() => payment.pagarCartao({ type: 'cartao_salvo', cartaoSalvoId: selectedCard.id })} loading={payment.submitting} />}
      {canPay && choice?.type === 'novo'
        && <CardPaymentForm
          mode="compra"
          initialHolder={{ name: cliente?.nome, email: email ?? undefined, cpfCnpj: cliente?.cpf ?? undefined, phone: cliente?.telefone ?? undefined }}
          valorValidacaoCentavos={null}
          onSubmit={({ cartao, titular, salvarCartao }) => payment.pagarCartao({ type: 'cartao_novo', cartao, titular, salvarCartao })}
          disabled={payment.submitting}
        />}
      {canChangeMethod && <>
        <Text>Escolha outra forma para este mesmo pedido.</Text>
        {visibleCards.map((card) => (
          <Pressable key={card.id} onPress={() => setChoice({ type: 'salvo', id: card.id })}>
            <Text>Usar cartão •••• {card.ultimo4}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => { setChoice({ type: 'novo' }); payment.refresh(); }}><Text>Usar novo cartão</Text></Pressable>
        <Button title="Pagar com PIX" onPress={() => navigation.replace('ModalPagamentoPix', { pedidoId })} disabled={payment.submitting} />
      </>}
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
