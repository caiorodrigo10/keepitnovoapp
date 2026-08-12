import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { spacing } from '@keepit/ui-tokens';

import { Dots } from '../../components/onboarding/Dots';
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'OnboardingLojista1'>;

/**
 * Onboarding do Lojista 1/3 — Story 3.1 (AC1, AC2, AC3).
 *
 * Copy reaproveitada da tela única anterior (`OnboardingLojista.tsx`,
 * Story 0.8) — sem referência literal no protótipo para o onboarding do
 * Lojista (ver Dev Notes da Story 3.1, "Copy das 3 telas",
 * `[AUTO-DECISION]`).
 */
export default function OnboardingLojista1({ navigation }: Props) {
  return (
    <OnboardingScreen
      heading="Venda mais perto de casa, sem complicação."
      subtext="Cadastre sua loja, receba pedidos de clientes da vizinhança e entregue tudo em um Hub Keepit — sem logística própria."
      footer={
        <View style={styles.footerInner}>
          <Dots total={3} activeIndex={0} />
          <PrimaryButton label="Avançar" onPress={() => navigation.navigate('OnboardingLojista2')} />
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
});
