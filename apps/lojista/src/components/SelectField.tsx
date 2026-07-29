import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Dropdown rotulado — Story 0.8.
 *
 * Sem `@react-native-picker/picker` instalado no workspace (não é dependência
 * atual do `apps/lojista`) — implementado com `Modal` + `FlatList` nativos do
 * React Native, sem introduzir dependência nova (Task 4/5/6/10 exigem apenas
 * fidelidade visual, não um picker nativo específico).
 *
 * [IDS] REUSE (dentro da story): usado por Categoria, Hub de operação (passo
 * 1) e Tipo da chave Pix (passo 3).
 */
export interface SelectFieldProps {
  label: string;
  value: string | null;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SelectField({ label, value, options, onChange, placeholder = 'Selecione' }: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: darkColors.text.secondary }]}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.trigger, { backgroundColor: darkColors.bg.surface, borderColor: darkColors.border.default }]}
      >
        <Text
          style={[
            styles.triggerText,
            { color: selected ? darkColors.text.primary : darkColors.text.placeholder },
          ]}
        >
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={darkColors.text.tertiary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: darkColors.bg.elevated }]}>
            <Text style={[styles.sheetTitle, { color: darkColors.text.primary }]}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={styles.option}
                >
                  <Text
                    style={[
                      styles.optionText,
                      { color: item.value === value ? darkColors.accent.brand : darkColors.text.primary },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[1],
  },
  label: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
    lineHeight: typography.sizes.base.lineHeight,
  },
  trigger: {
    height: 52,
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  triggerText: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    maxHeight: '60%',
    borderTopLeftRadius: radii.modal,
    borderTopRightRadius: radii.modal,
    padding: spacing[5],
    gap: spacing[2],
  },
  sheetTitle: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    marginBottom: spacing[2],
  },
  option: {
    paddingVertical: spacing[3],
  },
  optionText: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
  },
});
