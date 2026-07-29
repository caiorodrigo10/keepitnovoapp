import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';

import { businessConfig } from '@keepit/config';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { CartItemRow, SummaryLinkRow } from '../../components/checkout';
import { Button, Screen } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useHubDetail } from '../../hooks/useHubDetail';
import { DEFAULT_HUB_ID } from '../../lib/discoveryDisplay';
import { formatReais } from '../../lib/format';
import type { HomeStackParamList, RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Checkout'>;

/**
 * Checkout (Task 2, AC1/AC2/AC4). Tela combinada "Carrinho · checkout" do
 * protótipo (`cliente-04-carrinho.png`): itens (somente leitura), ponto de
 * retirada, forma de pagamento, Subtotal/Taxa de serviço/Total e botão
 * "Pagar R$ {total}".
 *
 * **Taxa de serviço 🔴 (regra de negócio pendente):** o valor exato/
 * atribuição (Keepit ou hub) está pendente do stakeholder
 * (`docs/PERGUNTAS_REGRAS_NEGOCIO.md` §1.3). Nunca hardcoded — lida de
 * `businessConfig.taxaKeepitPercent` (placeholder, Story 0.2/0.6), aplicada
 * sobre o subtotal. Ver Dev Agent Record da Story 0.6 para o mapeamento
 * completo.
 */
export default function Checkout({ navigation }: Props) {
  const cart = useCart();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const hubId = cart.hubId ?? DEFAULT_HUB_ID;
  const { data: hub } = useHubDetail(hubId, {});

  // Pré-seleciona o hub/cartão default (Épico 0 não tem "hub atual" salvo no
  // perfil do cliente) — mesmo padrão de fallback usado pela Home (Story 0.5).
  useEffect(() => {
    if (!cart.hubId) {
      cart.setHubId(DEFAULT_HUB_ID);
    }
    if (!cart.payment && cart.cards.length > 0) {
      cart.setPayment({ type: 'cartao', cardId: cart.cards[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const taxaServicoReais = cart.subtotalReais * (businessConfig.taxaKeepitPercent / 100);
  const totalReais = cart.subtotalReais + taxaServicoReais;

  const payment = cart.payment;
  const cartaoSelecionado =
    payment?.type === 'cartao' ? cart.cards.find((card) => card.id === payment.cardId) : undefined;
  const formaPagamentoLabel =
    payment?.type === 'pix' ? 'PIX' : cartaoSelecionado ? `Cartão •••• ${cartaoSelecionado.ultimo4}` : 'Escolher';

  const handlePagar = () => {
    if (!cart.cpfCollected) {
      rootNavigation.navigate('ModalCPF', {
        onSubmit: () => navigation.navigate('Pagamento'),
      });
      return;
    }
    navigation.navigate('Pagamento');
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.roundButton}>
          <Text style={styles.roundButtonIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Checkout</Text>
        <View style={styles.roundButton} />
      </View>

      <View style={styles.items}>
        {cart.items.map((item) => (
          <CartItemRow key={item.produtoId} item={item} />
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
        onPress={() => navigation.navigate('Pagamento')}
      />

      <View style={styles.totais}>
        <View style={styles.totaisRow}>
          <Text style={styles.totaisLabel}>Subtotal</Text>
          <Text style={styles.totaisValue}>{formatReais(cart.subtotalReais)}</Text>
        </View>
        <View style={styles.totaisRow}>
          <Text style={styles.totaisLabel}>Taxa de serviço</Text>
          <Text style={styles.totaisValue}>{formatReais(taxaServicoReais)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.totaisRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatReais(totalReais)}</Text>
        </View>
      </View>

      <Button title={`Pagar ${formatReais(totalReais)}`} onPress={handlePagar} disabled={cart.items.length === 0} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing['4'],
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
