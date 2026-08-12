import { StyleSheet, Text, View } from 'react-native';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

/**
 * Header do fluxo de cadastro multi-step — Story 0.8 (Tasks 4-6).
 *
 * Fiel a `docs/design-refs/lojista-06-cadastro-passo1.png` (painel P6):
 * logo "KEEPIT" + "Passo X de 3" à direita, progress bar de 3 segmentos
 * (preenchidos até o passo atual em `accent.brand`, restante em `bg.muted`).
 *
 * [IDS] REUSE (dentro da story): usado pelos 3 passos de cadastro
 * (CadastroPasso1/2/3) para não duplicar a progress bar 3x.
 */
export interface CadastroHeaderProps {
  step: 1 | 2 | 3;
}

export function CadastroHeader({ step }: CadastroHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={[styles.logo, { color: darkColors.text.primary }]}>KEEPITHUB</Text>
        <Text style={[styles.stepLabel, { color: darkColors.text.tertiary }]}>Passo {step} de 3</Text>
      </View>
      <View style={styles.progressRow}>
        {[1, 2, 3].map((segment) => (
          <View
            key={segment}
            style={[
              styles.segment,
              { backgroundColor: segment <= step ? darkColors.accent.brand : darkColors.bg.muted },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[3],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  logo: {
    fontFamily: 'HankenGrotesk-ExtraBold',
    fontSize: typography.sizes.xl.fontSize,
    lineHeight: typography.sizes.xl.lineHeight,
    letterSpacing: typography.letterSpacing.wide,
  },
  stepLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
    lineHeight: typography.sizes.sm.lineHeight,
  },
  progressRow: {
    flexDirection: 'row',
    gap: spacing[1],
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: radii.full,
  },
});
