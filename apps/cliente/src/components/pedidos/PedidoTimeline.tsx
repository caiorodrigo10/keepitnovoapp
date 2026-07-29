import { StyleSheet, Text, View } from 'react-native';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { TIMELINE_STEPS } from '../../lib/pedidoStatus';

interface PedidoTimelineProps {
  /** Índice (0-3) do estágio ativo — ver `timelineStepIndex()`. */
  currentStep: number;
}

/**
 * [IDS] CREATE — timeline "Pago → Em preparo → Pronto no hub → Entregue"
 * fiel a `cliente-06-seu-pedido-pin.png`: círculo preenchido + check para
 * passos concluídos, círculo com ponto para o passo atual, círculo vazio
 * para os futuros, conectados por uma linha horizontal.
 */
export function PedidoTimeline({ currentStep }: PedidoTimelineProps) {
  return (
    <View style={styles.row}>
      {TIMELINE_STEPS.map((label, index) => {
        const done = index < currentStep;
        const current = index === currentStep;
        const isLast = index === TIMELINE_STEPS.length - 1;

        return (
          <View key={label} style={styles.step}>
            <View style={styles.stepRow}>
              <View
                style={[
                  styles.dot,
                  (done || current) && styles.dotActive,
                  current && styles.dotCurrent,
                ]}
              >
                {done && <Text style={styles.check}>✓</Text>}
                {current && <View style={styles.dotInner} />}
              </View>
              {!isLast && <View style={[styles.line, done && styles.lineActive]} />}
            </View>
            <Text style={[styles.label, current && styles.labelCurrent]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const DOT_SIZE = 32;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing['4'],
  },
  step: {
    flex: 1,
    alignItems: 'center',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: radii.full,
    backgroundColor: lightColors.bg.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: {
    backgroundColor: lightColors.accent.brand,
  },
  dotCurrent: {
    backgroundColor: lightColors.bg.primary,
    borderWidth: 2,
    borderColor: lightColors.accent.brand,
  },
  dotInner: {
    width: 10,
    height: 10,
    borderRadius: radii.full,
    backgroundColor: lightColors.accent.brand,
  },
  check: {
    color: lightColors.text.primary,
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.sm.fontSize,
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: lightColors.border.default,
  },
  lineActive: {
    backgroundColor: lightColors.accent.brand,
  },
  label: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.xs.fontSize,
    color: lightColors.text.tertiary,
    textAlign: 'center',
    marginTop: spacing['2'],
  },
  labelCurrent: {
    color: lightColors.text.primary,
    fontFamily: 'HankenGrotesk-SemiBold',
  },
});
