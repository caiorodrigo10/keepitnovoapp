import { Image, StyleSheet, View, type ImageStyle, type ViewStyle } from 'react-native';

import { lightColors, radii } from '@keepit/ui-tokens';

interface ImagePlaceholderProps {
  uri: string | null;
  style?: ImageStyle & ViewStyle;
  borderRadius?: number;
}

/**
 * [IDS] CREATE — quando a fixture de hub/loja/produto tem `foto_url`/
 * `foto_fachada_url` preenchido (imagens reais do mock visual), renderiza a
 * `<Image>`; quando é `null` (ex.: draft de cadastro do Lojista, produto sem
 * foto), cai no retângulo cinza placeholder (fiel ao cinza usado no protótipo
 * quando não há imagem). Componente único para não repetir o mesmo `View`
 * cinza em Home/Hub/Loja/DetalheProduto/Busca.
 */
export function ImagePlaceholder({ uri, style, borderRadius = radii.md }: ImagePlaceholderProps) {
  if (uri) {
    return <Image source={{ uri }} style={[styles.base, { borderRadius }, style]} />;
  }

  return <View style={[styles.base, styles.placeholder, { borderRadius }, style]} />;
}

const styles = StyleSheet.create({
  base: {
    width: 56,
    height: 56,
  },
  placeholder: {
    backgroundColor: lightColors.bg.muted,
  },
});
