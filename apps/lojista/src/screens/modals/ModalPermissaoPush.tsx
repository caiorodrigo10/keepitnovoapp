import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { PrimaryButton } from '../../components/PrimaryButton';
import type { RootStackParamList } from '../../navigation/types';
import { acceptPushPermission, declinePushPermission } from './pushPermissionActions';

type Props = NativeStackScreenProps<RootStackParamList, 'ModalPermissaoPush'>;

/**
 * Opt-in informativo de notificações do lojista. A integração com a permissão
 * nativa fica fora deste fluxo; nenhuma escolha promete ou grava um estado que
 * o sistema operacional ainda não confirmou.
 */
export default function ModalPermissaoPush({ navigation }: Props) {
  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name="notifications" size={26} color={darkColors.accent.success} />
        </View>
        <Text style={styles.title}>Ativar notificações?</Text>
        <Text style={styles.subtitle}>
          Avisamos sobre novos pedidos, alterações de status e quando uma retirada precisar da sua atenção. Você pode desligar quando quiser em Configurações.
        </Text>
        <View style={styles.actions}>
          <PrimaryButton label="Permitir" onPress={() => acceptPushPermission(navigation)} />
          <Pressable accessibilityRole="button" onPress={() => declinePushPermission(navigation)} style={styles.laterButton}>
            <Text style={styles.laterLabel}>Agora não</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: darkColors.bg.primary,
  },
  card: {
    alignItems: 'center',
    backgroundColor: darkColors.bg.surface,
    borderRadius: radii.modal,
    padding: spacing[6],
  },
  icon: {
    alignItems: 'center',
    backgroundColor: darkColors.bg.overlay,
    borderRadius: radii.full,
    height: 56,
    justifyContent: 'center',
    marginBottom: spacing[4],
    width: 56,
  },
  title: {
    color: darkColors.text.primary,
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
    marginBottom: spacing[2],
    textAlign: 'center',
  },
  subtitle: {
    color: darkColors.text.secondary,
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    lineHeight: typography.sizes.md.lineHeight,
    marginBottom: spacing[6],
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    gap: spacing[2],
  },
  laterButton: {
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  laterLabel: {
    color: darkColors.text.secondary,
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
});
