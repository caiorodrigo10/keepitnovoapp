import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen';
import { Button, Dots } from '../../components/ui';
import { setOnboardingVisto } from '../../lib/onboardingFlag';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Onboarding2'>;

/**
 * Onboarding 2/3 — "Pronto" (Story 2.1.1, AC3/AC4/AC7).
 *
 * [Fonte da copy] `keepit-app/index.html`, bloco "COMO FUNCIONA"
 * (~offset 270394), card "2 · Pronto" (offset 270974): "Pedido fica pronto
 * no hub Keepit" (offset 271076) — copy literal, confirmada por grep no
 * protótipo (1 ocorrência). O bloco fornece uma única frase por card, por
 * isso não há subtext para esta tela.
 */
export default function Onboarding2({ navigation }: Props) {
  return (
    <OnboardingScreen
      heading="Pedido fica pronto no hub Keepit"
      footer={
        <View>
          <View style={styles.dotsRow}>
            <Dots total={3} activeIndex={1} theme="dark" />
          </View>
          <Button title="Avançar" onPress={() => navigation.navigate('Onboarding3')} />
          <Pressable
            style={styles.skip}
            onPress={() => {
              // "Pular" = já viu o suficiente para não repetir (AC4b).
              void setOnboardingVisto();
              navigation.navigate('CriarConta');
            }}
            hitSlop={8}
          >
            <Text style={styles.skipText}>Pular</Text>
          </Pressable>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  dotsRow: {
    alignItems: 'center',
    marginBottom: spacing['5'],
  },
  skip: {
    alignItems: 'center',
    marginTop: spacing['4'],
  },
  skipText: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
    color: darkColors.text.secondary,
  },
});
