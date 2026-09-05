import { StyleSheet, Text, View } from 'react-native';

import { lightColors, spacing, typography } from '@keepit/ui-tokens';

import { useQaScenario } from '../../context/QaScenarioContext';
import { isAnySimulationActive } from '../../lib/qaSimulation';

export function SimulatedStateBanner() {
  const { state } = useQaScenario();

  if (!isAnySimulationActive(state)) {
    return null;
  }

  return (
    <View accessibilityRole="alert" style={styles.banner}>
      <Text style={styles.label}>Estado simulado ativo</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    backgroundColor: lightColors.accent.warning,
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['2'],
  },
  label: {
    color: lightColors.bg.primary,
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
  },
});
