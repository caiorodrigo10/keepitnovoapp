import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { EmailJaExisteError, getDataClient } from '@keepit/core-data';
import { lightColors, spacing, typography } from '@keepit/ui-tokens';

import { Button, Checkbox, Screen, TextField } from '../../components/ui';
import { isTelefoneBRValido, maskTelefoneBR } from '../../lib/telefoneMask';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'CriarConta'>;

interface FormErrors {
  nome?: string;
  email?: string;
  senha?: string;
  telefone?: string;
  termos?: string;
}

/**
 * Story 2.3 (Task 7, issue REL-004): mensagem sem fonte no protótipo
 * (frame 09 não modela este estado de erro) — texto novo em pt-BR claro,
 * não é regra de negócio (avaliado pelo @po contra o `CLAUDE.md`).
 */
const MSG_EMAIL_JA_CADASTRADO = 'Este e-mail já está cadastrado.';
/** Mesma natureza da acima: texto novo, sem fonte no protótipo. */
const MSG_ERRO_GENERICO = 'Não foi possível criar sua conta agora. Tente novamente em instantes.';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Criar conta (Task 2, AC1, AC2, AC3, AC4).
 *
 * Fiel a `docs/design-refs/cliente-09-criar-conta.png`: Nome completo,
 * E-mail, Senha, aceite de Termos/Política, botão "Criar conta", "Já tem
 * conta? Entrar".
 *
 * Campo **Telefone** foi acrescentado (não aparece na captura do protótipo)
 * porque FR1 exige "nome, e-mail, senha e telefone" no cadastro — ver Dev
 * Agent Record para o registro completo do desvio.
 *
 * **Login social não renderizado** (Google/Apple aparecem na captura) —
 * a pendência 10.2 (login social) continua 🟡 aberta → STAKEHOLDER
 * (`docs/PERGUNTAS_REGRAS_NEGOCIO.md`); enquanto não houver decisão, a UI
 * não renderiza esses botões — ver Dev Agent Record.
 *
 * Story 2.3: submit real via `auth.port.signUp` (Supabase Auth por
 * e-mail/senha, decisão 10.4).
 *
 * **Story 2.3.1 (AC5, fecha REL-006):** a navegação para a home deixou de
 * ser uma chamada explícita desta tela (a chamada de `navigation.getParent()`
 * que forçava a troca de stack foi removida do `try`). Agora é consequência
 * exclusiva de
 * `RootNavigator` observar a sessão via `AuthPort.onAuthStateChange(...)` —
 * se `signUp` retornar sessão, `onAuthStateChange` dispara com um `Cliente`
 * e `RootNavigator` re-renderiza para `Main` sozinho, sem esta tela precisar
 * saber disso.
 *
 * **Sessão pode vir nula (AC8).** `Confirm email` continua **ON** no
 * `keepit-dev` até o Caio aplicar a Task 4 da Story 2.3 (@data-engineer)
 * manualmente — enquanto isso, `client.auth.signUp` completa sem lançar
 * erro, mas sem `session`/`access_token` (Supabase não autentica até o
 * e-mail ser confirmado). Nesse estado, `onAuthStateChange` não dispara com
 * um cliente não-nulo, e o usuário permanece nesta tela, sem crash e sem
 * navegação — mesmo comportamento visível de hoje, agora por uma causa
 * correta (ausência de sessão) em vez de uma rota inexistente. Esta story
 * não adiciona nenhuma UI nova para esse caso (pendência de produto 10.5,
 * não resolvida aqui).
 */
