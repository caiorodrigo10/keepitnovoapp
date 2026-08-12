import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getDataClient } from '@keepit/core-data';
import { lightColors, spacing, typography } from '@keepit/ui-tokens';

import { Button, Screen, TextField } from '../../components/ui';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'RecuperarSenha'>;

/**
 * Mesma natureza de `CriarConta.tsx` (Story 2.3): texto novo em pt-BR,
 * sem fonte no protótipo (esta tela não existe nele — é acionada
 * exclusivamente pelo callback de recuperação, AC3).
 */
const MSG_SENHAS_DIFERENTES = 'As senhas precisam ser iguais.';
/** Mesmo limiar de `CriarConta.tsx` (Task 7) — reaproveitado, não é regra nova. */
const MSG_SENHA_CURTA = 'A senha precisa ter pelo menos 8 caracteres.';
const MSG_ERRO_GENERICO = 'Não foi possível redefinir a senha agora. Solicite um novo link e tente novamente.';

/**
 * Redefinir senha (Story 2.7, Task, AC3, AC4, AC5).
 *
 * Superfície acionada exclusivamente pelo callback de recuperação — não
 * está no inventário de rotas navegáveis a partir de um botão/link comum
 * (ver `AuthStack.tsx`, `passwordRecoveryLinking.ts`). Sem referência
 * visual dedicada — segue o design system, mesmo padrão de
 * `EsqueciSenha.tsx`.
 *
 * `route.params.recovery === 'invalid'` (link ausente, de outra rota, com
 * erro do Supabase ou sem sessão de recuperação válida — decidido dentro
 * de `passwordRecoveryLinking.ts`/`auth.supabase.ts`, nunca aqui) mostra o
 * caminho seguro de retorno exigido pela AC3, sem detalhar a causa.
 *
 * Submit chama exclusivamente `auth.port.updatePassword` — nenhum token é
 * lido, exibido ou validado por esta tela (AC5). Sucesso navega para
 * `Login` com `toast: 'Senha redefinida'` (literal da AC4), usando `reset`
 * (não `navigate`) para não deixar esta tela na pilha de volta.
 */
export default function RecuperarSenha({ navigation, route }: Props) {
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linkInvalido = route.params?.recovery === 'invalid';

  async function handleRedefinir() {
    if (senha.length < 8) {
      setError(MSG_SENHA_CURTA);
      return;
    }
    if (senha !== confirmacao) {
      setError(MSG_SENHAS_DIFERENTES);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await getDataClient().auth.updatePassword(senha);
      navigation.reset({ index: 0, routes: [{ name: 'Login', params: { toast: 'Senha redefinida' } }] });
    } catch {
      // AC5 — mensagem genérica, sem logar/exibir a senha ou o erro bruto do SDK.
      setError(MSG_ERRO_GENERICO);
    } finally {
      setLoading(false);
    }
  }

  if (linkInvalido) {
    return (
      <Screen scroll={false}>
        <Text style={styles.title}>Não foi possível abrir este link</Text>
        <Text style={styles.subtitle}>
          O link pode ter expirado ou já ter sido usado. Solicite um novo link de recuperação e tente novamente.
        </Text>
        <Button title="Solicitar novo link" onPress={() => navigation.navigate('EsqueciSenha')} />
        <Button title="Voltar ao login" variant="ghost" onPress={() => navigation.navigate('Login')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>Defina uma nova senha</Text>
      <Text style={styles.subtitle}>Crie uma senha nova para voltar a acessar sua conta.</Text>

      {!!error && <Text style={styles.submitError}>{error}</Text>}

      <TextField
        label="Nova senha"
        value={senha}
        onChangeText={setSenha}
        placeholder="••••••••"
        secureTextEntry
        autoCapitalize="none"
      />
      <TextField
        label="Confirmar nova senha"
        value={confirmacao}
        onChangeText={setConfirmacao}
        placeholder="••••••••"
        secureTextEntry
        autoCapitalize="none"
      />

      <Button
        title="Redefinir senha"
        onPress={handleRedefinir}
        loading={loading}
        disabled={!senha || !confirmacao}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    lineHeight: typography.sizes.md.lineHeight,
    color: lightColors.text.secondary,
    marginBottom: spacing['6'],
  },
  submitError: {
    marginBottom: spacing['4'],
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.warning,
  },
});
