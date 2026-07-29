import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

export type ButtonVariant = 'primary' | 'outline' | 'ghost';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
}

/**
 * [IDS] CREATE — não existia um botão compartilhado em `apps/cliente`.
 * 3 variantes cobrem todos os CTAs desta story: `primary` (verde, ex.: "Criar
 * conta"/"Entrar"), `outline` (borda, não usado nesta story porque os botões
 * de login social — Google/Apple — foram removidos por decisão de negócio,
 * mas mantido para reuso futuro), `ghost` (texto simples).
 */
export function Button({ title, onPress, variant = 'primary', disabled, loading }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'outline' && styles.outline,
        variant === 'ghost' && styles.ghost,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={lightColors.text.primary} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'primary' && styles.labelPrimary,
            variant === 'outline' && styles.labelOutline,
            variant === 'ghost' && styles.labelGhost,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['4'],
  },
  primary: {
    backgroundColor: lightColors.accent.brand,
  },
  outline: {
    backgroundColor: lightColors.bg.primary,
    borderWidth: 1,
    borderColor: lightColors.border.default,
  },
  ghost: {
    backgroundColor: 'transparent',
    height: 'auto',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    lineHeight: typography.sizes.lg.lineHeight,
  },
  labelPrimary: {
    color: lightColors.text.primary,
  },
  labelOutline: {
    color: lightColors.text.primary,
  },
  labelGhost: {
    color: lightColors.accent.successFg,
  },
});
