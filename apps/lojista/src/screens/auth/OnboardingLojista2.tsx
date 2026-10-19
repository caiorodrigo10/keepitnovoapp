import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { spacing } from '@keepit/ui-tokens';

import { Dots } from '../../components/onboarding/Dots';
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'OnboardingLojista2'>;

/**
 * Onboarding do Lojista 2/3 — Story 3.1 (AC1, AC2, AC3).
 *
 * Heading é citação literal do AC1 do Épico 3 — não parafrasear. [Fonte:
 * `docs/prd/epics/3-lojista-aprovacao.md` Story 3.1 AC1]. Reaproveitada
 * também como subtítulo de `CadastroPasso1.tsx` — reforço de mensagem, não
 * duplicação problemática (ver Dev Notes da Story 3.1).
 */
export default function OnboardingLojista2({ navigation }: Props) {
  return (
    <OnboardingScreen
      heading="Em minutos sua loja já recebe pedidos no hub."
      subtext="Você prepara o pedido, o cliente retira no Hub Keepit com um PIN — sem entrega própria nem logística para montar."
      footer={
        <View style={styles.footerInner}>
          <Dots total={3} activeIndex={1} />
          <PrimaryButton label="Avançar" onPress={() => navigation.navigate('OnboardingLojista3')} />
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
