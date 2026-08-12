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
  /** Botão "remover item" dedicado (Story 6.1, AC2) — só renderizado na tela Carrinho, nunca no Checkout (somente leitura). */
  onRemove?: () => void;
}

/**
 * [IDS] CREATE — linha de item do carrinho ("Protetor solar FPS 50 · R$
 * 39,90 · [− 1 +]"), fiel a `cliente-04-carrinho.png`. Reaproveitado por
 * Carrinho (com stepper + remover) e Checkout (somente leitura, sem
 * `onIncrement`/`onDecrement`/`onRemove`).
 */
export function CartItemRow({ item, onIncrement, onDecrement, onRemove }: CartItemRowProps) {
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
      {onRemove && (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          style={styles.removeButton}
          accessibilityLabel={`Remover ${item.nome} do carrinho`}
        >
          <Text style={styles.removeButtonLabel}>×</Text>
        </Pressable>
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
  removeButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing['2'],
  },
  removeButtonLabel: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.tertiary,
  },
});
