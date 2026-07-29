import { Pressable, StyleSheet, Text, View } from 'react-native';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

/**
 * Seletor numérico (+/-) com min/max/step — Story 0.8 (Task 5).
 *
 * Usado por "Raio de atendimento" (0.1–30 km) e "Tempo médio de entrega"
 * (5–240 min), espelhando os `CHECK` constraints de `estabelecimentos`
 * [Source: docs/architecture/03-data-models.md#1.4].
 */
export interface NumericStepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
}

export function NumericStepper({ label, value, onChange, min, max, step, unit }: NumericStepperProps) {
  const decimals = step < 1 ? 1 : 0;

  function clamp(next: number) {
    const rounded = Math.round(next * 10) / 10;
    return Math.min(max, Math.max(min, rounded));
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: darkColors.text.secondary }]}>{label}</Text>
      <View style={[styles.row, { backgroundColor: darkColors.bg.surface, borderColor: darkColors.border.default }]}>
        <Pressable
          onPress={() => onChange(clamp(value - step))}
          style={[styles.stepButton, { backgroundColor: darkColors.bg.muted }]}
        >
          <Text style={[styles.stepButtonText, { color: darkColors.text.primary }]}>–</Text>
        </Pressable>
        <Text style={[styles.value, { color: darkColors.text.primary }]}>
          {value.toFixed(decimals)} {unit}
        </Text>
        <Pressable
          onPress={() => onChange(clamp(value + step))}
          style={[styles.stepButton, { backgroundColor: darkColors.bg.muted }]}
        >
          <Text style={[styles.stepButtonText, { color: darkColors.text.primary }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[1],
  },
  label: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
    lineHeight: typography.sizes.base.lineHeight,
  },
  row: {
    height: 52,
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: radii.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonText: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
  },
  value: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
  },
});
