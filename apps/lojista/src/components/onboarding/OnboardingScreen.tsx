import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

interface OnboardingScreenProps {
  heading: string;
  subtext: string;
  footer: ReactNode;
}

/**
 * Layout compartilhado das 3 telas do pager de onboarding do App Lojista —
 * Story 3.1 (AC1). Espelha estruturalmente
 * `apps/cliente/src/components/onboarding/OnboardingScreen.tsx` (wordmark +
 * heading/subtext + footer, tema dark), sem componente `Screen`
 * compartilhado entre apps: o App Lojista não usa esse wrapper (ver
 * `OnboardingLojista.tsx` anterior, que monta `SafeAreaView` diretamente) —
 * mesma convenção local aqui.
 *
 * [IDS] CREATE: sem pacote de UI compartilhado entre apps neste monorepo
 * (mesmo padrão já usado por `FormField`/`PrimaryButton`/`SelectField`).
 */
export function OnboardingScreen({ heading, subtext, footer }: OnboardingScreenProps) {
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <Text style={[styles.logo, { color: darkColors.text.primary }]}>KEEPITHUB</Text>
          <Text style={[styles.title, { color: darkColors.text.primary }]}>{heading}</Text>
          <Text style={[styles.subtitle, { color: darkColors.text.secondary }]}>{subtext}</Text>
        </View>

        <View style={styles.footer}>{footer}</View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[8],
  },
  hero: {
    gap: spacing[4],
    marginTop: spacing[10],
  },
  logo: {
    fontFamily: 'HankenGrotesk-ExtraBold',
    fontSize: typography.sizes.xl.fontSize,
    letterSpacing: typography.letterSpacing.wide,
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['3xl'].fontSize,
    lineHeight: typography.sizes['3xl'].lineHeight,
  },
  subtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    lineHeight: typography.sizes.md.lineHeight,
  },
  footer: {
    gap: spacing[4],
    alignItems: 'center',
  },
});
