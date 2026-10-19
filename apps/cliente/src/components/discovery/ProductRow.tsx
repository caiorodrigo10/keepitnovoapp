import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Produto } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { ImagePlaceholder } from './ImagePlaceholder';

interface ProductRowProps {
  produto: Produto;
  onPress: () => void;
  /** Subtítulo opcional (ex.: "Farmácia Vida" nos resultados de busca — cliente-11-busca.png). */
  subtitulo?: string;
}

function formatPreco(preco: number): string {
  return preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * [IDS] CREATE — linha de produto fiel a `cliente-03-loja-catalogo.png`
 * (nome/descrição + preço + botão "+"), reaproveitada no catálogo da Loja e
 * nos resultados da Busca por produto (nesse caso com `subtitulo` = nome da
 * loja, como em `cliente-11-busca.png`).
 */
export function ProductRow({ produto, onPress, subtitulo }: ProductRowProps) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <ImagePlaceholder uri={produto.foto_url} style={styles.thumb} borderRadius={radii.md} />
      <View style={styles.info}>
        <Text style={styles.nome} numberOfLines={1}>
          {produto.nome}
        </Text>
        <Text style={styles.subtitulo} numberOfLines={1}>
          {subtitulo ?? produto.descricao ?? ''}
        </Text>
        <Text style={styles.preco}>{formatPreco(produto.preco_reais)}</Text>
      </View>
      <View style={styles.addButton}>
        <Text style={styles.addButtonLabel}>+</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing['3'],
    gap: spacing['3'],
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: lightColors.bg.muted,
  },
  info: {
    flex: 1,
  },
  nome: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
  },
  subtitulo: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
    marginTop: 2,
  },
  preco: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
    marginTop: 2,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: lightColors.accent.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonLabel: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
});
