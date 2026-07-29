import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { Button, Screen, TextField } from '../../components/ui';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'EsqueciSenha'>;

/**
 * Esqueci a senha (Task 5, AC1, AC2, AC3).
 *
 * [Source: docs/prd/02-requirements.md#FR3] fluxo "esqueci minha senha" via
 * e-mail. Sem referência visual dedicada — segue o design system.
 *
 * "Enviar" não dispara e-mail real: alterna para um estado de confirmação
 * visual na própria tela (evita criar uma rota nova só para esse texto de
 * sucesso — mantém o inventário de rotas da Story 0.3 intacto), com um CTA
 * para voltar ao Login.
 */
export default function EsqueciSenha({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);

  if (enviado) {
    return (
      <Screen scroll={false}>
        <View style={styles.confirmBlock}>
          <View style={styles.confirmIcon}>
            <Text style={styles.confirmIconText}>✓</Text>
          </View>
          <Text style={styles.title}>Verifique seu e-mail</Text>
          <Text style={styles.subtitle}>
            Se {email.trim() || 'o e-mail informado'} estiver cadastrado, enviamos um link para
            redefinir sua senha.
          </Text>
        </View>
        <Button title="Voltar ao login" onPress={() => navigation.navigate('Login')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.brand}>KEEPIT</Text>
      <Text style={styles.title}>Esqueci a senha</Text>
      <Text style={styles.subtitle}>Informe seu e-mail para receber o link de redefinição.</Text>

      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        placeholder="voce@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Button title="Enviar" onPress={() => setEnviado(true)} disabled={!email.trim()} />
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
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    lineHeight: typography.sizes.md.lineHeight,
    color: lightColors.text.secondary,
    marginBottom: spacing['6'],
    textAlign: 'center',
  },
  confirmBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['4'],
  },
  confirmIcon: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    backgroundColor: lightColors.accent.successBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing['6'],
  },
  confirmIconText: {
    color: lightColors.accent.successFg,
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
  },
});
