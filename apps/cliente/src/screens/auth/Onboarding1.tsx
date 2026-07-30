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
 * Onboarding 1/3 — "Compra" (Task 1, AC1).
 *
 * [Fonte da copy] `docs/design-refs/_design-system-legend.png` — seção
 * "Como funciona", card "1 · Compra": "Escolhe lojas locais na plataforma".
 * Não há uma captura dedicada a esta tela específica no protótipo (só a
 * tela final — `cliente-01-onboarding.png` — foi capturada); layout
 * reconstruído a partir do card "Como funciona" da legenda + do mesmo
 * cartão ilustrativo/wordmark da tela final, documentado como inferência
 * assistida (mesma limitação de referência anotada nas Dev Notes da 0.4).
 */
export default function Onboarding1({ navigation }: Props) {
  return (
    <OnboardingScreen
      heading="Compre em lojas perto de você"
      subtext="Escolha lojas locais na plataforma — farmácia, roupas, conveniência e muito mais."
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
