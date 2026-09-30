import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';

import { getDataClient } from '@keepit/core-data';
import { lightColors, spacing, typography } from '@keepit/ui-tokens';

import { SelectableRow } from '../../components/checkout';
import { AppHeader, Button, Screen } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useCotacao } from '../../hooks/useCotacao';
import { createOrderFromQuote } from '../../lib/createOrderFromQuote';
import { formatReais } from '../../lib/format';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { useStoreDetail } from '../../hooks/useStoreDetail';
import { checkoutTotalsFromQuote } from '../../lib/checkoutTotals';
import {
  canCheckoutStore,
  getCheckoutStoreBlockMessage,
  loadCheckoutStoreForSubmission,
} from '../../lib/checkoutValidation';
import { isSupabaseDataSource } from '../../lib/dataSource';
import { invalidatePedidos } from '../../lib/ordersResource';
import { createPaymentSubmissionController } from '../../lib/paymentSubmission';
import type { HomeStackParamList, RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Pagamento'>;

export default function Pagamento({ navigation }: Props) {
  const cart = useCart();
  const { data: cliente } = useCurrentCliente();
  const { data: loja, loading: storeLoading } = useStoreDetail(cart.estabelecimentoId ?? '', {});
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [cleanupPending, setCleanupPending] = useState(false);
  const paymentSubmissionRef = useRef(createPaymentSubmissionController());

  const quote = useCotacao(cart.estabelecimentoId && cart.hubId && cart.items.length ? {
    estabelecimentoId: cart.estabelecimentoId, hubId: cart.hubId,
    itens: cart.items.map((item) => ({ produtoId: item.produtoId, quantidade: item.quantidade })),
  } : null, cliente?.id);
  const totals = quote.data ? checkoutTotalsFromQuote(quote.data) : null;

  const real = isSupabaseDataSource();
  const semCartaoSalvo = !real && cart.cards.length === 0;
  const lojaDisponivelParaCompra = canCheckoutStore(loja);
  const lojaIndisponivelMensagem = getCheckoutStoreBlockMessage(loja);

  const handlePagar = async () => {
    const pendingTarget = paymentSubmissionRef.current.getPendingTarget();
    if (!pendingTarget && !quote.data) return;
    if (!pendingTarget && !canCheckoutStore(loja)) {
      setErro(getCheckoutStoreBlockMessage(loja) ?? 'Esta loja está fechada agora');
      return;
    }

    if (
      !pendingTarget &&
      (!quote.data || quote.loading || !cart.payment || !cliente || !cart.estabelecimentoId || !cart.hubId || cart.items.length === 0)
    ) {
      return;
    }
    const paymentType = pendingTarget?.paymentType ?? cart.payment?.type;
    if (!paymentType) {
      return;
    }

    setEnviando(true);
    setErro(null);
    try {
      const client = getDataClient();
      const result = await paymentSubmissionRef.current.submit({
        paymentType,
        clearOrder: cart.clearOrder,
        createOrder: async () => {
          const estabelecimentoId = cart.estabelecimentoId;
          if (!quote.data || quote.loading || !cart.payment || !cliente || !estabelecimentoId || !cart.hubId || cart.items.length === 0) {
            throw new Error('Dados do carrinho ficaram indisponíveis antes da criação do pedido.');
          }

          await loadCheckoutStoreForSubmission(estabelecimentoId, (id) => client.store.getById(id));
          if (!quote.data) throw new Error('Obtenha uma nova cotação antes de continuar.');
          return createOrderFromQuote(client, {
            source: isSupabaseDataSource() ? 'supabase' : 'mock', cotacao: quote.data,
            clienteId: cliente.id, estabelecimentoId, hubId: cart.hubId,
            forma: paymentType, nfSolicitada: cart.nfSolicitada, itens: cart.items,
          });
        },
        afterCreate: async () => {
          if (!cliente) {
            return;
          }
          void invalidatePedidos(cliente.id);


        },
      });

      if (result.status === 'busy') {
        return;
      }

      if (result.status === 'cleanup_failed') {
        setCleanupPending(true);
        setErro(
          'Pedido criado, mas não foi possível limpar o carrinho. Toque em Continuar para tentar a limpeza novamente; nenhum novo pedido será criado.',
        );
        return;
      }

      // Story 6.7.1 (AC1, AC3, AC7): nunca navega "seco" — sempre passa por
      // uma tela de feedback de pagamento antes do PIN, nos dois
      // DATA_SOURCE (ver AUTO-DECISION no JSDoc do arquivo).
      setCleanupPending(false);
      if (result.target.paymentType === 'pix') {
        rootNavigation.navigate('ModalPagamentoPix', { pedidoId: result.target.pedidoId });
      } else {
        rootNavigation.navigate('ModalProcessandoPagamento', { pedidoId: result.target.pedidoId });
      }
    } catch (error) {
      setErro(error instanceof Error && error.message.includes('CHECKOUT_INDISPONIVEL')
        ? 'O pagamento ainda não está disponível. Seu carrinho foi mantido.'
        : 'Não foi possível concluir o pagamento. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="Pagamento" back={{ navigation, fallback: () => navigation.navigate('Home') }} />

      <Text style={styles.sectionTitle}>{real ? 'FORMA DE PAGAMENTO' : 'FORMAS DE DEMONSTRAÇÃO'}</Text>

      <SelectableRow
        selected={cart.payment?.type === 'pix'}
        title="PIX"
        highlight="Confirmação após o pagamento"
        onPress={() => cart.setPayment({ type: 'pix' })}
      />

      {real && <SelectableRow selected={cart.payment?.type === 'cartao'} title="Cartão de crédito à vista"
        subtitle="Informe os dados na próxima tela. O cartão não será salvo."
        onPress={() => cart.setPayment({ type: 'cartao', cardId: 'transitorio' })} />}
      {!real && cart.cards.map((card) => (
        <SelectableRow
          key={card.id}
          selected={cart.payment?.type === 'cartao' && cart.payment.cardId === card.id}
          title={`Cartão •••• ${card.ultimo4}`}
          subtitle={`Demonstração · ${card.bandeira}`}
          onPress={() => cart.setPayment({ type: 'cartao', cardId: card.id })}
        />
      ))}

      {!real && <Pressable style={styles.addCardLink} onPress={() => navigation.navigate('AdicionarCartao')}>
        <Text style={styles.addCardLinkLabel}>+ Adicionar cartão de demonstração</Text>
      </Pressable>}

      {!!(erro ?? (!storeLoading && !cleanupPending ? lojaIndisponivelMensagem : null)) && (
        <Text accessibilityRole="alert" style={styles.erro}>
          {erro ?? lojaIndisponivelMensagem}
        </Text>
      )}

      {quote.loading && !cleanupPending && <Text>Calculando total…</Text>}
      {quote.error && !cleanupPending && <View><Text accessibilityRole="alert">{quote.error}</Text><Button title="Tentar cotação novamente" onPress={quote.refresh} /></View>}
      {totals && <Text>Total: {formatReais(totals.totalReais)} · Taxa de serviço: {formatReais(totals.taxaServicoReais)}</Text>}
      <View style={styles.footer}>
        <Button
          title={cleanupPending ? 'Continuar' : totals ? `Pagar ${formatReais(totals.totalReais)}` : 'Aguardando total'}
          onPress={handlePagar}
          loading={enviando}
          disabled={
            !cleanupPending &&
            (!quote.data || quote.loading || !cart.payment ||
              cart.items.length === 0 ||
              !lojaDisponivelParaCompra ||
              (semCartaoSalvo && cart.payment?.type === 'cartao'))
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.xs.fontSize,
    color: lightColors.text.tertiary,
    marginBottom: spacing['3'],
    letterSpacing: 0.5,
  },
  addCardLink: {
    paddingVertical: spacing['3'],
  },
  addCardLinkLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.accent.successFg,
  },
  erro: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.warning,
    marginTop: spacing['2'],
  },
  footer: {
    marginTop: spacing['6'],
  },
});
