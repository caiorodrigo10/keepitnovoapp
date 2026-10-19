import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

interface SearchBarProps {
  value: string;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  /** `true` = campo somente leitura, usado na Home como entrada de navegação (não digitável ali, o input real fica na tela de Busca). */
  readOnly?: boolean;
  onPress?: () => void;
  autoFocus?: boolean;
}

/**
 * [IDS] CREATE — campo de busca fiel a `cliente-02-home-hub.png`
 * ("Buscar lojas ou produtos") e `cliente-11-busca.png`. `Q` é o "ícone" de
 * lupa em texto — mesma decisão de não instalar lib de ícones nova em
 * `apps/cliente` (ver `Checkbox.tsx`/`BellIcon.tsx`).
 */
export function SearchBar({ value, onChangeText, placeholder, readOnly, onPress, autoFocus }: SearchBarProps) {
  if (readOnly) {
    return (
      <Pressable style={styles.wrapper} onPress={onPress}>
        <Text style={styles.icon}>⌕</Text>
        <Text style={styles.placeholder}>{placeholder}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.icon}>⌕</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={lightColors.text.tertiary}
        autoFocus={autoFocus}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.sm,
    paddingHorizontal: spacing['4'],
    height: 48,
    gap: spacing['2'],
  },
  icon: {
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.tertiary,
  },
  placeholder: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.tertiary,
  },
  input: {
    flex: 1,
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
  },
});
