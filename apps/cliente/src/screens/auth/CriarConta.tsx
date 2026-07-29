import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getDataClient } from '@keepit/core-data';
import { lightColors, spacing, typography } from '@keepit/ui-tokens';

import { Button, Checkbox, Screen, TextField } from '../../components/ui';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'CriarConta'>;

interface FormErrors {
  nome?: string;
  email?: string;
  senha?: string;
  telefone?: string;
  termos?: string;
}

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
 * **Login social removido** (Google/Apple aparecem na captura, mas a
 * decisão de negócio da Rodada 2 tira login social do MVP) — ver Dev Agent
 * Record.
 *
 * Sem submit real: `auth.port.signUp` do mock só aceita `{ nome, telefone }`
 * (Story 0.2 não modela e-mail/senha no `Cliente`) — chamado apenas para
 * exercitar o estado de loading do botão, sem bloquear a navegação.
 */
export default function CriarConta({ navigation }: Props) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [telefone, setTelefone] = useState('');
  const [aceiteTermos, setAceiteTermos] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    if (!nome.trim()) nextErrors.nome = 'Informe seu nome completo.';
    if (!EMAIL_REGEX.test(email.trim())) nextErrors.email = 'Informe um e-mail válido.';
    if (senha.length < 6) nextErrors.senha = 'A senha precisa ter pelo menos 6 caracteres.';
    if (!telefone.trim()) nextErrors.telefone = 'Informe seu telefone com DDD.';
    if (!aceiteTermos) nextErrors.termos = 'É preciso aceitar os Termos e a Política de Privacidade.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleCriarConta() {
    if (!validate()) return;

    setLoading(true);
    try {
      const client = getDataClient();
      await client.auth.signUp({ nome: nome.trim(), telefone: telefone.trim() });
    } finally {
      setLoading(false);
      navigation.navigate('ConfirmacaoSMS');
    }
  }

  return (
    <Screen>
      <Text style={styles.brand}>KEEPIT</Text>
      <Text style={styles.title}>Criar conta</Text>
      <Text style={styles.subtitle}>Compre em minutos no hub mais perto de você.</Text>

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
        label="Telefone"
        value={telefone}
        onChangeText={setTelefone}
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
