import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

/**
 * Botão primário do App Lojista — Story 0.8.
 *
 * [IDS] CREATE: nenhum componente de botão existia no app (todas as telas
 * anteriores eram stubs do factory `createScreenStub`, Story 0.3). Este é o
 * primeiro componente visual real reaproveitável entre as 9 telas desta
 * story — evita duplicar o mesmo `Pressable`/estilo em cada arquivo.
 *
 * `loading` — [IDS] ADAPT (Story 3.2, AC4: "estados loading/erro/sucesso" no
 * submit do Passo 1), mesmo padrão de `apps/cliente/src/components/ui/Button.tsx`
 * (Story 2.3): substitui o label por um `ActivityIndicator` e desabilita o
 * `Pressable`.
 */
export interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'brand' | 'warning';
  disabled?: boolean;
  loading?: boolean;
}

export function PrimaryButton({ label, onPress, variant = 'brand', disabled = false, loading = false }: PrimaryButtonProps) {
  const bg = variant === 'warning' ? darkColors.accent.warning : darkColors.accent.brand;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={darkColors.bg.primary} /> : <Text style={styles.label}>{label}</Text>}
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
