import { StyleSheet, Text, View, type DimensionValue } from 'react-native';

import { darkColors, lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { HouseIcon } from './HouseIcon';

interface Badge {
  label: string;
  position: { top?: DimensionValue; bottom?: DimensionValue; left?: DimensionValue; right?: DimensionValue };
}

const BADGES: Badge[] = [
  { label: 'Farmácia', position: { top: spacing['5'], left: spacing['5'] } },
  { label: 'Roupas', position: { top: '46%', left: spacing['3'] } },
  { label: 'Conveniência', position: { bottom: spacing['6'], right: spacing['3'] } },
];

/**
 * [IDS] CREATE — cartão ilustrativo escuro com o ícone de casa (círculo
 * verde) e os badges flutuantes ("Farmácia", "Roupas", "Conveniência"),
 * fiel a `docs/design-refs/cliente-01-onboarding.png`. Reaproveitado pelas
 * 3 telas de onboarding (Task 1) — o mesmo cartão aparece em todas, só o
 * texto abaixo muda.
 *
 * [Fix REQ-004 — gate 0.4] Cor de fundo do cartão vem do tema ESCURO
 * (`darkColors`), agora consistente com o restante do onboarding (também
 * dark, ver `OnboardingScreen.tsx`). Os badges ("Farmácia", "Roupas",
 * "Conveniência") continuam usando `lightColors.bg.primary`/`text.primary`
 * de propósito — são chips claros/brancos flutuando sobre o cartão escuro,
 * fiel à referência. 100% via `@keepit/ui-tokens`, nenhum hex hardcoded.
 */
export function OnboardingIllustration() {
  return (
    <View style={styles.card}>
      {BADGES.map((badge) => (
        <View key={badge.label} style={[styles.badge, badge.position]}>
          <View style={styles.badgeDot} />
          <Text style={styles.badgeLabel}>{badge.label}</Text>
        </View>
      ))}
      <View style={styles.circle}>
        <HouseIcon color={lightColors.text.primary} size={30} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 220,
    borderRadius: radii.card,
    backgroundColor: darkColors.bg.frame,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing['8'],
  },
  circle: {
    width: 96,
    height: 96,
    borderRadius: radii.full,
    backgroundColor: darkColors.accent.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.bg.primary,
    borderRadius: radii.badge,
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['2'],
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: radii.full,
    backgroundColor: lightColors.accent.brand,
    marginRight: spacing['1'],
  },
  badgeLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.primary,
  },
});
