import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import {
  getHeaderControlAccessibility,
  runHeaderBack,
  type HeaderNavigation,
} from './appHeaderContracts';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];
export type AppHeaderBadgeTone = 'neutral' | 'success' | 'warning';

export interface AppHeaderBadge {
  label: string;
  tone?: AppHeaderBadgeTone;
}

export interface AppHeaderBack {
  navigation: HeaderNavigation;
  fallback: () => void;
  label?: string;
}

export interface AppHeaderAction {
  icon: IoniconsName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  badge?: AppHeaderBadge;
  back?: AppHeaderBack;
  action?: AppHeaderAction;
}

export function AppHeader({ title, subtitle, badge, back, action }: AppHeaderProps) {
  const backLabel = back?.label ?? 'Voltar';
  const badgeTone = badge?.tone ?? 'neutral';

  return (
    <View style={styles.container}>
      <View style={styles.sideSlot}>
        {back ? (
          <Pressable
            {...getHeaderControlAccessibility(backLabel)}
            onPress={() => runHeaderBack(back.navigation, back.fallback)}
            hitSlop={spacing['1']}
            style={({ pressed }) => [styles.control, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={spacing['6']} color={lightColors.text.primary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.centerSlot}>
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {badge ? (
            <View style={[styles.badge, styles[`badge_${badgeTone}`]]}>
              <Text style={[styles.badgeLabel, styles[`badgeLabel_${badgeTone}`]]}>
                {badge.label}
              </Text>
            </View>
          ) : null}
        </View>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      <View style={styles.sideSlot}>
        {action ? (
          <Pressable
            {...getHeaderControlAccessibility(action.label, {
              disabled: action.disabled,
              selected: action.selected,
            })}
            disabled={action.disabled}
            onPress={action.onPress}
            hitSlop={spacing['1']}
            style={({ pressed }) => [styles.control, pressed && !action.disabled && styles.pressed]}
          >
            <Ionicons name={action.icon} size={spacing['6']} color={lightColors.text.primary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: spacing['12'],
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing['4'],
  },
  sideSlot: {
    width: spacing['12'],
    minHeight: spacing['12'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  control: {
    width: spacing['12'],
    minHeight: spacing['12'],
    borderRadius: radii.full,
    backgroundColor: lightColors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.75 },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing['2'],
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing['2'],
  },
  title: {
    flexShrink: 1,
    textAlign: 'center',
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
    lineHeight: typography.sizes.xl.lineHeight,
    color: lightColors.text.primary,
  },
  subtitle: {
    marginTop: spacing['1'],
    textAlign: 'center',
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    lineHeight: typography.sizes.sm.lineHeight,
    color: lightColors.text.secondary,
  },
  badge: {
    borderRadius: radii.badge,
    paddingHorizontal: spacing['2'],
    paddingVertical: spacing['1'],
  },
  badge_neutral: { backgroundColor: lightColors.bg.muted },
  badge_success: { backgroundColor: lightColors.accent.successBg },
  badge_warning: { backgroundColor: lightColors.accent.warning },
  badgeLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    lineHeight: typography.sizes.sm.lineHeight,
  },
  badgeLabel_neutral: { color: lightColors.text.secondary },
  badgeLabel_success: { color: lightColors.accent.successFg },
  badgeLabel_warning: { color: lightColors.text.primary },
});
