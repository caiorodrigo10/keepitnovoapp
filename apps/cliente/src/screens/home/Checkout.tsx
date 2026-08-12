import { useEffect } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';

import { businessConfig } from '@keepit/config';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { CartItemRow, SummaryLinkRow } from '../../components/checkout';
import { Button, Checkbox, Screen } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { useHubDetail } from '../../hooks/useHubDetail';
import { useStoreDetail } from '../../hooks/useStoreDetail';
import { computeCheckoutTotals } from '../../lib/checkoutTotals';
import {
  calcularTicketMinimo,
  deveSincronizarCpfCollected,
  faltaParaTicketMinimo,
  podeFinalizarNoHorario,
} from '../../lib/checkoutValidation';
import { DEFAULT_HUB_ID } from '../../lib/discoveryDisplay';
import { formatReais } from '../../lib/format';
import type { HomeStackParamList, RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Checkout'>;

/**
 * Checkout (Story 6.2, AC1-AC7). Tela combinada "Carrinho · checkout" do
 * protótipo (`cliente-04-carrinho.png`): itens (somente leitura), ponto de
 * retirada, forma de pagamento, resumo "COMPRA" (Subtotal / Taxa de
 * deslocamento / Taxa de serviço / Total) e botão "Pagar R$ {total}".
 *
 * **Correção de débito herdado (Story 0.6):** a implementação anterior
 * calculava `subtotal * businessConfig.taxaKeepitPercent / 100` e mostrava
 * isso ao cliente rotulado "Taxa de serviço" — ERRADO (Rodada 8,
 * `docs/PERGUNTAS_REGRAS_NEGOCIO.md` linha 561): a taxa Keepit é cobrada do
 * LOJISTA (deduzida internamente do repasse, Épico 7), NUNCA exibida ao
 * cliente. Esta tela não lê `taxaKeepitPercent` em nenhum lugar.
 *
 * "Taxa de serviço" agora é `businessConfig.taxaServicoCompradorReais`
 * (constante fixa NOVA, R$ 2,90) — [!] PROVISÓRIA, pendente de ratificação
 * do stakeholder (Rodada 8, linhas 562-563). O indicador visual de
 * "provisório" (`styles.provisorioTag`) só pode sair por uma Story futura,
 * DEPOIS dessa ratificação.
 */
export default function Checkout({ navigation }: Props) {
  const cart = useCart();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const hubId = cart.hubId ?? DEFAULT_HUB_ID;
  const { data: hub } = useHubDetail(hubId, {});
  const { data: loja } = useStoreDetail(cart.estabelecimentoId ?? '', {});
  const { data: cliente } = useCurrentCliente();

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

  // AC2: `taxa_deslocamento_reais` real via `StorePort.getById`/`useStoreDetail`
  // (já reais desde a Story 4.5/5.4/5.5) — sem novo adapter.
  const taxaDeslocamentoReais = loja?.taxa_deslocamento_reais ?? 0;
  // AC4: nova taxa fixa (não percentual) ao comprador, sempre lida de
  // `businessConfig` — nunca hard-coded na tela.
  // AC5: Total = Subtotal + Taxa de deslocamento + Taxa de serviço — a taxa
  // Keepit (lojista) nunca entra nesta soma (ver `lib/checkoutTotals.ts`).
  const { taxaServicoReais, totalReais } = computeCheckoutTotals(
    cart.subtotalReais,
    taxaDeslocamentoReais,
    businessConfig.taxaServicoCompradorReais,
  );

  // Story 6.4 (AC1-AC4): COALESCE `estabelecimento.ticket_minimo_reais ??
  // businessConfig.ticketMinimoReais`. "Abaixo do mínimo" é estritamente
  // `<` — subtotal igual ao mínimo é um pedido válido.
  const ticketMinimo = calcularTicketMinimo(loja);
  const abaixoDoTicketMinimo = cart.subtotalReais < ticketMinimo;
  const faltaParaMinimo = faltaParaTicketMinimo(cart.subtotalReais, ticketMinimo);

  const payment = cart.payment;
  const cartaoSelecionado =
    payment?.type === 'cartao' ? cart.cards.find((card) => card.id === payment.cardId) : undefined;
  const formaPagamentoLabel =
    payment?.type === 'pix' ? 'PIX' : cartaoSelecionado ? `Cartão •••• ${cartaoSelecionado.ultimo4}` : 'Escolher';

  const handlePagar = () => {
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
          <Text style={styles.totaisLabel}>Taxa de deslocamento</Text>
          <Text style={styles.totaisValue}>{formatReais(taxaDeslocamentoReais)}</Text>
        </View>
        {taxaServicoReais > 0 && (
          <View style={styles.totaisRow}>
            <View style={styles.taxaServicoLabelRow}>
              <Text style={styles.totaisLabel}>Taxa de serviço</Text>
              <Text style={styles.provisorioTag}>provisório</Text>
            </View>
            <Text style={styles.totaisValue}>{formatReais(taxaServicoReais)}</Text>
          </View>
        )}
        <View style={styles.divider} />
        <View style={styles.totaisRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatReais(totalReais)}</Text>
        </View>
      </View>

      <View style={styles.nfRow}>
        <Checkbox checked={cart.nfSolicitada} onToggle={() => cart.setNfSolicitada(!cart.nfSolicitada)}>
          Solicitar nota fiscal
        </Checkbox>
      </View>

      {abaixoDoTicketMinimo && (
        <Text style={styles.avisoTicketMinimo}>
          Pedido mínimo {formatReais(ticketMinimo)}. Adicione mais {formatReais(faltaParaMinimo)}.
        </Text>
      )}

      <Button
        title={`Pagar ${formatReais(totalReais)}`}
        onPress={handlePagar}
        disabled={cart.items.length === 0 || abaixoDoTicketMinimo}
      />
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
  taxaServicoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
  },
  provisorioTag: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.xs.fontSize,
    color: lightColors.accent.warning,
    textTransform: 'uppercase',
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
