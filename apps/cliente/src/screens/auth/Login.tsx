import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';

import { getDataClient } from '@keepit/core-data';
import { lightColors, spacing, typography } from '@keepit/ui-tokens';

import { Button, Screen, TextField } from '../../components/ui';
import type { AuthStackParamList, RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

/**
 * Login (Task 4, AC1, AC2, AC3).
 *
 * Fiel a `docs/design-refs/cliente-10-login.png`: "Bem-vindo de volta",
 * E-mail, Senha, "Esqueci a senha", botão "Entrar", "Novo por aqui? Criar
 * conta". **Login social removido** (Google/Apple aparecem na captura, mas
 * a decisão de negócio da Rodada 2 tira login social do MVP) — ver Dev
 * Agent Record.
 *
 * Sem autenticação real: `auth.port.signIn` do mock só valida por
 * `telefone` (Story 0.2 não modela senha) — não é chamado a partir do
 * e-mail/senha desta tela (campos client-side apenas, sem submit real).
 */
export default function Login({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleEntrar() {
    setLoading(true);
    try {
      // Exercita o estado de loading do mock (Task 4) sem bloquear a
      // navegação — o mock não conhece e-mail/senha (ver docstring acima).
      await getDataClient().auth.currentUser();
    } finally {
      setLoading(false);
      navigation
        .getParent<NativeStackNavigationProp<RootStackParamList>>()
        ?.navigate('Main', { screen: 'HomeTab', params: { screen: 'Home' } });
    }
  }

  return (
    <Screen>
      <Text style={styles.brand}>KEEPIT</Text>
      <Text style={styles.title}>Bem-vindo de volta</Text>
      <Text style={styles.subtitle}>Entre para continuar comprando.</Text>

      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        placeholder="voce@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <View>
        <TextField
          label="Senha"
          value={senha}
          onChangeText={setSenha}
          placeholder="••••••••"
          secureTextEntry
          autoCapitalize="none"
        />
        <Pressable style={styles.forgotRow} onPress={() => navigation.navigate('EsqueciSenha')} hitSlop={8}>
          <Text style={styles.forgotText}>Esqueci a senha</Text>
        </Pressable>
      </View>

      <Button title="Entrar" onPress={handleEntrar} loading={loading} disabled={!email || !senha} />

      <Pressable style={styles.signupRow} onPress={() => navigation.navigate('CriarConta')} hitSlop={8}>
        <Text style={styles.signupText}>
          Novo por aqui? <Text style={styles.signupTextBold}>Criar conta</Text>
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: {
    fontFamily: 'HankenGrotesk-ExtraBold',
    fontSize: typography.sizes.xl.fontSize,
    letterSpacing: typography.letterSpacing.wide,
    color: lightColors.text.primary,
    marginBottom: spacing['6'],
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
    lineHeight: typography.sizes['2xl'].lineHeight,
    color: lightColors.text.primary,
    marginBottom: spacing['1'],
  },
  subtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.secondary,
    marginBottom: spacing['6'],
  },
  forgotRow: {
    alignItems: 'flex-end',
    marginTop: -spacing['3'],
    marginBottom: spacing['6'],
  },
  forgotText: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.successFg,
  },
  signupRow: {
    alignItems: 'center',
    marginTop: spacing['5'],
  },
  signupText: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.secondary,
  },
  signupTextBold: {
    fontFamily: 'HankenGrotesk-Bold',
    color: lightColors.text.primary,
  },
});
