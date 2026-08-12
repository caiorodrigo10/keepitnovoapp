import { Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { useCart } from '../../context/CartContext';
import { formatReais } from '../../lib/format';

interface FloatingCartButtonProps {
  onPress: () => void;
}

/**
 * "Ver carrinho" flutuante (Story 6.1, AC1) — [IDS] CREATE, sem NENHUM
 * precedente de código no app Cliente (confirmado por grep na Dependencies
 * da Story). Visual fiel a `cliente-03-loja-catalogo.png`: barra verde
 * (`accent.brand`) fixa na parte inferior, "Ver carrinho" à esquerda,
 * "{n} itens · R$ {subtotal}" à direita. Some quando `cart.items.length ===
 * 0` (renderiza `null`).
 *
 * Renderizado como IRMÃO de `<Screen>` (não dentro do `ScrollView` que
 * `Screen` envolve) para ficar fixo mesmo com scroll — `SafeAreaView
 * edges={['bottom']}` evita sobrepor o home indicator/gesture bar em
 * devices com notch.
 */
export function FloatingCartButton({ onPress }: FloatingCartButtonProps) {
  const cart = useCart();

  if (cart.items.length === 0) {
    return null;
  }

  const totalItens = cart.items.reduce((total, item) => total + item.quantidade, 0);
  const itensLabel = totalItens === 1 ? 'item' : 'itens';

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe} pointerEvents="box-none">
      <Pressable
        style={styles.button}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Ver carrinho"
      >
        <Text style={styles.label}>Ver carrinho</Text>
        <Text style={styles.summary}>
          {totalItens} {itensLabel} · {formatReais(cart.subtotalReais)}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: lightColors.accent.brand,
    borderRadius: radii.sm,
    marginHorizontal: spacing['6'],
    marginBottom: spacing['3'],
    paddingHorizontal: spacing['5'],
    height: 56,
  },
  label: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  summary: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
  },
});
