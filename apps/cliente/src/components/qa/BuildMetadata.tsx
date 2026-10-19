import { Pressable, StyleSheet, Text, View } from 'react-native';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { BUILD_INFO, formatBuildInfoRows } from '../../config/buildInfo';

interface BuildMetadataProps {
  onVersionPress?: () => void;
}

export function BuildMetadata({ onVersionPress }: BuildMetadataProps) {
  return (
    <View style={styles.container}>
      {formatBuildInfoRows(BUILD_INFO).map((row) => {
        const content = (
          <>
            <Text style={styles.label}>{row.label}</Text>
            <Text selectable style={styles.value}>
              {row.value}
            </Text>
          </>
        );

        if (row.label === 'Versão' && onVersionPress) {
          return (
            <Pressable key={row.label} onPress={onVersionPress} style={styles.row}>
              {content}
            </Pressable>
          );
        }

        return (
          <View key={row.label} style={styles.row}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.card,
    marginBottom: spacing['6'],
    paddingHorizontal: spacing['4'],
  },
  row: {
    alignItems: 'center',
    borderBottomColor: lightColors.border.subtle,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing['3'],
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: spacing['2'],
  },
  label: {
    color: lightColors.text.secondary,
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
  },
  value: {
    color: lightColors.text.primary,
    flexShrink: 1,
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    textAlign: 'right',
  },
});
