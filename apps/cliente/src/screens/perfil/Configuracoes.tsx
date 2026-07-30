import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { Screen } from '../../components/ui';
import { resetOnboardingVisto } from '../../lib/onboardingFlag';
import type { PerfilStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PerfilStackParamList, 'Configuracoes'>;

/**
 * Configurações (Task 7, AC1, AC2).
 *
 * Sem referência visual dedicada — segue o design system. Toggle de
 * notificações é **local/visual**: `Cliente` (Story 0.2) não expõe
 * `notificacoes_ativas` na port (só existe no modelo Supabase de
 * referência, `docs/architecture/03-data-models.md`), então o estado
 * inicial é `true` (default do schema) sem persistência real — documentado
 * no Dev Agent Record.
 *
 * "Excluir minha conta" (FR24) navega para `ExcluirConta` (rota já
 * existente desde a Story 0.3) em vez de abrir WhatsApp de verdade — fora
 * de escopo do Épico 0 (Task 7). "Falar com Keepit"/"Falar com o lojista"
 * são CTAs visuais sem deep-link funcional.
 */
export default function Configuracoes({ navigation }: Props) {
  const [notificacoesAtivas, setNotificacoesAtivas] = useState(true);

  return (
    <Screen>
      <Text style={styles.title}>Configurações</Text>

      <View style={styles.section}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>Notificações push</Text>
            <Text style={styles.rowHint}>Avisos sobre pedidos e status de retirada.</Text>
          </View>
          <Switch
            value={notificacoesAtivas}
            onValueChange={setNotificacoesAtivas}
            trackColor={{ false: lightColors.border.muted, true: lightColors.accent.brand }}
            thumbColor={lightColors.bg.primary}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Pressable style={styles.linkRow}>
          <Text style={styles.linkLabel}>Falar com Keepit</Text>
        </Pressable>
        <Pressable style={styles.linkRow}>
          <Text style={styles.linkLabel}>Falar com o lojista</Text>
        </Pressable>
      </View>

      <Pressable style={styles.dangerRow} onPress={() => navigation.navigate('ExcluirConta')}>
        <Text style={styles.dangerLabel}>Excluir minha conta</Text>
      </Pressable>

      {__DEV__ ? (
        <Pressable
          style={styles.devRow}
          onPress={() => {
            void resetOnboardingVisto();
            Alert.alert('Onboarding redefinido', 'Reabra o app para vê-lo novamente.');
          }}
        >
          <Text style={styles.devLabel}>[DEV] Redefinir onboarding</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
    lineHeight: typography.sizes['2xl'].lineHeight,
    color: lightColors.text.primary,
    marginBottom: spacing['6'],
  },
  section: {
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.card,
    marginBottom: spacing['5'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing['4'],
  },
  rowText: {
    flex: 1,
    marginRight: spacing['3'],
  },
  rowLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  rowHint: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
    marginTop: spacing['1'],
  },
  linkRow: {
    padding: spacing['4'],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border.subtle,
  },
  linkLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  dangerRow: {
    alignItems: 'center',
    paddingVertical: spacing['4'],
  },
  dangerLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.accent.warning,
  },
  devRow: {
    alignItems: 'center',
    marginTop: spacing['5'],
    paddingVertical: spacing['3'],
  },
  devLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
  },
});
