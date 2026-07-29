import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { FormField } from '../../components/FormField';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

/**
 * Login do Lojista — Story 0.8 (Task 8).
 *
 * Sem tela literal no protótipo do App Lojista — segue o padrão visual dark
 * equivalente ao Login do App Cliente (Story 0.4, também stub no momento
 * desta story), usando apenas os tokens de design como referência.
 *
 * [AUTO-DECISION] "Entrar" apenas navega, sem autenticação real (AC3). O
 * destino natural seria `MainTabs` (Dashboard do lojista), mas
 * `RootNavigator` decide entre `AuthStack`/`Main` via `isAuthenticated()`
 * (stub estático, sem estado — ver `navigation/authGuard.ts`), então não há
 * como alternar para `Main` em runtime a partir de dentro de `AuthStack`
 * sem alterar esse guard (fora do escopo desta story — pertence à Story
 * 0.3/story de auth real). Decisão: `navigation.popToTop()` volta ao topo
 * do fluxo (`OnboardingLojista`), tratado como placeholder documentado
 * (reason: opção explicitamente permitida pela Task 8 da story; altera o
 * guard exigiria modificar `navigation/authGuard.ts`, fora do escopo desta
 * story de conteúdo visual).
 */
export default function Login({ navigation }: Props) {
  const [identificador, setIdentificador] = useState('');
  const [senha, setSenha] = useState('');

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.content}>
        <View style={styles.titleBlock}>
          <Text style={[styles.logo, { color: darkColors.text.primary }]}>KEEPIT</Text>
          <Text style={[styles.title, { color: darkColors.text.primary }]}>Entrar na sua loja</Text>
          <Text style={[styles.subtitle, { color: darkColors.text.secondary }]}>
            Acesse com o telefone ou e-mail cadastrado.
          </Text>
        </View>

        <View style={styles.form}>
          <FormField
            label="Telefone ou e-mail"
            value={identificador}
            onChangeText={setIdentificador}
            placeholder="seu@email.com"
          />
          <FormField label="Senha" value={senha} onChangeText={setSenha} placeholder="••••••••" secureTextEntry />
        </View>

        <PrimaryButton label="Entrar" onPress={() => navigation.popToTop()} />
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
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
    gap: spacing[8],
  },
  titleBlock: {
    gap: spacing[2],
  },
  logo: {
    fontFamily: 'HankenGrotesk-ExtraBold',
    fontSize: typography.sizes.lg.fontSize,
    letterSpacing: typography.letterSpacing.wide,
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
  },
  subtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
  },
  form: {
    gap: spacing[4],
  },
});
