import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { lightColors, spacing } from '@keepit/ui-tokens';

interface ScreenProps {
  children: ReactNode;
  /** `true` (default) envolve o conteúdo num ScrollView — telas de formulário/lista. */
  scroll?: boolean;
  contentStyle?: ViewStyle;
  /**
   * Override do fundo da safe area. Default `lightColors.bg.primary` (tema
   * claro do app Cliente, usado pelas 27+ telas existentes). Only o
   * onboarding (tema dark, fiel a `cliente-01-onboarding.png`) passa
   * `darkColors.bg.primary` aqui — [IDS] ADAPT, não quebra consumidores
   * existentes pois o prop é opcional com o mesmo default de antes.
   */
  backgroundColor?: string;
}

/**
 * [IDS] CREATE — nenhum wrapper de tela existia em `apps/cliente` antes desta
 * story (só `ScreenStub`). Padroniza fundo `#F6F7F3` (tema claro do Cliente)
 * + safe area + padding horizontal consistente para as 9 telas da Story 0.4,
 * evitando repetir o mesmo `SafeAreaView`/`ScrollView` em cada arquivo.
 */
export function Screen({ children, scroll = true, contentStyle, backgroundColor }: ScreenProps) {
  const safeStyle = [styles.safe, backgroundColor ? { backgroundColor } : null];

  if (!scroll) {
    return (
      <SafeAreaView style={safeStyle} edges={['top', 'bottom']}>
        <View style={[styles.content, styles.flexOne, contentStyle]}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={safeStyle} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={[styles.content, contentStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: lightColors.bg.primary,
  },
  flexOne: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing['6'],
    paddingTop: spacing['6'],
    paddingBottom: spacing['8'],
  },
});
