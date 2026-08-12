import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { Dots } from '../../components/onboarding/Dots';
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'OnboardingLojista3'>;

/**
 * Onboarding do Lojista 3/3 — Story 3.1 (AC1, AC2, AC3, AC4).
 *
 * CTA principal "Cadastrar estabelecimento" navega para `CadastroPasso1`
 * (Story 3.2). Link secundário "Já tenho conta · Entrar" navega para
 * `Login` — comportamento já existente na tela única anterior
 * (`OnboardingLojista.tsx`, Story 0.8), apenas realocado para a última tela
 * do pager (AC4).
 */
export default function OnboardingLojista3({ navigation }: Props) {
  return (
    <OnboardingScreen
      heading="Pronto para começar?"
      subtext="Leva poucos minutos: dados da loja, chave PIX de recebimento e horários de funcionamento."
      footer={
        <View style={styles.footerInner}>
          <Dots total={3} activeIndex={2} />
          <PrimaryButton label="Cadastrar estabelecimento" onPress={() => navigation.navigate('CadastroPasso1')} />
          <Pressable
            style={styles.loginRow}
            onPress={() => navigation.navigate('Login')}
            hitSlop={8}
          >
            <Text style={[styles.loginText, { color: darkColors.accent.brand }]}>Já tenho conta · Entrar</Text>
          </Pressable>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  footerInner: {
    gap: spacing[4],
    alignItems: 'center',
    width: '100%',
  },
  loginRow: {
    alignItems: 'center',
    marginTop: spacing[1],
  },
  loginText: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
});
