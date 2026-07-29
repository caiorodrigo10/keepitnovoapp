import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AsyncCallOptions } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

export type DevSimState = 'normal' | 'empty' | 'error';

interface DevStateToggleProps {
  value: DevSimState;
  onChange: (state: DevSimState) => void;
}

/**
 * Converte a seleção do toggle em `AsyncCallOptions` (Story 0.2, AC4) para
 * ser repassado aos hooks de port.
 */
export function toAsyncCallOptions(state: DevSimState): AsyncCallOptions {
  if (state === 'empty') return { forceEmpty: true };
  if (state === 'error') return { forceError: true };
  return {};
}

const OPTIONS: { id: DevSimState; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'empty', label: 'Vazio' },
  { id: 'error', label: 'Erro' },
];

/**
 * [IDS] CREATE — não existe simulador iOS/emulador Android no ambiente
 * (mesma limitação de sandbox documentada desde a Story 0.1, REQ-002). Como
 * o AC3 desta story exige exercitar loading/vazio/erro de forma "fiel",
 * este controle dev-only (`__DEV__`) injeta `AsyncCallOptions.forceEmpty` /
 * `forceError` em runtime, permitindo ao @qa validar os 3 estados de cada
 * tela sem simulador — ver Testing (Dev Notes da Story 0.5). Só renderiza em
 * `__DEV__`, nunca aparece em build de produção.
 */
export function DevStateToggle({ value, onChange }: DevStateToggleProps) {
  if (!__DEV__) {
    return null;
  }

  return (
    <View style={styles.row}>
      <Text style={styles.label}>Estado (dev):</Text>
      {OPTIONS.map((option) => {
        const active = option.id === value;
        return (
          <Pressable
            key={option.id}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(option.id)}
          >
            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing['1'],
    marginBottom: spacing['3'],
  },
  label: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.xs.fontSize,
    color: lightColors.text.tertiary,
    marginRight: spacing['1'],
  },
  chip: {
    paddingHorizontal: spacing['2'],
    height: 24,
    borderRadius: radii.full,
    backgroundColor: lightColors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: lightColors.accent.warning,
  },
  chipLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.xs.fontSize,
    color: lightColors.text.tertiary,
  },
  chipLabelActive: {
    color: lightColors.text.primary,
  },
});
