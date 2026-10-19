import { StyleSheet, View } from 'react-native';

import { darkColors, radii, spacing } from '@keepit/ui-tokens';

interface DotsProps {
  total: number;
  activeIndex: number;
}

/**
 * Dots de progresso do pager de onboarding do App Lojista — Story 3.1 (AC1).
 *
 * [IDS] CREATE: sem pacote de UI compartilhado entre `apps/cliente` e
 * `apps/lojista` neste monorepo (mesmo padrão já usado por
 * `FormField`/`PrimaryButton`/`SelectField` no Lojista) — espelha
 * `apps/cliente/src/components/ui/Dots.tsx` estruturalmente (dot ativo em
 * formato pill, demais em círculo), mas sem a prop `theme`: o App Lojista
 * usa tema dark em 100% das telas (não há variante light a suportar aqui).
 */
export function Dots({ total, activeIndex }: DotsProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: total }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.dot,
            { backgroundColor: darkColors.border.muted },
            index === activeIndex && [styles.dotActive, { backgroundColor: darkColors.accent.brand }],
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
    justifyContent: 'center',
    gap: spacing[2],
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
