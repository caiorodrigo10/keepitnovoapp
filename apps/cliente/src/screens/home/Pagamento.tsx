import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getDataClient } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { SelectableRow } from '../../components/checkout';
import { Button, Screen } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import type { HomeStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Pagamento'>;

/**
 * Pagamento (Task 5, AC1/AC3/AC4). Fiel a `cliente-13-pagamento.png`
 * ("FORMAS SALVAS": PIX + cartão salvo). O card de "adicionar cartão"
 * (formulário) do protótipo virou a rota separada `AdicionarCartao`
 * (Task 6, alinhado ao inventário de telas da Story 0.3/AC1 desta story).
 *
 * Botão final "Pagar" (AC3): nenhuma cobrança real — chama
 * `order.port.create` (mock, Story 0.2) para registrar o pedido mock com
 * os dados já coletados (carrinho, hub, forma de pagamento), sem
 * tokenização/gateway/QR PIX real. Ponto de saída para a Story 0.7 (Meus
 * Pedidos), fora do escopo desta story.
 */
export default function Pagamento({ navigation }: Props) {
  const cart = useCart();
  const { data: cliente } = useCurrentCliente();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const semCartaoSalvo = cart.cards.length === 0;

  const handlePagar = async () => {
    if (!cart.payment || !cliente || !cart.estabelecimentoId || !cart.hubId || cart.items.length === 0) {
      return;
    }

    setEnviando(true);
    setErro(null);
    try {
      const client = getDataClient();
      await client.order.create({
        cliente_id: cliente.id,
        estabelecimento_id: cart.estabelecimentoId,
        hub_id: cart.hubId,
        itens: cart.items.map((item) => ({ produto_id: item.produtoId, quantidade: item.quantidade })),
        forma_pagamento: cart.payment.type === 'pix' ? 'pix' : 'cartao',
      });
      cart.clearOrder();
      // Ponto de saída para a Story 0.7 ("Meus Pedidos") — fora do escopo
      // desta story, apenas troca de tab para onde o pedido mock aparece.
      navigation.getParent()?.navigate('PedidosTab' as never);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível concluir o pagamento. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.roundButton}>
          <Text style={styles.roundButtonIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Pagamento</Text>
        <View style={styles.roundButton} />
      </View>

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
          title="Pagar"
          onPress={handlePagar}
          loading={enviando}
          disabled={!cart.payment || cart.items.length === 0 || (semCartaoSalvo && cart.payment?.type === 'cartao')}
        />
      </View>
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
