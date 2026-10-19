import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { BellIcon, Button, Screen } from '../../components/ui';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ModalPermissaoPush'>;

/**
 * Modal de permissão push (Task 8, AC1, AC2, AC3, AC4 — FR25).
 *
 * Rota modal raiz (`presentation: 'modal'`, definida na Story 0.3 /
 * `RootNavigator`). [Source: docs/prd/02-requirements.md#FR25] — "habilitado
 * por padrão após cadastro; opção de desligar em Configurações". Aqui é
 * apenas o modal de opt-in: "Permitir"/"Agora não" fecham o modal sem
 * chamar nenhuma API real de push do SO (isso é responsabilidade de
 * integração fora do Épico 0).
 */
export default function ModalPermissaoPush({ navigation }: Props) {
  return (
    <Screen scroll={false} contentStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.icon}>
          <BellIcon color={lightColors.accent.successFg} size={26} />
        </View>
        <Text style={styles.title}>Ativar notificações?</Text>
        <Text style={styles.subtitle}>
          Avisamos quando seu pedido ficar pronto e quando chegar sua vez de retirar no hub. Você
          pode desligar quando quiser em Configurações.
        </Text>
        <Button title="Permitir" onPress={() => navigation.goBack()} />
        <Button title="Agora não" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: lightColors.bg.primary,
    borderRadius: radii.modal,
    padding: spacing['6'],
    alignItems: 'center',
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radii.full,
    backgroundColor: lightColors.accent.successBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing['4'],
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
    color: lightColors.text.primary,
    marginBottom: spacing['2'],
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    lineHeight: typography.sizes.md.lineHeight,
    color: lightColors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing['6'],
  },
});
