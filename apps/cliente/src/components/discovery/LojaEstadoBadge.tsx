import { StyleSheet, Text, View } from 'react-native';

import type { LojaEstado } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

interface LojaEstadoBadgeProps {
  estado: LojaEstado;
}

const LABEL: Record<LojaEstado, string> = {
  aberta: 'Aberto',
  fechada: 'Fechado',
  pausada: 'Pausado',
};

/**
 * [IDS] CREATE — pill de estado da loja (AC1: Aberta/Fechada/Pausada),
 * fiel ao badge "Aberto" verde de `cliente-03-loja-catalogo.png`. Fechada e
 * Pausada usam a mesma paleta neutra/aviso (`accent.warning`) — o protótipo
 * só mostra o estado "Aberto"; os outros dois seguem o padrão de
 * badge neutro (`bg.muted`) / aviso já usado em `@keepit/ui-tokens`.
 */
export function LojaEstadoBadge({ estado }: LojaEstadoBadgeProps) {
  return (
    <View
      style={[
        styles.badge,
        estado === 'aberta' && styles.aberta,
        estado === 'fechada' && styles.fechada,
        estado === 'pausada' && styles.pausada,
      ]}
    >
      <Text
        style={[
          styles.label,
          estado === 'aberta' && styles.labelAberta,
          estado === 'fechada' && styles.labelFechada,
          estado === 'pausada' && styles.labelPausada,
        ]}
      >
        {LABEL[estado]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['1'],
    borderRadius: radii.badge,
    alignSelf: 'flex-start',
  },
  aberta: {
    backgroundColor: lightColors.text.primary,
  },
  fechada: {
    backgroundColor: lightColors.bg.muted,
  },
  pausada: {
    backgroundColor: lightColors.accent.warning,
  },
  label: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    letterSpacing: typography.letterSpacing.badge,
  },
  labelAberta: {
    color: lightColors.bg.primary,
  },
  labelFechada: {
    color: lightColors.text.secondary,
  },
  labelPausada: {
    color: lightColors.text.primary,
  },
});
