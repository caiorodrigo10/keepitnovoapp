import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getDataClient, type AccountDeletionRecord } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AppHeader, Button, Screen } from '../../components/ui';
import type { AccountDeletionLookup } from '../../lib/accountDeletionRoute';
import type { RootStackParamList } from '../../navigation/types';

type NavigationProps = NativeStackScreenProps<RootStackParamList, 'ScheduledDeletion'>;

export type ExclusaoAgendadaProps = NavigationProps & {
  lookup: AccountDeletionLookup;
  onDeletionChange: (deletion: AccountDeletionRecord | null) => void;
  onRetry: () => void;
};

function formatDeadline(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function ExclusaoAgendada({
  lookup,
  onDeletionChange,
  onRetry,
}: ExclusaoAgendadaProps) {
  const [pending, setPending] = useState<'cancel' | 'signout' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deletion = lookup.status === 'resolved' ? lookup.deletion : null;
  const canRecover = deletion?.status === 'scheduled';
  const busy = pending !== null;

  async function handleRecover() {
    if (!canRecover || busy) return;
    setError(null);
    setPending('cancel');
    try {
      const result = await getDataClient().accountDeletion.cancel();
      onDeletionChange(result);
      if (result && result.status !== 'cancelled') {
        setError('O prazo de recuperação terminou e a solicitação não pode mais ser cancelada.');
      }
    } catch {
      setError('Não foi possível recuperar sua conta agora. Tente novamente.');
    } finally {
      setPending(null);
    }
  }

  async function handleSignOut() {
    if (busy) return;
    setError(null);
    setPending('signout');
    try {
      await getDataClient().auth.signOut();
    } catch {
      setError('Não foi possível sair agora. Tente novamente.');
      setPending(null);
    }
  }

  return (
    <Screen scroll={false}>
      <AppHeader title="Exclusão agendada" badge={{ label: 'Acesso restrito', tone: 'warning' }} />
      <View style={styles.body}>
        {lookup.status === 'loading' ? (
          <Text accessibilityLiveRegion="polite" style={styles.description}>
            Verificando o estado da sua solicitação…
          </Text>
        ) : lookup.status === 'failed' ? (
          <View>
            <Text accessibilityRole="alert" style={styles.error}>
              Não foi possível confirmar o estado da exclusão. Seu acesso permanece restrito por segurança.
            </Text>
            <Button disabled={busy} onPress={onRetry} title="Tentar novamente" variant="outline" />
          </View>
        ) : deletion ? (
          <View>
            <Text style={styles.title}>
              {canRecover ? 'Sua conta está agendada para exclusão' : 'Sua solicitação não pode ser recuperada'}
            </Text>
            <Text style={styles.description}>
              {canRecover
                ? 'Até o prazo abaixo, você pode cancelar a solicitação e voltar a usar a Keepit.'
                : 'O prazo de recuperação terminou ou a solicitação já entrou em processamento.'}
            </Text>
            <View style={styles.deadlineCard}>
              <Text style={styles.deadlineLabel}>Prazo de recuperação</Text>
              <Text style={styles.deadlineValue}>{formatDeadline(deletion.deleteAt)}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.description}>Nenhuma exclusão ativa foi encontrada.</Text>
        )}

        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </View>

      <View style={styles.footer}>
        {canRecover ? (
          <Button
            disabled={busy}
            loading={pending === 'cancel'}
            onPress={() => void handleRecover()}
            title="Recuperar minha conta"
          />
        ) : null}
        <Button
          disabled={busy}
          loading={pending === 'signout'}
          onPress={() => void handleSignOut()}
          title="Sair"
          variant="ghost"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
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
  deadlineCard: {
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.card,
    padding: spacing['4'],
  },
  deadlineLabel: {
    color: lightColors.text.secondary,
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
    marginBottom: spacing['1'],
  },
  deadlineValue: {
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
