import { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { getDataClient, type AccountDeletionRecord } from '@keepit/core-data';
import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { PrimaryButton } from '../../components/PrimaryButton';
import { recoverLojistaDeletion, type DeletionLookup } from '../../lib/accountDeletionAccess';
import { signOutLojista } from '../../navigation/lojistaSession';

type Props = {
  lookup: DeletionLookup;
  onDeletionChange: (record: AccountDeletionRecord | null) => void;
  onRetry: () => void;
};

export default function ExclusaoAgendada({ lookup, onDeletionChange, onRetry }: Props) {
  const [pending, setPending] = useState<'cancel' | 'signout' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const record = lookup.status === 'resolved' ? lookup.deletion : null;
  const canRecover = record?.status === 'scheduled';

  async function handleRecover() {
    if (!canRecover || pending) return;
    setPending('cancel');
    setError(null);
    try {
      onDeletionChange(await recoverLojistaDeletion(getDataClient().accountDeletion));
    } catch (cause) {
      setError(cause instanceof Error && cause.message === 'PRAZO_ENCERRADO'
        ? 'O prazo de recuperação terminou e a solicitação não pode mais ser cancelada.'
        : 'Não foi possível recuperar sua conta agora. Tente novamente.');
    } finally {
      setPending(null);
    }
  }

  async function handleSignOut() {
    if (pending) return;
    setPending('signout');
    setError(null);
    try {
      await getDataClient().lojistaAuth.signOut();
      signOutLojista();
    } catch {
      setError('Não foi possível sair agora. Tente novamente.');
      setPending(null);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>Exclusão agendada</Text>
        {lookup.status === 'loading' ? (
          <Text style={styles.description}>Verificando o estado da sua solicitação…</Text>
        ) : lookup.status === 'failed' ? (
          <>
            <Text style={styles.description}>Não foi possível confirmar o estado da exclusão. O acesso permanece restrito por segurança.</Text>
            <PrimaryButton label="Tentar novamente" onPress={onRetry} disabled={pending !== null} />
          </>
        ) : record ? (
          <>
            <Text style={styles.description}>{canRecover
              ? 'Você pode recuperar sua conta antes do prazo informado.'
              : 'Esta solicitação não pode ser recuperada agora.'}</Text>
            <Text style={styles.description}>Prazo informado: {new Intl.DateTimeFormat('pt-BR', {
              dateStyle: 'long', timeStyle: 'short',
            }).format(new Date(record.deleteAt))}</Text>
            {canRecover ? <PrimaryButton label="Recuperar minha conta" loading={pending === 'cancel'}
              disabled={pending !== null} onPress={() => void handleRecover()} /> : null}
          </>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <PrimaryButton label="Sair" loading={pending === 'signout'} disabled={pending !== null}
          onPress={() => void handleSignOut()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: darkColors.bg.primary },
  content: { flex: 1, paddingHorizontal: spacing[5], paddingVertical: spacing[6], gap: spacing[5] },
  title: { color: darkColors.text.primary, fontFamily: 'HankenGrotesk-Bold', fontSize: typography.sizes['2xl'].fontSize },
  description: { color: darkColors.text.secondary, fontFamily: 'HankenGrotesk-Regular', fontSize: typography.sizes.md.fontSize, lineHeight: typography.sizes.md.lineHeight },
  error: { color: darkColors.accent.warning, fontFamily: 'HankenGrotesk-Regular', fontSize: typography.sizes.sm.fontSize },
});
