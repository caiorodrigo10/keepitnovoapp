import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

/**
 * Campo de texto rotulado — Story 0.8.
 *
 * [IDS] REUSE (dentro da story): usado por Cadastro passo 1/2/3, Login e
 * Perfil público — evita duplicar label + `TextInput` estilizado em cada tela.
 *
 * `error` — [IDS] ADAPT (Story 3.2, AC3): adiciona erro inline por campo,
 * mesmo padrão de `apps/cliente/src/components/ui/TextField.tsx` (Story
 * 2.3), sem o toggle "Mostrar"/"Ocultar" (não usado por nenhuma tela do
 * Lojista hoje, fora de escopo desta Story acrescentá-lo).
 *
 * `editable` — [IDS] ADAPT (Story 3.11, AC2): permite reaproveitar o MESMO
 * visual de campo rotulado para exibir um valor somente-leitura (ex.: "Nome
 * da loja" em `PerfilPublico.tsx`, que deixa de ser editável pelo lojista),
 * em vez de duplicar um componente novo só para essa variação. Default
 * `true` — nenhum consumidor existente muda de comportamento.
 */
export interface FormFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  multiline?: boolean;
  error?: string;
  editable?: boolean;
}

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secureTextEntry,
  multiline,
  error,
  editable = true,
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
        editable={editable}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          {
            backgroundColor: editable ? darkColors.bg.surface : darkColors.bg.muted,
            color: editable ? darkColors.text.primary : darkColors.text.secondary,
            borderColor: error ? darkColors.accent.warning : darkColors.border.default,
          },
        ]}
      />
      {!!error && <Text style={[styles.error, { color: darkColors.accent.warning }]}>{error}</Text>}
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
  error: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
  },
});
