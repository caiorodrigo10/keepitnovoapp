import { StyleSheet, Text, View } from 'react-native';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { formatBuildMetadataRows } from '../config/buildInfo';

export function BuildMetadata() {
  return (
    <View style={styles.container}>
      {formatBuildMetadataRows().map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={styles.label}>{row.label}</Text>
          <Text selectable style={styles.value}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: darkColors.bg.surface,
    borderRadius: radii.card,
    paddingHorizontal: spacing[4],
  },
  row: {
    alignItems: 'center',
    borderBottomColor: darkColors.bg.muted,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: spacing[2],
  },
  label: {
    color: darkColors.text.secondary,
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
  },
  value: {
    color: darkColors.text.primary,
    flexShrink: 1,
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    textAlign: 'right',
  },
});
