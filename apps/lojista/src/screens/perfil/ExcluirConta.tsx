import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { ConfirmModal } from '../../components/ConfirmModal';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { PerfilStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PerfilStackParamList, 'ExcluirConta'>;

/**
 * Excluir conta — Story 0.8 (Task 10).
 *
 * SEM referência visual no protótipo (não existe em nenhuma tela, cliente
 * ou lojista — ver Dev Notes). Usa o padrão de ação destrutiva do design
 * system: `accent.warning` (não há token `danger` dedicado em
 * `tokens.json`), com modal de confirmação antes de "excluir" (apenas
 * navega — sem chamada real, sem persistência).
 *
 * [AUTO-DECISION] Após confirmar, `navigation.popToTop()` volta ao topo da
 * `PerfilStack` (`Configuracoes`) em vez de tentar sair para `AuthStack`
 * (reason: cruzar para `AuthStack`/deslogar exigiria alterar o guard
 * estático `navigation/authGuard.ts`, fora do escopo desta story — mesma
 * limitação documentada em `Login.tsx`). Um `Alert` confirma a ação mock.
 */
export default function ExcluirConta({ navigation }: Props) {
  const [modalVisible, setModalVisible] = useState(false);

  function handleConfirmar() {
    setModalVisible(false);
    Alert.alert('Conta excluída', 'Esta é uma simulação — nenhuma exclusão real foi realizada.');
    navigation.popToTop();
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.content}>
        <View style={styles.body}>
          <Text style={[styles.title, { color: darkColors.text.primary }]}>Excluir conta</Text>
          <Text style={[styles.description, { color: darkColors.text.secondary }]}>
            Ao excluir sua conta, sua loja deixa de receber pedidos e todos os dados de perfil são
            removidos. Pedidos já concluídos e valores da carteira seguem as regras normais de
            repasse da Keepit. Esta ação não pode ser desfeita.
          </Text>
        </View>

        <PrimaryButton label="Excluir minha conta" onPress={() => setModalVisible(true)} variant="warning" />
      </View>

      <ConfirmModal
        visible={modalVisible}
        title="Excluir conta?"
        message="Essa ação é permanente e não pode ser desfeita. Tem certeza que deseja continuar?"
        confirmLabel="Sim, excluir"
        onConfirm={handleConfirmar}
        onCancel={() => setModalVisible(false)}
      />
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
