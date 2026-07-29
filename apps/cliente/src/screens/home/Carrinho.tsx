import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { CartItemRow } from '../../components/checkout';
import { Button, Screen } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useStoreDetail } from '../../hooks/useStoreDetail';
import { formatReais } from '../../lib/format';
import type { HomeStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Carrinho'>;

/**
 * Carrinho (Task 1, AC1/AC2/AC4). Fiel a `cliente-04-carrinho.png`: nome da
 * loja com marcador verde, lista de itens (nome/preço/stepper), estado
 * vazio quando não há itens. O resumo financeiro completo (subtotal/taxa/
 * total) vive na tela Checkout (Task 2) — aqui só o subtotal parcial e o
 * botão de avanço, para não duplicar o cálculo final em 2 telas.
 */
export default function Carrinho({ navigation }: Props) {
  const cart = useCart();
  const { data: loja } = useStoreDetail(cart.estabelecimentoId ?? '', {});

  const vazio = cart.items.length === 0;

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.roundButton}>
          <Text style={styles.roundButtonIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Carrinho</Text>
        <View style={styles.roundButton} />
      </View>

      {vazio ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Seu carrinho está vazio</Text>
          <Text style={styles.emptySubtitle}>Adicione produtos de uma loja para continuar.</Text>
          <Button title="Ver lojas" variant="outline" onPress={() => navigation.navigate('Home')} />
        </View>
      ) : (
        <>
          {!!loja && (
            <View style={styles.lojaRow}>
              <View style={styles.lojaDot} />
              <Text style={styles.lojaNome}>{loja.nome_fantasia}</Text>
            </View>
          )}

          <View style={styles.items}>
            {cart.items.map((item) => (
              <CartItemRow
                key={item.produtoId}
                item={item}
                onIncrement={() => cart.incrementItem(item.produtoId)}
                onDecrement={() => cart.decrementItem(item.produtoId)}
              />
            ))}
          </View>

          <View style={styles.subtotalRow}>
            <Text style={styles.subtotalLabel}>Subtotal</Text>
            <Text style={styles.subtotalValue}>{formatReais(cart.subtotalReais)}</Text>
          </View>

          <Button title="Ir para o checkout" onPress={() => navigation.navigate('Checkout')} />
        </>
      )}
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
  lojaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
    marginBottom: spacing['2'],
  },
  lojaDot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    backgroundColor: lightColors.accent.brand,
  },
  lojaNome: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.successFg,
  },
  items: {
    marginBottom: spacing['4'],
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing['4'],
    borderTopWidth: 1,
    borderTopColor: lightColors.border.default,
    marginBottom: spacing['5'],
  },
  subtotalLabel: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.secondary,
  },
  subtotalValue: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing['3'],
    paddingTop: spacing['8'],
  },
  emptyTitle: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  emptySubtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing['3'],
  },
});
