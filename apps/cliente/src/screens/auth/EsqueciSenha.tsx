import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getDataClient } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { Button, Screen, TextField } from '../../components/ui';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'EsqueciSenha'>;

/**
 * Story 2.7 (AC7 — anti-enumeração, decisão do @po no Change Log 0.2.0):
 * mesma mensagem para e-mail cadastrado ou não, sem citar o e-mail
 * informado. Mesma natureza de `MSG_CREDENCIAIS_INVALIDAS` em `Login.tsx`
 * (Story 2.6) — texto novo, sem fonte no protótipo, avaliado pelo @po
 * contra o `CLAUDE.md`.
 */
const MSG_CONFIRMACAO_NEUTRA = 'Se houver uma conta cadastrada com este e-mail, enviamos um link para redefinir sua senha.';
/** Falha real de rede/provedor (AC1) — nunca "e-mail não encontrado" (isso seria enumeração, ver AC7). */
const MSG_ERRO_GENERICO = 'Não foi possível enviar o link agora. Tente novamente em instantes.';

/**
 * Esqueci a senha (Task, AC1, AC2, AC5, AC6, AC7).
 *
 * [Source: docs/prd/02-requirements.md#FR3] fluxo "esqueci minha senha" via
 * e-mail. Sem referência visual dedicada — segue o design system.
 *
 * **Story 2.7:** "Enviar" chama `auth.port.requestPasswordReset` pela
 * fronteira `AuthPort` — no modo `supabase`, dispara
 * `resetPasswordForEmail` de verdade (AC1, não é mais sucesso apenas
 * visual); no modo `mock`, o adapter simula sucesso sem chamar rede nem
 * alterar fixtures (AC6). Em ambos, a confirmação é a mesma tela/texto
 * neutro — a chamada resolve indistintamente para e-mail cadastrado ou não
 * (AC7): a UI nunca sabe qual dos dois aconteceu, e não tenta adivinhar.
 */
export default function EsqueciSenha({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEnviar() {
    setError(null);
    setLoading(true);
    try {
      await getDataClient().auth.requestPasswordReset(email.trim());
      setEnviado(true);
    } catch {
      // AC1/AC5 — falha real (rede, rate limit etc.), não "e-mail inexistente"
      // (o Supabase não distingue os dois — ver AC7/Dev Notes).
      setError(MSG_ERRO_GENERICO);
    } finally {
      setLoading(false);
    }
  }

  if (enviado) {
    return (
      <Screen scroll={false}>
        <View style={styles.confirmBlock}>
          <View style={styles.confirmIcon}>
            <Text style={styles.confirmIconText}>✓</Text>
          </View>
          <Text style={styles.title}>Verifique seu e-mail</Text>
          <Text style={styles.subtitle}>{MSG_CONFIRMACAO_NEUTRA}</Text>
        </View>
        <Button title="Voltar ao login" onPress={() => navigation.navigate('Login')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.brand}>KEEPITHUB</Text>
      <Text style={styles.title}>Esqueci a senha</Text>
      <Text style={styles.subtitle}>Informe seu e-mail para receber o link de redefinição.</Text>

      {!!error && <Text style={styles.submitError}>{error}</Text>}

      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        placeholder="voce@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Button title="Enviar" onPress={handleEnviar} loading={loading} disabled={!email.trim()} />
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
  submitError: {
    marginBottom: spacing['4'],
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.warning,
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
