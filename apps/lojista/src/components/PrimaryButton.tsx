import { Pressable, StyleSheet, Text } from 'react-native';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

/**
 * Botão primário do App Lojista — Story 0.8.
 *
 * [IDS] CREATE: nenhum componente de botão existia no app (todas as telas
 * anteriores eram stubs do factory `createScreenStub`, Story 0.3). Este é o
 * primeiro componente visual real reaproveitável entre as 9 telas desta
 * story — evita duplicar o mesmo `Pressable`/estilo em cada arquivo.
 */
export interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'brand' | 'warning';
  disabled?: boolean;
}

export function PrimaryButton({ label, onPress, variant = 'brand', disabled = false }: PrimaryButtonProps) {
  const bg = variant === 'warning' ? darkColors.accent.warning : darkColors.accent.brand;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  label: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    lineHeight: typography.sizes.lg.lineHeight,
    color: darkColors.bg.primary,
  },
});
