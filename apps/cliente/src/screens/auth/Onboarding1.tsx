import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen';
import { Button } from '../../components/ui';
import { Dots } from '../../components/ui';
import { setOnboardingVisto } from '../../lib/onboardingFlag';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Onboarding1'>;

/**
 * Onboarding 1/3 — "Compra" (Story 2.1.1, AC1/AC2/AC7).
 *
 * [Fonte da copy] `keepit-app/index.html`, bloco "COMO FUNCIONA"
 * (~offset 270394), card "1 · Compra" (offset 270646): "Escolhe lojas
 * locais na plataforma" (offset 270748) — copy literal, confirmada por
 * grep no protótipo (1 ocorrência). O bloco fornece uma única frase por
 * card, por isso não há subtext para esta tela.
 */
export default function Onboarding1({ navigation }: Props) {
  return (
    <OnboardingScreen
      heading="Escolhe lojas locais na plataforma"
      footer={
        <View>
          <View style={styles.dotsRow}>
            <Dots total={3} activeIndex={0} theme="dark" />
          </View>
          <Button title="Avançar" onPress={() => navigation.navigate('Onboarding2')} />
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