export default function CriarConta({ navigation }: Props) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [telefone, setTelefone] = useState('');
  const [aceiteTermos, setAceiteTermos] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  /**
   * Story 2.3 (Task 7): estado de erro de submit dedicado, separado de
   * `FormErrors` (validação de campo) — decisão do @dev: `FormErrors` mapeia
   * 1 erro por campo do form; o erro de `signUp` (ex.: e-mail duplicado) não
   * é erro de um campo específico, é erro da operação inteira, então vai num
   * banner próprio, não em `errors.email`.
   */
  const [submitError, setSubmitError] = useState<string | null>(null);

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    if (!nome.trim()) nextErrors.nome = 'Informe seu nome completo.';
    if (!EMAIL_REGEX.test(email.trim())) nextErrors.email = 'Informe um e-mail válido.';
    if (senha.length < 8) nextErrors.senha = 'A senha precisa ter pelo menos 8 caracteres.';
    if (telefone.trim() && !isTelefoneBRValido(telefone.trim())) {
      nextErrors.telefone = 'Informe um telefone válido (com DDD).';
    }
    if (!aceiteTermos) nextErrors.termos = 'É preciso aceitar os Termos e a Política de Privacidade.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleCriarConta() {
    if (!validate()) return;

    setSubmitError(null);
    setLoading(true);
    try {
      const client = getDataClient();
      await client.auth.signUp({
        nome: nome.trim(),
        email: email.trim(),
        senha,
        telefone: telefone.trim() || null,
      });
      // Story 2.3.1 (AC5): nenhuma navegação explícita aqui — se `signUp`
      // gerou sessão, `RootNavigator` observa via `onAuthStateChange` e
      // troca para `Main` sozinho (ver JSDoc do componente).
    } catch (error) {
      // AC4 — distingue e-mail já cadastrado (mensagem específica) de
      // qualquer outro erro (mensagem genérica). Ver `EmailJaExisteError`
      // em `packages/core-data/src/supabase/auth-errors.ts`.
      if (error instanceof EmailJaExisteError) {
        setSubmitError(MSG_EMAIL_JA_CADASTRADO);
      } else {
        setSubmitError(MSG_ERRO_GENERICO);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.brand}>KEEPITHUB</Text>
      <Text style={styles.title}>Criar conta</Text>
      <Text style={styles.subtitle}>Compre em minutos no hub mais perto de você.</Text>

      {!!submitError && <Text style={styles.submitError}>{submitError}</Text>}

      <TextField
        label="Nome completo"
        value={nome}
        onChangeText={setNome}
        placeholder="Seu nome"
        autoCapitalize="words"
        error={errors.nome}
      />
      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        placeholder="voce@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        error={errors.email}
      />
      <TextField
        label="Senha"
        value={senha}
        onChangeText={setSenha}
        placeholder="••••••••"
        secureTextEntry
        autoCapitalize="none"
        error={errors.senha}
      />
      <TextField
        label="Telefone (opcional)"
        value={telefone}
        onChangeText={(value) => setTelefone(maskTelefoneBR(value))}
        placeholder="(11) 91234-5678"
        keyboardType="phone-pad"
        autoCapitalize="none"
        error={errors.telefone}
      />

      <View style={styles.checkboxBlock}>
        <Checkbox checked={aceiteTermos} onToggle={() => setAceiteTermos((previous) => !previous)}>
          Aceito os <Text style={styles.bold}>Termos</Text> e a{' '}
          <Text style={styles.bold}>Política de Privacidade</Text>.
        </Checkbox>
        {!!errors.termos && <Text style={styles.termsError}>{errors.termos}</Text>}
      </View>

      <Button title="Criar conta" onPress={handleCriarConta} loading={loading} />

      <Pressable style={styles.loginRow} onPress={() => navigation.navigate('Login')} hitSlop={8}>
        <Text style={styles.loginText}>
          Já tem conta? <Text style={styles.loginTextBold}>Entrar</Text>
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
  checkboxBlock: {
    marginBottom: spacing['6'],
  },
  bold: {
    fontFamily: 'HankenGrotesk-Bold',
    color: lightColors.text.primary,
  },
  termsError: {
    marginTop: spacing['1'],
    marginLeft: spacing['5'] + spacing['3'],
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.warning,
  },
  loginRow: {
    alignItems: 'center',
    marginTop: spacing['5'],
  },
  loginText: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.secondary,
  },
  loginTextBold: {
    fontFamily: 'HankenGrotesk-Bold',
    color: lightColors.text.primary,
  },
});
