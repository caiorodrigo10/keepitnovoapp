import { StyleSheet, Text, View } from 'react-native';

import type { PedidoStatus } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { isPedidoCancelado, PEDIDO_STATUS_LABEL } from '../../lib/pedidoStatus';

interface PedidoStatusBadgeProps {
  status: PedidoStatus;
}

/**
 * [IDS] ADAPT — mesmo padrão visual de `LojaEstadoBadge` (Story 0.5: pill
 * `radii.badge` + 3 tons de fundo), adaptado para os 15 valores de
 * `PedidoStatus` em vez dos 3 de `LojaEstado`. Reaproveita a MESMA paleta
 * (`accent.successBg/successFg` para "Pronto no hub"/positivo,
 * `bg.muted`/`text.secondary` para neutro/em progresso, `accent.warning`
 * para cancelado/exceção) — sem introduzir cor nova fora de
 * `@keepit/ui-tokens`. Fiel ao badge verde "Pronto no hub" confirmado em
 * `cliente-07-pedidos.png`.
 */
export function PedidoStatusBadge({ status }: PedidoStatusBadgeProps) {
  const tone = toneForStatus(status);

  return (
    <View style={[styles.badge, tone === 'success' && styles.success, tone === 'warning' && styles.warning]}>
      <Text
        style={[
          styles.label,
          tone === 'success' && styles.labelSuccess,
          tone === 'warning' && styles.labelWarning,
        ]}
      >
        {PEDIDO_STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

function toneForStatus(status: PedidoStatus): 'success' | 'warning' | 'neutral' {
  if (status === 'no_hub' || status === 'entregue') return 'success';
  if (isPedidoCancelado(status)) return 'warning';
  return 'neutral';
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['1'],
    borderRadius: radii.badge,
    backgroundColor: lightColors.bg.muted,
    alignSelf: 'flex-start',
  },
  success: {
    backgroundColor: lightColors.accent.successBg,
  },
  warning: {
    backgroundColor: lightColors.accent.warning,
  },
  label: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
  },
  labelSuccess: {
    color: lightColors.accent.successFg,
  },
  labelWarning: {
    color: lightColors.bg.primary,
  },
});
