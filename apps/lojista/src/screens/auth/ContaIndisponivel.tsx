import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';
import { SUPORTE_WHATSAPP_DISPONIVEL } from '@keepit/config';

import { PrimaryButton } from '../../components/PrimaryButton';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ContaIndisponivel'>;

/**
 * Estado defensivo pós-login — Story 3.10 (AC5). [IDS] CREATE.
 *
 * Cobre `status = 'suspenso'` (hoje nenhum caminho do piloto o produz —
 * Story 8.6, Épico 8, é quem fará isso no futuro) e qualquer outro valor de
 * `estabelecimentos.status` não coberto pelos ACs 2-4 — tratamento
 * deliberadamente genérico e honesto (AC5: "nunca uma tela branca, nunca um
 * crash, nunca dado inventado"). NÃO é a tela dedicada de `suspenso` do
 * texto original do épico (que exibiria `motivo_suspensao`) — essa fica
 * para quando a Story 8.6 existir; esta tela nunca lê/exibe
 * `motivo_suspensao` (ver AC5, "nunca confundido com `motivo_rejeicao` ou
 * vice-versa" — aqui, nenhum dos dois é exibido).
 *
 * Botão de suporte — `[IDS] REUSE` do seam `SUPORTE_WHATSAPP_DISPONIVEL`
 * (`@keepit/config`, mesmo usado por `EmAnalise.tsx`, Story 3.6).
 */
export default function ContaIndisponivel({ navigation }: Props) {
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.content}>
        <View style={styles.body}>
          <View style={[styles.iconCircle, { backgroundColor: darkColors.bg.surface }]}>
            <Ionicons name="alert-circle-outline" size={40} color={darkColors.accent.warning} />
          </View>
          <Text style={[styles.title, { color: darkColors.text.primary }]}>Conta temporariamente indisponível</Text>
          <Text style={[styles.subtitle, { color: darkColors.text.secondary }]}>
            Sua conta está temporariamente indisponível para vender pela Keepit. Fale com a
            Keepit para mais informações.
          </Text>
        </View>

        <View style={styles.footer}>
          <PrimaryButton
            label={SUPORTE_WHATSAPP_DISPONIVEL ? 'Falar com Keepit' : 'Falar com Keepit (em breve)'}
            onPress={() => {}}
            disabled={!SUPORTE_WHATSAPP_DISPONIVEL}
          />
          <PrimaryButton label="Voltar ao login" onPress={() => navigation.navigate('Login')} />
        </View>
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
    paddingVertical: spacing[8],
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[4],
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
    lineHeight: typography.sizes['2xl'].lineHeight,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    lineHeight: typography.sizes.md.lineHeight,
    textAlign: 'center',
  },
  footer: {
    gap: spacing[3],
  },
});
