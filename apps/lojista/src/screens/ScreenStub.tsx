import { StyleSheet, Text, View } from 'react-native';

import { darkColors, typography } from '@keepit/ui-tokens';

/**
 * Factory de tela stub — Épico 0, Story 0.3.
 *
 * Gera um componente mínimo (`<View><Text>{nome}</Text></View>`), temático
 * (tema dark do App Lojista), sem lógica/dados. Usado para popular a árvore
 * de navegação com destino real antes do conteúdo de cada tela chegar
 * (Stories 0.8–0.11).
 *
 * [IDS] REUSE: um único factory evita duplicar o mesmo JSX em ~26 arquivos
 * de tela stub do Lojista — cada rota ainda tem seu próprio arquivo em
 * `src/screens/**`, apenas delegando o corpo visual para este helper.
 */
export function createScreenStub(screenName: string) {
  function ScreenStub() {
    return (
      <View style={[styles.container, { backgroundColor: darkColors.bg.primary }]}>
        <Text style={[styles.text, { color: darkColors.text.primary }]}>{screenName}</Text>
      </View>
    );
  }

  ScreenStub.displayName = `ScreenStub(${screenName})`;
  return ScreenStub;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    lineHeight: typography.sizes.lg.lineHeight,
  },
});
