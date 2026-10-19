import { Pressable, StyleSheet, Text, View } from 'react-native';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

/**
 * Tabs pill de período (7 dias / 30 dias / 90 dias / 1 ano) — Story 0.11.
 *
 * [IDS] CREATE: reaproveitado por `Dashboard` (AC1) e `Vendas` (AC2) — mesmo
 * seletor de período nas duas telas (Task 2: "reaproveitar o seletor de
 * período... mesmo componente/estado da Task 1, se prático"). Estilo pill
 * segue o mesmo padrão de `GerenciarCatalogo.tsx` (tabs Todos/Ativos/Pausados,
 * Story 0.9), generalizado para um componente reaproveitável.
 */
export interface PeriodTabsOption<T extends string> {
  key: T;
  label: string;
}

export interface PeriodTabsProps<T extends string> {
  options: ReadonlyArray<PeriodTabsOption<T>>;
  value: T;
  onChange: (value: T) => void;
}

export function PeriodTabs<T extends string>({ options, value, onChange }: PeriodTabsProps<T>) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[styles.tab, { backgroundColor: active ? darkColors.accent.brand : darkColors.bg.surface }]}
          >
            <Text style={[styles.label, { color: active ? darkColors.bg.primary : darkColors.text.tertiary }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  tab: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
  },
  label: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.base.fontSize,
  },
});
