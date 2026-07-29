import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { PrimaryButton } from '../../components/PrimaryButton';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'OnboardingLojista'>;

/**
 * Onboarding do App Lojista — Story 0.8 (Task 3).
 *
 * Sem referência literal no protótipo (`keepit-app/index.html` não tem
 * painel de onboarding do Lojista — ver Dev Notes, "Lacunas de fidelidade").
 * Segue os tokens de design (`colors.dark`, Hanken Grotesk) e o padrão
 * estrutural das demais telas do App Lojista (logo + card + CTA).
 */
export default function OnboardingLojista({ navigation }: Props) {
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <Text style={[styles.logo, { color: darkColors.text.primary }]}>KEEPIT</Text>
          <Text style={[styles.title, { color: darkColors.text.primary }]}>
            Venda mais perto de casa, sem complicação
          </Text>
          <Text style={[styles.subtitle, { color: darkColors.text.secondary }]}>
            Cadastre sua loja, receba pedidos de clientes da vizinhança e entregue tudo em um Hub
            Keepit — sem logística própria.
          </Text>
        </View>

        <View style={styles.actions}>
          <PrimaryButton label="Cadastrar minha loja" onPress={() => navigation.navigate('CadastroPasso1')} />
          <Text
            style={[styles.loginLink, { color: darkColors.accent.brand }]}
            onPress={() => navigation.navigate('Login')}
          >
            Já tenho conta · Entrar
          </Text>
        </View>
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
  actions: {
    gap: spacing[4],
    alignItems: 'center',
  },
  loginLink: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
});
