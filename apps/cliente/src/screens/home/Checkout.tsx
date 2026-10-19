import { useEffect } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';

import { CUSTOMER_LABELS } from '@keepit/config';
import { lightColors, spacing, typography } from '@keepit/ui-tokens';

import { CartItemRow, SummaryLinkRow } from '../../components/checkout';
import { AppHeader, Button, Checkbox, Screen } from '../../components/ui';
import { reconcilePaymentSelection, useCart } from '../../context/CartContext';
import { useCotacao } from '../../hooks/useCotacao';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { useSavedCards } from '../../hooks/useSavedCards';
import { useHubDetail } from '../../hooks/useHubDetail';
import { useStoreDetail } from '../../hooks/useStoreDetail';
import { checkoutTotalsFromQuote } from '../../lib/checkoutTotals';
import {
  calcularTicketMinimo,
  canCheckoutStore,
  deveSincronizarCpfCollected,
  faltaParaTicketMinimo,
  getCheckoutStoreBlockMessage,
  podeFinalizarNoHorario,
} from '../../lib/checkoutValidation';
import { formatReais } from '../../lib/format';
import { CARD_TOKENIZATION_ENABLED } from '../../config/featureFlags';
import type { HomeStackParamList, RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Checkout'>;

export default function Checkout({ navigation }: Props) {
  const cart = useCart();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const { data: hub } = useHubDetail(cart.hubId ?? '', {});
  const { data: loja, loading: storeLoading } = useStoreDetail(cart.estabelecimentoId ?? '', {});
  const { data: cliente } = useCurrentCliente();
  const savedCards = useSavedCards(cliente?.id ?? null);
  const selectedPayment = cart.payment;
  const visibleCards = CARD_TOKENIZATION_ENABLED ? savedCards.cards : [];

  // O principal do backend é só uma sugestão visual. Uma escolha explícita
  // nunca é trocada por ela e um ID removido é limpo, não substituído.
  useEffect(() => {
    if (!savedCards.loading && selectedPayment?.type === 'cartao_salvo'
      && !visibleCards.some((card) => card.id === selectedPayment.cartaoSalvoId)) {
      void cart.clearPayment();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPayment, visibleCards, savedCards.loading]);

  // Story 6.5 (AC1): inicializa `cart.cpfCollected` a partir do dado REAL do
  // cliente (`clientes.cpf`), não só da flag de sessão do `CartContext` —
  // sem isso, reabrir o app (nova sessão do Context) reapresentaria o modal
  // de CPF mesmo já tendo sido salvo no backend.
  useEffect(() => {
    if (deveSincronizarCpfCollected(cliente?.cpf, cart.cpfCollected)) {
      cart.markCpfCollected();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente?.cpf]);

  const quote = useCotacao(cart.estabelecimentoId && cart.hubId && cart.items.length ? {
    estabelecimentoId: cart.estabelecimentoId, hubId: cart.hubId,
    itens: cart.items.map((item) => ({ produtoId: item.produtoId, quantidade: item.quantidade, complementoIds: item.complementoIds ?? [] })),
  } : null, cliente?.id);
  const totals = quote.data ? checkoutTotalsFromQuote(quote.data) : null;

  // Story 6.4 (AC1-AC4): COALESCE `estabelecimento.ticket_minimo_reais ??
  // businessConfig.ticketMinimoReais`. "Abaixo do mínimo" é estritamente
  // `<` — subtotal igual ao mínimo é um pedido válido.
  const ticketMinimo = calcularTicketMinimo(loja);
  const subtotalParaMinimo = totals?.subtotalReais ?? cart.subtotalReais;
  const abaixoDoTicketMinimo = subtotalParaMinimo < ticketMinimo;
  const faltaParaMinimo = faltaParaTicketMinimo(subtotalParaMinimo, ticketMinimo);
  const lojaDisponivelParaCompra = canCheckoutStore(loja);
  const lojaIndisponivelMensagem = getCheckoutStoreBlockMessage(loja);

  const payment = cart.payment;
  const suggestedPayment = reconcilePaymentSelection(null, visibleCards);
  const cartaoSelecionado =
    payment?.type === 'cartao_salvo' ? visibleCards.find((card) => card.id === payment.cartaoSalvoId)
      : suggestedPayment?.type === 'cartao_salvo' ? visibleCards.find((card) => card.id === suggestedPayment.cartaoSalvoId)
        : undefined;
  const formaPagamentoLabel =
    payment?.type === 'pix' ? 'PIX' : payment?.type === 'cartao_novo' ? 'Novo cartão'
      : cartaoSelecionado ? `Cartão •••• ${cartaoSelecionado.ultimo4}` : 'Escolher';

  const handlePagar = () => {
    if (!quote.data) return;
    if (!canCheckoutStore(loja)) {
      Alert.alert(
        'Loja indisponível',
        getCheckoutStoreBlockMessage(loja) ?? 'Esta loja está fechada agora',
      );
      return;
    }

    if (!cart.hubId) {
      return;
    }

    // Story 6.3 (AC1-AC3): validação temporal SÍNCRONA client-side, ANTES de
    // qualquer outra validação/navegação — fail-closed (sem hub/loja
    // carregados ou hub fechado hoje, a validação nunca passa por omissão).
    if (!podeFinalizarNoHorario(loja, hub)) {
      Alert.alert(
        'Fora do horário do hub',
        'Este pedido não seria entregue dentro do horário do hub. Volte amanhã.',
      );
      return;
    }

    // Story 6.4 (AC2): abaixo do ticket mínimo bloqueia mesmo que o botão
    // já esteja `disabled` — defesa em profundidade, nunca confia só no
    // estado visual do botão.
    if (abaixoDoTicketMinimo) {
      return;
    }

    if (!cart.cpfCollected) {
      rootNavigation.navigate('ModalCPF', {
        onSubmit: () => navigation.navigate('Pagamento'),
      });
      return;
    }
    navigation.navigate('Pagamento');
  };

  const handleOpenPayment = () => {
    const blockMessage = getCheckoutStoreBlockMessage(loja);
    if (blockMessage) {
      Alert.alert('Loja indisponível', blockMessage);
      return;
    }

    navigation.navigate('Pagamento');
  };

  return (
    <Screen>
      <AppHeader title="Checkout" back={{ navigation, fallback: () => navigation.navigate('Home') }} />

      <View style={styles.items}>
        {cart.items.map((item) => (
          <CartItemRow key={item.itemKey ?? item.produtoId} item={item} />
        ))}
      </View>

      <SummaryLinkRow
        label="RETIRAR EM"
        title={hub?.nome ?? 'Selecionar hub'}
        subtitle={hub?.endereco}
        onPress={() => navigation.navigate('EscolhaRetirada')}
      />

      <SummaryLinkRow
        title={formaPagamentoLabel}
        onPress={handleOpenPayment}
      />

      {totals && <View style={styles.totais}>
        <View style={styles.totaisRow}>
          <Text style={styles.totaisLabel}>Subtotal</Text>
          <Text style={styles.totaisValue}>{formatReais(totals.subtotalReais)}</Text>
        </View>
        <View style={styles.totaisRow}>
          <Text style={styles.totaisLabel}>{CUSTOMER_LABELS.freight}</Text>
          <Text style={styles.totaisValue}>{formatReais(totals.taxaDeslocamentoReais)}</Text>
        </View>
        {totals.taxaServicoReais > 0 && (
          <View style={styles.totaisRow}>
            <Text style={styles.totaisLabel}>Taxa de serviço</Text>
            <Text style={styles.totaisValue}>{formatReais(totals.taxaServicoReais)}</Text>
          </View>
        )}
        <View style={styles.divider} />
        <View style={styles.totaisRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatReais(totals.totalReais)}</Text>
        </View>
      </View>}

      {quote.loading && <Text>Calculando total…</Text>}
      {quote.error && <View><Text accessibilityRole="alert">{quote.error}</Text><Button title="Tentar cotação novamente" onPress={quote.refresh} /></View>}

      <View style={styles.nfRow}>
        <Checkbox
          checked={cart.nfSolicitada}
          onToggle={() => cart.setNfSolicitada(!cart.nfSolicitada)}
          label="Solicitar nota fiscal"
        >
          Solicitar nota fiscal
        </Checkbox>
      </View>

      {abaixoDoTicketMinimo && (
        <Text style={styles.avisoTicketMinimo}>
          Pedido mínimo {formatReais(ticketMinimo)}. Adicione mais {formatReais(faltaParaMinimo)}.
        </Text>
      )}

      {!storeLoading && lojaIndisponivelMensagem && (
        <Text accessibilityRole="alert" style={styles.avisoLojaIndisponivel}>
          {lojaIndisponivelMensagem}
        </Text>
      )}

      <Button
        title={totals ? `Pagar ${formatReais(totals.totalReais)}` : 'Aguardando total'}
        onPress={handlePagar}
        disabled={!quote.data || quote.loading || cart.items.length === 0 || !cart.hubId || abaixoDoTicketMinimo || !lojaDisponivelParaCompra}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  items: {
    marginBottom: spacing['2'],
  },
  totais: {
    marginTop: spacing['2'],
    marginBottom: spacing['6'],
  },
  totaisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing['1'],
  },
  totaisLabel: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.secondary,
  },
  totaisValue: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
  },
  nfRow: {
    marginBottom: spacing['5'],
  },
  avisoTicketMinimo: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.warning,
    marginBottom: spacing['3'],
  },
  avisoLojaIndisponivel: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.warning,
    marginBottom: spacing['3'],
  },
  divider: {
    height: 1,
    backgroundColor: lightColors.border.default,
    marginVertical: spacing['2'],
  },
  totalLabel: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  totalValue: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
});
