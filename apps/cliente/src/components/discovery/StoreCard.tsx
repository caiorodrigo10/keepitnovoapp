import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Estabelecimento, LojaDisponibilidade } from '@keepit/core-data';
import { lightColors, spacing, typography } from '@keepit/ui-tokens';

import { formatDistanciaKm, getRatingPlaceholder } from '../../lib/discoveryDisplay';
import { ImagePlaceholder } from './ImagePlaceholder';
import { LojaEstadoBadge } from './LojaEstadoBadge';

interface StoreCardProps {
  loja: Estabelecimento;
  onPress: () => void;
  /** Busca sempre informa a projeção já calculada; Home/Hub podem omiti-la porque só exibem lojas abertas. */
  disponibilidade?: LojaDisponibilidade;
}

const CATEGORIA_LABEL: Record<string, string> = {
  farmacia: 'Farmácia',
  vestuario: 'Roupas',
  conveniencia: 'Conveniência',
  alimentacao: 'Alimentação',
};

/**
 * [IDS] CREATE — card de loja fiel a `cliente-02-home-hub.png` (linha
 * "Loja Bem Vestir · Roupas · 1,2 km · ★ 4.6"), reaproveitado em Home, Hub,
 * Busca por loja e seção "Lojas" da Busca por produto.
 */
export function StoreCard({ loja, onPress, disponibilidade }: StoreCardProps) {
  const categoriaLabel = CATEGORIA_LABEL[loja.categoria] ?? loja.categoria;

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <ImagePlaceholder uri={loja.foto_fachada_url} />
      <View style={styles.info}>
        <Text style={styles.nome} numberOfLines={1}>
          {loja.nome_fantasia}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {categoriaLabel} · {formatDistanciaKm(loja.id)} · ★ {getRatingPlaceholder(loja.id).toFixed(1)}
        </Text>
      </View>
      {disponibilidade?.estado ? (
        <LojaEstadoBadge estado={disponibilidade.estado} />
      ) : (
        <Text style={styles.chevron}>{'>'}</Text>
      )}
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
  info: {
    flex: 1,
  },
  nome: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  meta: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
    marginTop: 2,
  },
  chevron: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.tertiary,
  },
});

export { CATEGORIA_LABEL };
