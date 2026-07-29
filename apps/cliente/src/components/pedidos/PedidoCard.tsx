import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Pedido } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { formatReais } from '../../lib/format';
import { ImagePlaceholder } from '../discovery';
import { PedidoStatusBadge } from './PedidoStatusBadge';

interface PedidoCardProps {
  pedido: Pedido;
  estabelecimentoNome: string;
  onPress: () => void;
}

/**
 * [IDS] ADAPT — card de pedido fiel a `cliente-07-pedidos.png`: nome da
 * loja + itens/hub, badge de status, e (só para o card "Pronto no hub", com
 * chip "Código") o PIN em destaque. Reaproveita `ImagePlaceholder`
 * (`discovery`, Story 0.5) para o quadrado de imagem — mesmo padrão de
 * `StoreCard` — em vez de duplicar o placeholder cinza.
 */
export function PedidoCard({ pedido, estabelecimentoNome, onPress }: PedidoCardProps) {
  const qtdItens = pedido.itens.length;
  const mostrarPin = pedido.status === 'no_hub';

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.header}>
        <ImagePlaceholder uri={null} style={styles.imagem} borderRadius={radii.md} />
        <View style={styles.headerInfo}>
          <Text style={styles.nome}>{estabelecimentoNome}</Text>
          <Text style={styles.subtitulo}>
            {qtdItens} {qtdItens === 1 ? 'item' : 'itens'} · Hub {pedido.hub_id === 'hub-centro' ? 'Centro' : pedido.hub_id}
          </Text>
        </View>
        <PedidoStatusBadge status={pedido.status} />
      </View>

      <View style={styles.footer}>
        {mostrarPin ? (
          <View style={styles.pinChip}>
            <Text style={styles.pinChipLabel}>Código</Text>
            <Text style={styles.pinChipValue}>{pedido.pin_texto}</Text>
          </View>
        ) : (
          <Text style={styles.tempoEstimado}>
            {pedido.tempo_estimado_min ? `Pronto em ~${pedido.tempo_estimado_min} min` : ' '}
          </Text>
        )}
        <Text style={styles.total}>{formatReais(pedido.total_pago_reais)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: lightColors.bg.primary,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: lightColors.border.default,
    padding: spacing['4'],
    marginBottom: spacing['3'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imagem: {
    width: 44,
    height: 44,
  },
  headerInfo: {
    flex: 1,
    marginLeft: spacing['3'],
    marginRight: spacing['2'],
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
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing['3'],
  },
  pinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
    backgroundColor: lightColors.accent.successBgAlt,
    borderRadius: radii.badge,
    borderWidth: 1,
    borderColor: lightColors.accent.successBorder,
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['1'],
  },
  pinChipLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.xs.fontSize,
    color: lightColors.accent.successFg,
  },
  pinChipValue: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.successFg,
    letterSpacing: 1,
  },
  tempoEstimado: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.tertiary,
  },
  total: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
  },
});
