import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

interface CheckboxProps {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * [IDS] CREATE — checkbox de aceite (Termos de Uso/Política de Privacidade
 * em Criar conta). `children` aceita texto rico (ex.: partes em negrito via
 * `<Text>` aninhado) para reproduzir "Aceito os **Termos** e a **Política**".
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
    borderColor: lightColors.border.muted,
    backgroundColor: lightColors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing['3'],
    marginTop: 2,
  },
  boxChecked: {
    backgroundColor: lightColors.accent.brand,
    borderColor: lightColors.accent.brand,
  },
  check: {
    color: lightColors.text.primary,
    fontSize: typography.sizes.sm.fontSize,
    fontFamily: 'HankenGrotesk-Bold',
  },
  text: {
    flex: 1,
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    lineHeight: typography.sizes.md.lineHeight,
    color: lightColors.text.secondary,
  },
});
