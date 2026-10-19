import { StyleSheet, View } from 'react-native';

import { darkColors, lightColors, radii, spacing } from '@keepit/ui-tokens';

interface DotsProps {
  total: number;
  activeIndex: number;
  /**
   * `'light'` (default) preserva o comportamento original. `'dark'` usa
   * `darkColors.border.muted` para o dot inativo — usado pelo onboarding
   * (fundo dark, fiel a `cliente-01-onboarding.png`). [IDS] ADAPT: prop
   * opcional, default inalterado, não quebra os demais consumidores.
   */
  theme?: 'light' | 'dark';
}

/**
 * [IDS] CREATE — indicador de progresso (dots) do onboarding de 3 telas
 * (Task 1, AC1). O dot ativo é mais largo (pill), os demais são círculos —
 * padrão comum de onboarding fiel ao protótipo.
 */
export function Dots({ total, activeIndex, theme = 'light' }: DotsProps) {
  const colors = theme === 'dark' ? darkColors : lightColors;

  return (
    <View style={styles.row}>
      {Array.from({ length: total }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.dot,
            { backgroundColor: colors.border.muted },
            index === activeIndex && [styles.dotActive, { backgroundColor: colors.accent.brand }],
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
  },
  dotActive: {
    width: 24,
  },
});
