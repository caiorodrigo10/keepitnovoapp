import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen';
import { Button, Dots } from '../../components/ui';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Onboarding3'>;

/**
 * Onboarding 3/3 — tela final (Task 1, AC1, AC2).
 *
 * Fiel a `docs/design-refs/cliente-01-onboarding.png`: heading "Tudo perto
 * de você, retirado no hub.", subtexto, CTA "Criar conta" e link "Já tenho
 * conta · Entrar" — os dois pontos de entrada da Story 0.4.
 */
export default function Onboarding3({ navigation }: Props) {
  return (
    <OnboardingScreen
      heading="Tudo perto de você, retirado no hub."
      subtext="Compre de farmácias, lojas e conveniências locais e retire tudo em um ponto de encontro Keepit."
      footer={
        <View>
          <View style={styles.dotsRow}>
            <Dots total={3} activeIndex={2} theme="dark" />
          </View>
          <Button title="Criar conta" onPress={() => navigation.navigate('CriarConta')} />
          <Pressable style={styles.loginRow} onPress={() => navigation.navigate('Login')} hitSlop={8}>
            <Text style={styles.loginText}>
              Já tenho conta · <Text style={styles.loginTextBold}>Entrar</Text>
            </Text>
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
  loginRow: {
    alignItems: 'center',
    marginTop: spacing['4'],
  },
  loginText: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: darkColors.text.secondary,
  },
  loginTextBold: {
    fontFamily: 'HankenGrotesk-Bold',
    color: darkColors.text.primary,
  },
});
