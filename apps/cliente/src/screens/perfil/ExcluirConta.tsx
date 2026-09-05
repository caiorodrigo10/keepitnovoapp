import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getDataClient, type AccountDeletionRecord } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AppHeader, Button, Checkbox, FormScreen, TextField } from '../../components/ui';
import { scheduleAccountDeletionAndSignOut } from '../../lib/accountDeletionRoute';
import type { PerfilStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PerfilStackParamList, 'ExcluirConta'>;

function formatDeadline(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function ExcluirConta({ navigation }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState<'schedule' | 'signout' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<AccountDeletionRecord | null>(null);

  useEffect(() => {
    if (!scheduled) return;
    return navigation.addListener('beforeRemove', (event) => event.preventDefault());
  }, [navigation, scheduled]);

  async function signOutAfterSchedule() {
    setPending('signout');
    setError(null);
    try {
      await getDataClient().auth.signOut();
    } catch {
      setError('A solicitação foi agendada, mas não foi possível sair. Tente novamente.');
      setPending(null);
    }
  }

  async function handleSchedule() {
    if (!confirmed || !password || pending) return;
    setPending('schedule');
    setError(null);
    let persisted = false;
    try {
      const client = getDataClient();
      await scheduleAccountDeletionAndSignOut(
        client.accountDeletion,
        client.auth,
        password,
        (deletion) => {
          persisted = true;
          setPassword('');
          setScheduled(deletion);
          setPending('signout');
        },
      );
    } catch {
      setError(
        persisted
          ? 'A solicitação foi agendada, mas não foi possível sair. Tente novamente.'
          : 'Não foi possível agendar a exclusão. Confira sua senha e tente novamente.',
      );
      setPending(null);
    }
  }

  if (scheduled) {
    return (
      <FormScreen
        footer={
          <Button
            disabled={pending !== null}
            loading={pending === 'signout'}
            onPress={() => void signOutAfterSchedule()}
            title="Sair da conta"
          />
        }
      >
        <AppHeader title="Exclusão agendada" />
        <Text style={styles.title}>Sua solicitação foi registrada</Text>
        <Text style={styles.description}>
          O acesso ficará restrito à recuperação quando você entrar novamente.
        </Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Você pode recuperar sua conta até</Text>
          <Text style={styles.cardValue}>{formatDeadline(scheduled.deleteAt)}</Text>
        </View>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </FormScreen>
    );
  }

  return (
    <FormScreen
      footer={
        <View style={styles.footer}>
          <Button
            disabled={!confirmed || !password || pending !== null}
            loading={pending === 'schedule'}
            onPress={() => void handleSchedule()}
            title="Agendar exclusão"
          />
          <Button
            disabled={pending !== null}
            onPress={() => navigation.goBack()}
            title="Cancelar"
            variant="ghost"
          />
        </View>
      }
    >
      <AppHeader title="Excluir minha conta" back={{ navigation, fallback: () => navigation.goBack() }} />
      <Text style={styles.title}>Você terá sete dias para voltar atrás</Text>
      <Text style={styles.description}>
        Agendar a exclusão não apaga seus dados imediatamente. Você sairá da conta e, ao entrar novamente,
        verá somente a opção de recuperação até o prazo informado.
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Depois de sete dias</Text>
        <Text style={styles.cardBody}>
          A conta poderá ser bloqueada e seguirá o processo de exclusão definido pela política aplicável.
        </Text>
      </View>

      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <TextField
        autoCapitalize="none"
        label="Senha atual"
        onChangeText={setPassword}
        placeholder="••••••••"
        secureTextEntry
        value={password}
      />
      <Checkbox
        checked={confirmed}
        label="Confirmar agendamento da exclusão"
        onToggle={() => setConfirmed((value) => !value)}
      >
        Entendo o prazo e quero agendar a exclusão da minha conta.
      </Checkbox>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: lightColors.text.primary,
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
    lineHeight: typography.sizes['2xl'].lineHeight,
    marginBottom: spacing['2'],
  },
  description: {
    color: lightColors.text.secondary,
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    lineHeight: typography.sizes.md.lineHeight,
    marginBottom: spacing['6'],
  },
  card: {
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.card,
    marginBottom: spacing['6'],
    padding: spacing['4'],
  },
  cardTitle: {
    color: lightColors.text.primary,
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    marginBottom: spacing['1'],
  },
  cardBody: {
    color: lightColors.text.secondary,
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    lineHeight: typography.sizes.md.lineHeight,
  },
  cardLabel: {
    color: lightColors.text.secondary,
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
    marginBottom: spacing['1'],
  },
  cardValue: {
    color: lightColors.text.primary,
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    lineHeight: typography.sizes.lg.lineHeight,
  },
  error: {
    color: lightColors.accent.warning,
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    lineHeight: typography.sizes.sm.lineHeight,
    marginBottom: spacing['4'],
  },
  footer: { gap: spacing['3'] },
});
