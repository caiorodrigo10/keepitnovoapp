import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';

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
  const [now, setNow] = useState(Date.now);
  const record = lookup.status === 'resolved' ? lookup.deletion : null;
  const canRecover = record?.status === 'scheduled' && Date.parse(record.deleteAt) > Math.max(now, Date.now());

  useEffect(() => {
    if (record?.status !== 'scheduled') return;
    const remaining = Date.parse(record.deleteAt) - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(remaining, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [record?.status, record?.deleteAt, now]);

  async function handleRecover() {
    if (!canRecover || pending || !record || Date.parse(record.deleteAt) <= Date.now()) return;
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
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>
          {record?.status === 'completed' ? 'Exclusão concluída'
            : record?.status === 'processing' || record?.status === 'failed' ? 'Exclusão em processamento'
              : 'Exclusão agendada'}
        </Text>
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
              ? `Você pode cancelar até ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(record.deleteAt))}.`
              : record.status === 'scheduled'
                ? 'O prazo para cancelar terminou. Sua solicitação aguarda processamento ou revisão de pendências.'
                : record.status === 'completed'
                  ? 'A exclusão da conta Keepit foi concluída. O acesso à conta foi encerrado.'
                  : 'Sua exclusão está em processamento. Uma falha temporária não cancela a solicitação.'}</Text>
            {record.status === 'scheduled' ? <Text style={styles.description}>Prazo para cancelar: {new Intl.DateTimeFormat('pt-BR', {
              dateStyle: 'long', timeStyle: 'short',
            }).format(new Date(record.deleteAt))}</Text> : null}
            {canRecover ? <PrimaryButton label="Recuperar minha conta" loading={pending === 'cancel'}
              disabled={pending !== null} onPress={() => void handleRecover()} /> : null}
          </>
        ) : null}
        <Text style={styles.description}>
          Após sete dias, a solicitação fica elegível para processamento; pendências podem exigir revisão pelo Caio.
          Apenas fatos financeiros e referências indispensáveis são retidos por cinco anos após o encerramento financeiro, com acesso restrito.
          Cópias e logs sob controle da Keepit expiram em até 30 dias da criação. Fornecedores seguem suas próprias políticas e prazos;
          excluir a conta Keepit não apaga os registros mantidos pelos processadores de pagamento.
        </Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <PrimaryButton label="Sair" loading={pending === 'signout'} disabled={pending !== null}
          onPress={() => void handleSignOut()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: darkColors.bg.primary },
  content: { flexGrow: 1, paddingHorizontal: spacing[5], paddingVertical: spacing[6], gap: spacing[5] },
  title: { color: darkColors.text.primary, fontFamily: 'HankenGrotesk-Bold', fontSize: typography.sizes['2xl'].fontSize },
  description: { color: darkColors.text.secondary, fontFamily: 'HankenGrotesk-Regular', fontSize: typography.sizes.md.fontSize, lineHeight: typography.sizes.md.lineHeight },
  error: { color: darkColors.accent.warning, fontFamily: 'HankenGrotesk-Regular', fontSize: typography.sizes.sm.fontSize },
});
