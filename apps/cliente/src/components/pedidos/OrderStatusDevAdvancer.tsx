import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getDataClient } from '@keepit/core-data';
import type { Pedido } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { advanceOrderForQa, getNextQaOrderAction } from '../../lib/qaOrderActions';

interface OrderStatusDevAdvancerProps {
  pedido: Pedido;
  onChanged: () => void;
}

/**
 * [IDS] ADAPT — mesma ideia de `DevStateToggle` (Story 0.5: controle
 * `__DEV__`-only, nunca em produção), adaptada para avançar a MÁQUINA DE
 * ESTADOS do pedido (AC2). Religado para `client.order.advanceStatus`
 * (Story 1.10, Task 2) — `OrderStatusOverrideContext` (Story 0.7) foi
 * removido; os 3 status que a port não expunha (`em_preparo`/`saindo_hub`/
 * `no_hub`) agora são transições REAIS persistidas no mock db.
 */
export function OrderStatusDevAdvancer({ pedido, onChanged }: OrderStatusDevAdvancerProps) {
  if (!__DEV__) {
    return null;
  }

  const nextAction = getNextQaOrderAction(pedido);
  if (!nextAction) {
    return null;
  }

  const handlePress = async () => {
    await advanceOrderForQa(getDataClient(), pedido);
    onChanged();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Avançar status (dev):</Text>
      <Pressable style={styles.button} onPress={handlePress}>
        <Text style={styles.buttonLabel}>{nextAction.label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing['2'],
    marginTop: spacing['4'],
  },
  label: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.xs.fontSize,
    color: lightColors.text.tertiary,
  },
  button: {
    paddingHorizontal: spacing['3'],
    height: 28,
    borderRadius: radii.full,
    backgroundColor: lightColors.accent.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.xs.fontSize,
    color: lightColors.text.primary,
  },
});
