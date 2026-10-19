import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getDataClient, type PasswordResetRequestResult } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { Button, FormScreen, Screen, TextField } from '../../components/ui';
import {
  createPasswordRecoveryDemoCallbackAction,
  resolvePasswordResetConfirmation,
} from '../../lib/passwordRecoveryPresentation';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'EsqueciSenha'>;

/**
 * Story 2.7 (AC7 — anti-enumeração, decisão do @po no Change Log 0.2.0):
 * mesma mensagem para e-mail cadastrado ou não, sem citar o e-mail
 * informado. Mesma natureza de `MSG_CREDENCIAIS_INVALIDAS` em `Login.tsx`
 * (Story 2.6) — texto novo, sem fonte no protótipo, avaliado pelo @po
 * contra o `CLAUDE.md`.
 */
/** Falha real de rede/provedor (AC1) — nunca "e-mail não encontrado" (isso seria enumeração, ver AC7). */
const MSG_ERRO_GENERICO = 'Não foi possível enviar o link agora. Tente novamente em instantes.';

/**
 * Esqueci a senha (Task, AC1, AC2, AC5, AC6, AC7).
 *
 * [Source: docs/prd/02-requirements.md#FR3] fluxo "esqueci minha senha" via
 * e-mail. Sem referência visual dedicada — segue o design system.
 *
 * **Story 2.7/12.12:** "Enviar" chama `auth.port.requestPasswordReset` pela
 * fronteira `AuthPort` — no modo `supabase`, dispara
 * `resetPasswordForEmail` de verdade (AC1, não é mais sucesso apenas
 * visual); no modo `mock`, o adapter oferece um callback demonstrável sem
 * chamar rede. A UI decide pela capacidade `delivery`, não pelo datasource:
 * mantém a confirmação anti-enumeração no envio real e identifica
 * honestamente a demonstração, sem revelar se o e-mail existe.
 */
export default function EsqueciSenha({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [resetResult, setResetResult] = useState<PasswordResetRequestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingDemoCallback, setOpeningDemoCallback] = useState(false);
  const [demoCallbackAction] = useState(() =>
    createPasswordRecoveryDemoCallbackAction({
      openUrl: (callbackUrl) => Linking.openURL(callbackUrl),
      onOpening: () => setOpeningDemoCallback(true),
    }),
  );

  async function handleEnviar() {
    setError(null);
    setLoading(true);
    try {
      const result = await getDataClient().auth.requestPasswordReset(email.trim());
      setResetResult(result);
    } catch {
      // AC1/AC5 — falha real (rede, rate limit etc.), não "e-mail inexistente"
      // (o Supabase não distingue os dois — ver AC7/Dev Notes).
      setError(MSG_ERRO_GENERICO);
    } finally {
      setLoading(false);
    }
  }

  async function handleAbrirCallbackDemo(callbackUrl: string) {
    try {
      // O custom scheme volta pelo `subscribe` de passwordRecoveryLinking,
      // que consome a URL bruta e entrega somente recovery=ready|invalid.
      await demoCallbackAction.open(callbackUrl);
    } catch {
      navigation.navigate('RecuperarSenha', { recovery: 'invalid' });
    }
  }

  if (resetResult) {
    const confirmation = resolvePasswordResetConfirmation(resetResult);

    return (
      <Screen scroll={false}>
        <View style={styles.confirmBlock}>
          <View style={styles.confirmIcon}>
            <Text style={styles.confirmIconText}>✓</Text>
          </View>
          <Text style={styles.title}>{confirmation.title}</Text>
          <Text style={styles.subtitle}>{confirmation.message}</Text>
        </View>
        {confirmation.showDemoAction && resetResult.delivery === 'demo' && (
          <Button
            title="Abrir callback de demonstração"
            onPress={() => void handleAbrirCallbackDemo(resetResult.callbackUrl)}
            loading={openingDemoCallback}
            disabled={openingDemoCallback}
          />
        )}
        <Button
          title="Voltar ao login"
          variant={confirmation.showDemoAction ? 'ghost' : 'primary'}
          onPress={() => navigation.navigate('Login')}
        />
      </Screen>
    );
  }

  return (
    <FormScreen
      footer={<Button title="Enviar" onPress={handleEnviar} loading={loading} disabled={!email.trim()} />}
    >
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

    </FormScreen>
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
