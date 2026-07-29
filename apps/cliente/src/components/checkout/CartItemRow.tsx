import { Pressable, StyleSheet, Text, View } from 'react-native';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import type { CartItem } from '../../context/CartContext';
import { formatReais } from '../../lib/format';
import { ImagePlaceholder } from '../discovery';

interface CartItemRowProps {
  item: CartItem;
  /** Quando ausente, os controles +/- somem (linha somente leitura — usada no resumo do Checkout). */
  onIncrement?: () => void;
  onDecrement?: () => void;
}

/**
 * [IDS] CREATE — linha de item do carrinho ("Protetor solar FPS 50 · R$
 * 39,90 · [− 1 +]"), fiel a `cliente-04-carrinho.png`. Reaproveitado por
 * Carrinho (com stepper) e Checkout (somente leitura, sem `onIncrement`/
 * `onDecrement`).
 */
export function CartItemRow({ item, onIncrement, onDecrement }: CartItemRowProps) {
  return (
    <View style={styles.row}>
      <ImagePlaceholder uri={null} borderRadius={radii.md} />
      <View style={styles.info}>
        <Text style={styles.nome} numberOfLines={1}>
          {item.nome}
        </Text>
        <Text style={styles.preco}>{formatReais(item.precoSnapshotReais)}</Text>
      </View>
      {onIncrement && onDecrement ? (
        <View style={styles.stepper}>
          <Pressable style={styles.stepperButton} onPress={onDecrement} hitSlop={8}>
            <Text style={styles.stepperButtonLabel}>−</Text>
          </Pressable>
          <Text style={styles.stepperValue}>{item.quantidade}</Text>
          <Pressable style={styles.stepperButton} onPress={onIncrement} hitSlop={8}>
            <Text style={styles.stepperButtonLabel}>+</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.quantidadeReadonly}>x{item.quantidade}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
    paddingVertical: spacing['3'],
  },
  info: {
    flex: 1,
  },
  nome: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
  },
  preco: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
    marginTop: 2,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.full,
    paddingHorizontal: spacing['2'],
    height: 32,
  },
  stepperButton: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonLabel: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
  },
  stepperValue: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
    minWidth: 16,
    textAlign: 'center',
  },
  quantidadeReadonly: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
  },
});
