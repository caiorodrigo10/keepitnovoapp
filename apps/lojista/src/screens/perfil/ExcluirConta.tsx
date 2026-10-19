import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getDataClient, resolveDataMode, type AccountDeletionRecord } from '@keepit/core-data';
import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { FormField } from '../../components/FormField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useCurrentStore } from '../../context/CurrentStoreContext';
import { publishDeletionPersisted, scheduleLojistaDeletion } from '../../lib/accountDeletionAccess';
import type { PerfilStackParamList } from '../../navigation/types';
import { signOutLojista } from '../../navigation/lojistaSession';

type Props = NativeStackScreenProps<PerfilStackParamList, 'ExcluirConta'>;

export default function ExcluirConta(_props: Props) {
  const { id: storeId } = useCurrentStore();
  const realAccount = resolveDataMode(process.env.EXPO_PUBLIC_DATA_SOURCE) === 'supabase';
  const [record, setRecord] = useState<AccountDeletionRecord | null>(null);
  const [loading, setLoading] = useState(realAccount);
  const [statusReady, setStatusReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!realAccount) return;
    let alive = true;
    void getDataClient().accountDeletion.status().then(
      (deletion) => {
        if (alive) {
          setRecord(deletion);
          setStatusReady(true);
          setLoading(false);
          if (storeId && deletion && deletion.status !== 'cancelled') {
            publishDeletionPersisted(storeId, deletion);
          }
        }
      },
      () => {
        if (alive) { setError('Não foi possível consultar a solicitação. Tente novamente.'); setLoading(false); }
      },
    );
    return () => { alive = false; };
  }, [realAccount, storeId]);

  async function handleSchedule() {
    if (!storeId || !confirmed || !password || pending || !statusReady) return;
    setPending(true);
    setError(null);
    let persisted = false;
    try {
      const client = getDataClient();
      await scheduleLojistaDeletion(client.accountDeletion, client.lojistaAuth, password, (deletion) => {
        persisted = true;
        publishDeletionPersisted(storeId, deletion);
      });
      signOutLojista();
    } catch {
      setError(persisted
        ? 'A solicitação foi agendada, mas não foi possível sair. Use “Sair” para tentar novamente.'
        : 'Não foi possível agendar a exclusão. Confira sua senha e tente novamente.');
    } finally {
      setPending(false);
    }
  }

  const canSchedule = realAccount && statusReady && !loading && (record === null || record.status === 'cancelled');
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Exclusão de conta</Text>
        {!realAccount ? (
          <Text style={styles.description}>A exclusão de conta está disponível somente para contas reais autenticadas.</Text>
        ) : loading ? (
          <Text style={styles.description}>Consultando sua solicitação…</Text>
        ) : (
          <>
            <Text style={styles.description}>
              Ao agendar, sua sessão será encerrada. Você terá sete dias para recuperar a conta.
              Após esse prazo, a solicitação fica elegível para processamento. Pendências podem exigir revisão pelo Caio antes da conclusão.
            </Text>
            {record && record.status !== 'cancelled' ? (
              <Text style={styles.description}>Já existe uma solicitação. Volte ao início para consultar o estado.</Text>
            ) : (
              <Text style={styles.description}>Nenhuma exclusão ativa foi encontrada.</Text>
            )}
            {canSchedule ? (
              <View style={styles.actions}>
                <FormField label="Senha atual" value={password} onChangeText={setPassword} secureTextEntry />
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }}
                  onPress={() => setConfirmed((value) => !value)}>
                  <Text style={styles.description}>{confirmed ? '☑' : '☐'} Confirmo o agendamento da exclusão.</Text>
                </Pressable>
                <PrimaryButton label="Agendar exclusão" variant="warning" loading={pending}
                  disabled={!confirmed || !password} onPress={() => void handleSchedule()} />
              </View>
            ) : null}
          </>
        )}
        {realAccount ? (
          <Text style={styles.description}>
            Apenas fatos financeiros e referências indispensáveis são retidos por cinco anos após o encerramento financeiro, com acesso restrito.
            Cópias e logs sob controle da Keepit expiram em até 30 dias da criação. Fornecedores seguem suas próprias políticas e prazos;
            excluir a conta Keepit não apaga os registros mantidos pelos processadores de pagamento.
          </Text>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: darkColors.bg.primary },
  content: { flexGrow: 1, paddingHorizontal: spacing[5], paddingVertical: spacing[6], gap: spacing[4] },
  title: { color: darkColors.text.primary, fontFamily: 'HankenGrotesk-Bold', fontSize: typography.sizes['2xl'].fontSize },
  description: { color: darkColors.text.secondary, fontFamily: 'HankenGrotesk-Regular', fontSize: typography.sizes.md.fontSize, lineHeight: typography.sizes.md.lineHeight },
  actions: { gap: spacing[4] },
  error: { color: darkColors.accent.warning, fontFamily: 'HankenGrotesk-Regular', fontSize: typography.sizes.sm.fontSize },
});
