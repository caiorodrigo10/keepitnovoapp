import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';

import { businessConfig } from '@keepit/config';
import { getDataClient } from '@keepit/core-data';
import { lightColors, spacing, typography } from '@keepit/ui-tokens';

import { SelectableRow } from '../../components/checkout';
import { AppHeader, Button, Screen } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { useStoreDetail } from '../../hooks/useStoreDetail';
import { computeCheckoutTotals } from '../../lib/checkoutTotals';
import { isSupabaseDataSource } from '../../lib/dataSource';
import { invalidatePedidos } from '../../lib/ordersResource';
import { createPaymentSubmissionController } from '../../lib/paymentSubmission';
import type { HomeStackParamList, RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Pagamento'>;

function roundReais(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Pagamento (Task 5, AC1/AC3/AC4). Fiel a `cliente-13-pagamento.png`
 * ("FORMAS SALVAS": PIX + cartão salvo). O card de "adicionar cartão"
 * (formulário) do protótipo virou a rota separada `AdicionarCartao`
 * (Task 6, alinhado ao inventário de telas da Story 0.3/AC1 desta story).
 *
 * Botão final "Pagar" (AC3): nenhuma cobrança real — chama
 * `order.port.create` para registrar o pedido com os dados já coletados
 * (carrinho, hub, forma de pagamento), sem tokenização/gateway/QR PIX
 * real.
 *
 * **Story 6.6 (Bloco 06).** Em `DATA_SOURCE=supabase`, "Pagar" chama a RPC
 * real `criar_pedido` (pagamento SIMULADO em dev — sem cobrança/QR PIX,
 * fronteira do Épico 7) via `OrderPort.create` (implementação real do
 * adapter Supabase).
 *
 * **Story 6.7.1 (AC1, AC3, AC7) — [AUTO-DECISION] visual unificado nos dois
 * `DATA_SOURCE`.** Depois de `order.create`, "Pagar" NUNCA navega "seco":
 * sempre passa por uma tela de feedback visual de pagamento antes do PIN
 * (`ModalConfirmarPin`, Story 6.7) — `ModalPagamentoPix` (PIX, QR REAL do
 * payload FAKE + copia-e-cola) ou `ModalProcessandoPagamento` (cartão
 * salvo), escolhida por `cart.payment.type`. Nos dois `DATA_SOURCE`
 * (mock e supabase) — não só quando `isSupabaseDataSource()` — porque o
 * `OrderPort.confirmarPagamento` chamado por essas telas é um no-op de
 * releitura no adapter Supabase (nenhuma mutação nova), mantendo a MESMA UX
 * sem inventar backend (ver Dev Notes da Story 6.7.1, "AUTO-DECISION").
 *
 * O antigo desvio para `PedidosTab` (mock) — Story 0.7 — deixa de existir:
 * agora as duas novas telas navegam para `ModalConfirmarPin` ao final
 * (mesmo destino que o supabase já usava desde a Story 6.7).
 *
 * Os totais enviados a `order.create` são EXATAMENTE os que o Checkout já
 * calculou/exibiu (`taxaDeslocamentoReais` via `useStoreDetail`, o MESMO
 * hook/dado que `Checkout.tsx` usa, e a MESMA fórmula `computeCheckoutTotals`,
 * Story 6.2) — nenhum valor novo inventado aqui. `taxa_keepit_reais` é a
 * ÚNICA derivação nova desta tela (nunca exibida ao cliente, Story 6.2
 * AC3), pela mesma fórmula já usada pelo mock (`order.mock.ts`,
 * `businessConfig.taxaKeepitPercent` sobre o subtotal).
 */
export default function Pagamento({ navigation }: Props) {
  const cart = useCart();
  const { data: cliente } = useCurrentCliente();
  const { data: loja } = useStoreDetail(cart.estabelecimentoId ?? '', {});
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [cleanupPending, setCleanupPending] = useState(false);
  const paymentSubmissionRef = useRef(createPaymentSubmissionController());

  const semCartaoSalvo = cart.cards.length === 0;

  const handlePagar = async () => {
    const pendingTarget = paymentSubmissionRef.current.getPendingTarget();
    if (
      !pendingTarget &&
      (!cart.payment || !cliente || !cart.estabelecimentoId || !cart.hubId || cart.items.length === 0)
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
          if (!cart.payment || !cliente || !cart.estabelecimentoId || !cart.hubId || cart.items.length === 0) {
            throw new Error('Dados do carrinho ficaram indisponíveis antes da criação do pedido.');
          }

          const taxaDeslocamentoReais = loja?.taxa_deslocamento_reais ?? 0;
          const { taxaServicoReais, totalReais } = computeCheckoutTotals(
            cart.subtotalReais,
            taxaDeslocamentoReais,
            businessConfig.taxaServicoCompradorReais,
          );
          const taxaKeepitReais = roundReais((cart.subtotalReais * businessConfig.taxaKeepitPercent) / 100);

          const pedido = await client.order.create({
            cliente_id: cliente.id,
            estabelecimento_id: cart.estabelecimentoId,
            hub_id: cart.hubId,
            itens: cart.items.map((item) => ({
              produto_id: item.produtoId,
              nome_snapshot: item.nome,
              preco_unitario_reais: item.precoSnapshotReais,
              quantidade: item.quantidade,
            })),
            forma_pagamento: paymentType,
            subtotal_produtos_reais: cart.subtotalReais,
            taxa_deslocamento_reais: taxaDeslocamentoReais,
            taxa_keepit_reais: taxaKeepitReais,
            taxa_servico_comprador_reais: taxaServicoReais,
            total_pago_reais: totalReais,
            nf_solicitada: cart.nfSolicitada,
          });

          return pedido;
        },
        afterCreate: async (pedido) => {
          if (!cliente) {
            return;
          }
          void invalidatePedidos(cliente.id);

          // Story 7.2 (AC5) — best-effort, só em DATA_SOURCE=supabase: cria a
          // cobrança PIX real no Asaas para este pedido, em paralelo ao fluxo
          // simulado abaixo. Uma falha não repete nem invalida o pedido criado.
          if (isSupabaseDataSource()) {
            try {
              await client.payment.criarCobrancaPix(pedido.id);
            } catch (err) {
              console.warn('[Pagamento] criarCobrancaPix falhou (best-effort):', err);
            }
          }
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
      setErro(error instanceof Error ? error.message : 'Não foi possível concluir o pagamento. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="Pagamento" back={{ navigation, fallback: () => navigation.navigate('Home') }} />

      <Text style={styles.sectionTitle}>FORMAS SALVAS</Text>

      <SelectableRow
        selected={cart.payment?.type === 'pix'}
        title="PIX"
        highlight="Aprovação na hora"
        onPress={() => cart.setPayment({ type: 'pix' })}
      />

      {cart.cards.map((card) => (
        <SelectableRow
          key={card.id}
          selected={cart.payment?.type === 'cartao' && cart.payment.cardId === card.id}
          title={`Cartão •••• ${card.ultimo4}`}
          subtitle={`Crédito · ${card.bandeira}`}
          onPress={() => cart.setPayment({ type: 'cartao', cardId: card.id })}
        />
      ))}

      <Pressable style={styles.addCardLink} onPress={() => navigation.navigate('AdicionarCartao')}>
        <Text style={styles.addCardLinkLabel}>+ Adicionar novo cartão</Text>
      </Pressable>

      {!!erro && <Text style={styles.erro}>{erro}</Text>}

      <View style={styles.footer}>
        <Button
          title={cleanupPending ? 'Continuar' : 'Pagar'}
          onPress={handlePagar}
          loading={enviando}
          disabled={
            !cleanupPending &&
            (!cart.payment || cart.items.length === 0 || (semCartaoSalvo && cart.payment?.type === 'cartao'))
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
