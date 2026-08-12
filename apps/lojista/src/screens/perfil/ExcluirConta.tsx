import { Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';
import { SUPORTE_WHATSAPP_DISPONIVEL, SUPORTE_WHATSAPP_NUMERO } from '@keepit/config';

import { PrimaryButton } from '../../components/PrimaryButton';
import type { PerfilStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PerfilStackParamList, 'ExcluirConta'>;

function handleFalarComAtendimento(): void {
  if (SUPORTE_WHATSAPP_DISPONIVEL && SUPORTE_WHATSAPP_NUMERO) {
    void Linking.openURL(`https://wa.me/${SUPORTE_WHATSAPP_NUMERO}`);
  }
  // Enquanto `SUPORTE_WHATSAPP_DISPONIVEL` é `false` (WA-001 pendente), o
  // botão fica `disabled` (ver JSX abaixo) — `onPress` nem chega a disparar
  // neste estado, mesmo padrão já usado em `EmAnalise.tsx`/`ContaIndisponivel.tsx`.
}

/**
 * Excluir conta — Story 0.8 (Task 10), honestidade corrigida pela Story 3.12
 * (AC1).
 *
 * **Antes (Story 0.8):** simulava sucesso — `Alert.alert('Conta excluída',
 * 'Esta é uma simulação...')` seguido de `navigation.popToTop()`, sem
 * nenhuma chamada real. O próprio JSDoc anterior já documentava isso como
 * provisório.
 *
 * **Agora (Story 3.12, AC1).** A exclusão de conta é uma ação MANUAL do
 * atendimento/admin da Keepit — nunca automatizada por este app (fora do
 * roadmap do piloto, ver Dev Notes da Story). Esta tela nunca chama nenhuma
 * mutação (`estabelecimentos.status`, `auth.users`, ou qualquer outra) — só
 * comunica o caminho real (atendimento via WhatsApp) e o canal, honestamente,
 * como indisponível enquanto WA-001 (`docs/orchestration/PENDENCIAS-CAIO.md`)
 * não é respondido.
 *
 * [IDS] REUSE do MESMO seam central `SUPORTE_WHATSAPP_NUMERO`/
 * `SUPORTE_WHATSAPP_DISPONIVEL` (`@keepit/config`, Story 3.6) e do MESMO
 * padrão de botão desabilitado + rótulo "(em breve)" já usado em
 * `EmAnalise.tsx`/`ContaIndisponivel.tsx` — dois sinais (estado visual +
 * texto) de que o canal ainda não está ativo, sem `wa.me`/`tel:`/`mailto:`
 * com número inventado. Quando WA-001 for respondido, a ativação é só a
 * troca de UM valor em `@keepit/config`, sem redesenho desta tela.
 *
 * [AUTO-DECISION] `ConfirmModal` (Story 0.8) removido desta tela → (reason:
 * o modal existia para confirmar uma ação DESTRUTIVA local antes de um
 * `Alert` de sucesso fictício. Sem nenhuma ação destrutiva real acontecendo
 * aqui — só um link honesto para o atendimento, hoje desabilitado — um modal
 * de "tem certeza?" antes de um botão que nem dispara nada neste estado
 * criaria confirmação sem efeito, o que a própria regra de honestidade do
 * AC1 (Ajuste @po: "a copy não pode dar a entender que uma solicitação foi
 * registrada/enviada") pede para evitar. `ConfirmModal` continua em uso por
 * `EditarProduto.tsx` — não removido do design system, só desta tela).
 */
export default function ExcluirConta(_props: Props) {
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.content}>
        <View style={styles.body}>
          <Text style={[styles.title, { color: darkColors.text.primary }]}>Excluir conta</Text>
          <Text style={[styles.description, { color: darkColors.text.secondary }]}>
            A exclusão da sua conta é feita pelo atendimento da Keepit — não é uma ação automática
            deste app. Fale com a gente pelo WhatsApp para solicitar; nenhum dado é apagado só por
            você visitar esta tela.
          </Text>
        </View>

        <PrimaryButton
          label={SUPORTE_WHATSAPP_DISPONIVEL ? 'Falar com o atendimento' : 'Falar com o atendimento (em breve)'}
          onPress={handleFalarComAtendimento}
          disabled={!SUPORTE_WHATSAPP_DISPONIVEL}
          variant="warning"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[6],
  },
  body: {
    gap: spacing[3],
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
  },
  description: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    lineHeight: typography.sizes.md.lineHeight,
  },
});
