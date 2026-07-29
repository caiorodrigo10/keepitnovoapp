import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen';
import { Button, Dots } from '../../components/ui';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Onboarding2'>;

/**
 * Onboarding 2/3 — "Pronto" (Task 1, AC1).
 *
 * [Fonte da copy] `docs/design-refs/_design-system-legend.png` — card
 * "2 · Pronto": "Pedido fica pron[to...]" (texto cortado na captura da
 * legenda). Completado com copy consistente ao tom das demais telas —
 * mesma limitação de referência documentada em Onboarding1.
 */
export default function Onboarding2({ navigation }: Props) {
  return (
    <OnboardingScreen
      heading="Seu pedido fica pronto no Keepit"
      subtext="A loja separa tudo e deixa esperando por você em um Hub Keepit perto de casa."
      footer={
        <View>
          <View style={styles.dotsRow}>
            <Dots total={3} activeIndex={1} theme="dark" />
          </View>
          <Button title="Avançar" onPress={() => navigation.navigate('Onboarding3')} />
          <Pressable style={styles.skip} onPress={() => navigation.navigate('CriarConta')} hitSlop={8}>
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
