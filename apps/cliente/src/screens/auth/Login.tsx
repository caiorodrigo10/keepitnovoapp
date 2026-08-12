import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getDataClient } from '@keepit/core-data';
import { lightColors, spacing, typography } from '@keepit/ui-tokens';

import { Button, Screen, TextField } from '../../components/ui';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

/**
 * Story 2.6 (Task, AC1-AC4, AC6): mensagem genérica sem fonte no protótipo
 * (mesma natureza das mensagens novas de `CriarConta.tsx`, Story 2.3,
 * avaliadas pelo @po contra o `CLAUDE.md` — texto de UI, não regra de
 * negócio). Deliberadamente única para credencial inválida e para qualquer
 * outra falha de `signIn`: o Supabase Auth não distingue "e-mail não
 * cadastrado" de "senha errada" na resposta (`invalid_credentials`) e não
 * há razão de segurança para a UI revelar essa diferença. Não inclui
 * e-mail, senha nem o `error` bruto do SDK (AC4 — nada de credencial em
 * log/toast).
 */
const MSG_CREDENCIAIS_INVALIDAS = 'E-mail ou senha incorretos. Tente novamente.';

/**
 * Login (Story 2.3, Task 4, AC1-AC3; Story 2.6, AC1-AC6).
 *
 * Fiel a `docs/design-refs/cliente-10-login.png`: "Bem-vindo de volta",
 * E-mail, Senha, "Esqueci a senha", botão "Entrar", "Novo por aqui? Criar
 * conta". **Login social não renderizado** (Google/Apple aparecem na
 * captura) — a pendência 10.2 continua aberta; enquanto isso, sem
 * separador `ou` nem botões sociais (mesmo tratamento de `CriarConta.tsx`).
 *
 * **Story 2.6:** submit real via `auth.port.signIn(email, senha)` (Supabase
 * Auth, decisão 10.4). Erro de credencial ou de qualquer outra natureza cai
 * num banner de erro reaproveitado do padrão já estabelecido em
 * `CriarConta.tsx` (Story 2.3) — este codebase não tem componente de toast
 * dedicado; "toast" na AC4 é tratado funcionalmente como mensagem de erro
 * visível e transitória, não como um componente específico
 * (`[AUTO-DECISION]`, ver Dev Agent Record da 2.6).
 *
 * **Sem navegação imperativa (Story 2.3.1, AC5; Story 2.6, AC5/AC6).** Se
 * `signIn` resolver com sucesso, `RootNavigator` observa a sessão via
 * `AuthPort.onAuthStateChange(...)` e troca para `Main` sozinho — esta tela
 * não chama `navigation.getParent()?.navigate('Main', ...)`.
 *
 * **Story 2.7 (AC4).** `route.params.toast` — hoje só o literal
 * `'Senha redefinida'` — é enviado por `RecuperarSenha.tsx` via
 * `navigation.reset(...)` após a troca de senha. Mesmo tratamento
 * funcional de "toast" já adotado nesta tela para `submitError` (banner de
 * texto transitório, não um componente de toast dedicado — este codebase
 * não tem um).
 */
export default function Login({ navigation, route }: Props) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleEntrar() {
    setSubmitError(null);
    setLoading(true);
    try {
      await getDataClient().auth.signIn(email.trim(), senha);
      // Story 2.3.1 (AC5)/2.6 (AC5, AC6): nenhuma navegação explícita aqui
      // — RootNavigator troca para Main sozinho ao observar a sessão.
    } catch {
      // AC4: mensagem genérica, sem logar nem exibir e-mail/senha/erro bruto.
      setSubmitError(MSG_CREDENCIAIS_INVALIDAS);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.brand}>KEEPITHUB</Text>
      <Text style={styles.title}>Bem-vindo de volta</Text>
      <Text style={styles.subtitle}>Entre para continuar comprando.</Text>

      {!!submitError && <Text style={styles.submitError}>{submitError}</Text>}
      {!!route.params?.toast && <Text style={styles.successToast}>{route.params.toast}</Text>}

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
  submitError: {
    marginBottom: spacing['4'],
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.warning,
  },
  successToast: {
    marginBottom: spacing['4'],
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.successFg,
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
