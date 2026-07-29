import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { lightColors, spacing, typography } from '@keepit/ui-tokens';

interface AsyncStateBlockProps {
  kind: 'loading' | 'empty' | 'error';
  emptyLabel?: string;
  errorLabel?: string;
}

const DEFAULT_EMPTY = 'Nada por aqui ainda.';
const DEFAULT_ERROR = 'Não foi possível carregar. Tente novamente.';

/**
 * [IDS] CREATE — bloco compartilhado para os 3 estados exigidos pelo AC3
 * (loading/vazio/erro) em todas as telas desta story. Um único componente
 * evita duplicar `ActivityIndicator`/mensagens em 6 telas.
 */
export function AsyncStateBlock({ kind, emptyLabel, errorLabel }: AsyncStateBlockProps) {
  if (kind === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={lightColors.accent.brand} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{kind === 'empty' ? (emptyLabel ?? DEFAULT_EMPTY) : (errorLabel ?? DEFAULT_ERROR)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing['8'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.secondary,
    textAlign: 'center',
  },
});
