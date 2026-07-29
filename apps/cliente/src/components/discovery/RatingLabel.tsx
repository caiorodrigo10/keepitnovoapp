import { StyleSheet, Text, View } from 'react-native';

import { lightColors, spacing, typography } from '@keepit/ui-tokens';

interface RatingLabelProps {
  value: number;
  reviewCount?: number;
}

/**
 * [IDS] CREATE — "★ 4.8" (placeholder visual, AC1: "não existe tabela de
 * rating no schema"). `★` é texto puro (mesma decisão de `Checkbox.tsx`
 * usando `✓` — sem lib de ícones em `apps/cliente`).
 */
export function RatingLabel({ value, reviewCount }: RatingLabelProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.star}>★</Text>
      <Text style={styles.value}>{value.toFixed(1)}</Text>
      {typeof reviewCount === 'number' && <Text style={styles.reviewCount}>({reviewCount})</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['1'],
  },
  star: {
    color: lightColors.text.primary,
    fontSize: typography.sizes.md.fontSize,
  },
  value: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
  },
  reviewCount: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
  },
});
