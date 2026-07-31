import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { Screen } from '../ui/Screen';
import { OnboardingIllustration } from './OnboardingIllustration';

interface OnboardingScreenProps {
  heading: string;
  subtext?: string;
  footer: ReactNode;
}

/**
 * [IDS] CREATE — layout compartilhado das 3 telas de onboarding (Task 1):
 * wordmark "KEEPIT" + ilustração + heading/subtext + footer (dots/CTAs, que
 * variam por tela e por isso ficam a cargo de cada `OnboardingN.tsx`).
 *
 * [Fix REQ-004 — gate 0.4] Tema DARK, fiel a `cliente-01-onboarding.png`
 * (fundo escuro, wordmark e heading em branco, subtext em cinza claro). Só o
 * onboarding usa tema dark — o resto do app Cliente permanece claro; por
 * isso o override é local (`Screen backgroundColor` + `darkColors` aqui),
 * nunca no default dos componentes compartilhados.
 *
 * [Fix 2.1.1] `subtext` é opcional: o card "COMO FUNCIONA" do protótipo
 * (`keepit-app/index.html`) fornece só uma frase por tela para 1/3 e 2/3 —
 * sem uma segunda linha para renderizar. Quando ausente, o `<Text>` do
 * subtext não é renderizado (evita nó vazio no layout/leitor de tela).
 */
export function OnboardingScreen({ heading, subtext, footer }: OnboardingScreenProps) {
  return (
    <Screen contentStyle={styles.content} backgroundColor={darkColors.bg.primary}>
      <Text style={styles.brand}>KEEPIT</Text>
      <OnboardingIllustration />
      <View style={styles.textBlock}>
        <Text style={styles.heading}>{heading}</Text>
        {subtext ? <Text style={styles.subtext}>{subtext}</Text> : null}
      </View>
      <View style={styles.footer}>{footer}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  brand: {
    fontFamily: 'HankenGrotesk-ExtraBold',
    fontSize: typography.sizes.xl.fontSize,
    letterSpacing: typography.letterSpacing.wide,
    color: darkColors.text.primary,
    marginBottom: spacing['6'],
  },
  textBlock: {
    marginBottom: spacing['8'],
  },
  heading: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['3xl'].fontSize,
    lineHeight: typography.sizes['3xl'].lineHeight,
    color: darkColors.text.primary,
    marginBottom: spacing['3'],
  },
  subtext: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.lg.fontSize,
    lineHeight: typography.sizes.lg.lineHeight,
    color: darkColors.text.secondary,
  },
  footer: {
    marginTop: 'auto',
  },
});
