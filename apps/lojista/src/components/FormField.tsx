import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

/**
 * Campo de texto rotulado — Story 0.8.
 *
 * [IDS] REUSE (dentro da story): usado por Cadastro passo 1/2/3, Login e
 * Perfil público — evita duplicar label + `TextInput` estilizado em cada tela.
 */
export interface FormFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  multiline?: boolean;
}

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secureTextEntry,
  multiline,
}: FormFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: darkColors.text.secondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={darkColors.text.placeholder}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          { backgroundColor: darkColors.bg.surface, color: darkColors.text.primary, borderColor: darkColors.border.default },
        ]}
      />
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
  input: {
    height: 52,
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing[4],
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
  },
  inputMultiline: {
    height: 96,
    paddingTop: spacing[3],
    textAlignVertical: 'top',
  },
});
