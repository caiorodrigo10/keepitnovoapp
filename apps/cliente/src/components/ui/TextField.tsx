import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  error?: string;
  editable?: boolean;
}

/**
 * [IDS] CREATE — campo de formulário compartilhado (label + input + estado de
 * erro), reaproveitado por Criar conta, Login, Esqueci a senha e Perfil.
 * Suporte a `secureTextEntry` com alternância "Mostrar"/"Ocultar" em texto
 * (sem ícone de olho — nenhuma lib de ícones está instalada em
 * `apps/cliente`, ver Dev Agent Record da Story 0.4).
 */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'sentences',
  error,
  editable = true,
}: TextFieldProps) {
  const [hidden, setHidden] = useState(secureTextEntry ?? false);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrapper, !!error && styles.inputWrapperError, !editable && styles.inputWrapperDisabled]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={lightColors.text.tertiary}
          secureTextEntry={secureTextEntry ? hidden : false}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={editable}
          style={styles.input}
        />
        {secureTextEntry && (
          <Pressable onPress={() => setHidden((previous) => !previous)} hitSlop={8}>
            <Text style={styles.toggle}>{hidden ? 'Mostrar' : 'Ocultar'}</Text>
          </Pressable>
        )}
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing['5'],
  },
  label: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
    lineHeight: typography.sizes.md.lineHeight,
    color: lightColors.text.secondary,
    marginBottom: spacing['2'],
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: lightColors.border.default,
    paddingHorizontal: spacing['4'],
    height: 52,
  },
  inputWrapperError: {
    borderColor: lightColors.accent.warning,
  },
  inputWrapperDisabled: {
    opacity: 0.6,
  },
  input: {
    flex: 1,
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  toggle: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
  },
  error: {
    marginTop: spacing['1'],
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.warning,
  },
});
