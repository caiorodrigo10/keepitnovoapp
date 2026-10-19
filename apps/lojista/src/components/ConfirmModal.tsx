import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { PrimaryButton } from './PrimaryButton';

/**
 * Modal de confirmação para ações destrutivas — Story 0.8 (Task 10,
 * "Excluir conta"). Sem token `danger` em `tokens.json` — usa
 * `accent.warning`, mesma decisão documentada na Dev Notes da story.
 */
export interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ visible, title, message, confirmLabel, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: darkColors.bg.elevated }]}>
          <Text style={[styles.title, { color: darkColors.text.primary }]}>{title}</Text>
          <Text style={[styles.message, { color: darkColors.text.secondary }]}>{message}</Text>
          <View style={styles.actions}>
            <PrimaryButton label={confirmLabel} onPress={onConfirm} variant="warning" />
            <Pressable onPress={onCancel} style={styles.cancelButton}>
              <Text style={[styles.cancelLabel, { color: darkColors.text.tertiary }]}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: spacing[5],
  },
  card: {
    width: '100%',
    borderRadius: radii.modal,
    padding: spacing[5],
    gap: spacing[3],
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
  },
  message: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    lineHeight: typography.sizes.md.lineHeight,
  },
  actions: {
    marginTop: spacing[2],
    gap: spacing[3],
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: spacing[2],
  },
  cancelLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
});
