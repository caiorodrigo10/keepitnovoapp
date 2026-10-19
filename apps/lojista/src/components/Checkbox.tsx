import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

interface CheckboxProps {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * Checkbox de aceite de Termos/Política — Story 3.2 (AC2).
 *
 * [IDS] ADAPT de `apps/cliente/src/components/ui/Checkbox.tsx` (Story 2.3):
 * mesma estrutura (`Pressable` + caixa + texto rico), tema trocado de
 * `lightColors` para `darkColors` — a mission desta Story pede
 * explicitamente "adaptado ao tema dark do Lojista (o componente do Cliente
 * usa `lightColors`)". Sem import cruzado entre apps (cada app mobile é um
 * pacote isolado).
 */
export function Checkbox({ checked, onToggle, children }: CheckboxProps) {
  return (
    <Pressable style={styles.row} onPress={onToggle} hitSlop={8}>
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked && <Text style={styles.check}>✓</Text>}
      </View>
      <Text style={styles.text}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: radii.xs,
    borderWidth: 1,
    borderColor: darkColors.border.muted,
    backgroundColor: darkColors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing['3'],
    marginTop: 2,
  },
  boxChecked: {
    backgroundColor: darkColors.accent.brand,
    borderColor: darkColors.accent.brand,
  },
  check: {
    color: darkColors.bg.primary,
    fontSize: typography.sizes.sm.fontSize,
    fontFamily: 'HankenGrotesk-Bold',
  },
  text: {
    flex: 1,
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    lineHeight: typography.sizes.md.lineHeight,
    color: darkColors.text.secondary,
  },
});
