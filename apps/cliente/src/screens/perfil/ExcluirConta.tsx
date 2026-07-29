import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { Button, Screen } from '../../components/ui';
import type { PerfilStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PerfilStackParamList, 'ExcluirConta'>;

/**
 * Excluir conta (Task 7, AC1, AC2 — FR24, NFR9, NFR10).
 *
 * Em produção, o CTA abre o WhatsApp da Keepit com a mensagem pré-preenchida
 * "Quero excluir minha conta". Nesta story (Épico 0, sem deep-link real
 * obrigatório), o botão é um **stub visual sem side-effect** — não abre
 * WhatsApp de fato. Documentado como decisão consciente no Dev Agent
 * Record.
 */
export default function ExcluirConta({ navigation }: Props) {
  return (
    <Screen scroll={false}>
      <View style={styles.body}>
        <Text style={styles.title}>Excluir minha conta</Text>
        <Text style={styles.text}>
          Para excluir sua conta, fale com a equipe Keepit pelo WhatsApp. Vamos confirmar sua
          solicitação e remover seus dados conforme a LGPD.
        </Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Mensagem que será enviada</Text>
          <Text style={styles.cardMessage}>&ldquo;Quero excluir minha conta&rdquo;</Text>
        </View>
      </View>
      <View style={styles.footer}>
        <Button title="Falar com a Keepit no WhatsApp" onPress={() => {}} />
        <Button title="Cancelar" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
    lineHeight: typography.sizes['2xl'].lineHeight,
    color: lightColors.text.primary,
    marginBottom: spacing['3'],
  },
  text: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    lineHeight: typography.sizes.md.lineHeight,
    color: lightColors.text.secondary,
    marginBottom: spacing['6'],
  },
  card: {
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.card,
    padding: spacing['4'],
  },
  cardLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
    marginBottom: spacing['1'],
  },
  cardMessage: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  footer: {
    gap: spacing['3'],
  },
});
