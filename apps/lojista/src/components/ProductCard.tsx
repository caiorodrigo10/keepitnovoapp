import { Pressable, StyleSheet, Text, View } from 'react-native';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import type { ProdutoCatalogo } from '../screens/catalogo/types';
import { ESTOQUE_BAIXO_LIMIAR } from '../screens/catalogo/estoque';
import { ToggleSwitch } from './ToggleSwitch';

/**
 * Card de produto da lista "Gerenciar catálogo" — Story 0.9 (Task 1/4).
 * Fiel a `docs/design-refs/lojista-07-catalogo.png` (painel P7): thumb +
 * nome + linha de status ("Estoque: N" / "Estoque baixo: N" / "Pausado") +
 * toggle de pausar/reativar à direita (decisão visual — ver Task 4 Dev
 * Notes: toggle inline no card, não swipe/long-press, por fidelidade ao
 * protótipo que já mostra o switch em cada linha).
 */
export interface ProductCardProps {
  produto: ProdutoCatalogo;
  onPress: () => void;
  onToggleAtivo: (nextAtivo: boolean) => void;
}

export function ProductCard({ produto, onPress, onToggleAtivo }: ProductCardProps) {
  const precoLabel = `R$ ${produto.preco_reais.toFixed(2).replace('.', ',')}`;

  let subtitle: string;
  let subtitleColor: string = darkColors.text.tertiary;

  if (!produto.ativo) {
    subtitle = `Pausado · ${precoLabel}`;
  } else if (produto.estoqueDisplay < ESTOQUE_BAIXO_LIMIAR) {
    subtitle = `Estoque baixo: ${produto.estoqueDisplay} · ${precoLabel}`;
    subtitleColor = darkColors.accent.warning;
  } else {
    subtitle = `Estoque: ${produto.estoqueDisplay} · ${precoLabel}`;
  }

  return (
    <View style={styles.row}>
      <Pressable onPress={onPress} style={styles.info}>
        <View style={[styles.thumb, { backgroundColor: darkColors.bg.surface }]} />
        <View style={styles.texts}>
          <Text
            numberOfLines={1}
            style={[styles.nome, { color: produto.ativo ? darkColors.text.primary : darkColors.text.tertiary }]}
          >
            {produto.nome}
          </Text>
          <Text style={[styles.subtitle, { color: subtitleColor }]}>{subtitle}</Text>
        </View>
      </Pressable>
      <ToggleSwitch value={produto.ativo} onValueChange={onToggleAtivo} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
  },
  info: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  nome: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
  subtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.base.fontSize,
  },
});
