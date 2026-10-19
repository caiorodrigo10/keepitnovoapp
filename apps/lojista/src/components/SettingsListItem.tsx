import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Item de lista de configuração (ícone circular + label + chevron) —
 * Story 0.8 (Task 10), fiel a `docs/design-refs/lojista-11-configuracoes.png`
 * (painel P11 — seções "LOJA"/"EQUIPE").
 *
 * [IDS] ADAPT — `icon` passa de emoji (string) para `Ionicons` name (débito
 * de fidelidade visual pós-Stories 0.8-0.11); chevron `›` também migrado.
 */
export interface SettingsListItemProps {
  icon: IoniconName;
  label: string;
  sublabel?: string;
  onPress: () => void;
  destructive?: boolean;
}

export function SettingsListItem({ icon, label, sublabel, onPress, destructive = false }: SettingsListItemProps) {
  const labelColor = destructive ? darkColors.accent.warning : darkColors.text.primary;

  return (
    <Pressable onPress={onPress} style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: darkColors.bg.muted }]}>
        <Ionicons name={icon} size={20} color={labelColor} />
      </View>
      <View style={styles.textColumn}>
        <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
        {sublabel ? (
          <Text style={[styles.sublabel, { color: darkColors.text.tertiary }]}>{sublabel}</Text>
        ) : null}
      </View>
      {!destructive ? <Ionicons name="chevron-forward" size={20} color={darkColors.text.tertiary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textColumn: {
    flex: 1,
  },
  label: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
  sublabel: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    marginTop: 2,
  },
});
