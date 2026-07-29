import { StyleSheet, View } from 'react-native';

import { darkColors, radii, spacing } from '@keepit/ui-tokens';

/**
 * Mini-gráfico de barras do bloco "Vendas" — Story 0.11 (AC1/AC2). Fiel a
 * `docs/design-refs/lojista-01-painel.png`/`lojista-04-vendas.png`: barras
 * cinza-esverdeadas com a mais recente em destaque (accent brand).
 *
 * [IDS] CREATE: nenhum gráfico existia em `apps/lojista` — componente mínimo
 * (só `View`s com altura proporcional), sem lib de charting (fora de escopo
 * do Épico 0 — "backend simples, MVP é MVP", `CLAUDE.md`). Puramente
 * ilustrativo: alturas vêm de `financeiroPresentation.ts#VendasResumo.barras`
 * (0-1, derivado de `client.analytics.topProducts` real desde a Story 1.10),
 * nunca calculadas no componente.
 */
export interface SimpleBarChartProps {
  values: number[];
  highlightIndex?: number;
  height?: number;
}

export function SimpleBarChart({ values, highlightIndex = -1, height = 96 }: SimpleBarChartProps) {
  if (values.length === 0) return null;

  return (
    <View style={[styles.row, { height }]}>
      {values.map((value, index) => (
        <View
          key={index}
          style={[
            styles.bar,
            {
              height: `${Math.max(6, Math.min(100, value * 100))}%`,
              backgroundColor: index === highlightIndex ? darkColors.accent.brand : darkColors.bg.muted,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing[2],
  },
  bar: {
    flex: 1,
    borderRadius: radii.xs,
  },
});
