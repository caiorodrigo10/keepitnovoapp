import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

interface SelectableRowProps {
  selected: boolean;
  title: string;
  subtitle?: string;
  /** Ex.: badge "Aprovação na hora" (PIX) — fiel a `cliente-13-pagamento.png`. */
  highlight?: string;
  leading?: ReactNode;
  onPress: () => void;
}

/**
 * [IDS] CREATE — card com rádio à direita, fiel aos cards de seleção de
 * `cliente-05-escolha-ponto-retirada.png` (hub) e `cliente-13-pagamento.png`
 * (PIX/cartão): borda + fundo verde-claro quando selecionado, círculo com
 * check à direita. Reaproveitado por EscolhaRetirada e Pagamento (Story
 * 0.6) — evita duplicar o mesmo card 2x.
 */
export function SelectableRow({ selected, title, subtitle, highlight, leading, onPress }: SelectableRowProps) {
  return (
    <Pressable style={[styles.row, selected && styles.rowSelected]} onPress={onPress}>
      {leading}
      <View style={styles.info}>
        <Text style={styles.title}>{title}</Text>
        {!!highlight && <Text style={styles.highlight}>{highlight}</Text>}
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <Text style={styles.radioCheck}>✓</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
    padding: spacing['4'],
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: lightColors.border.default,
    backgroundColor: lightColors.bg.primary,
    marginBottom: spacing['3'],
  },
  rowSelected: {
    borderColor: lightColors.accent.brand,
    backgroundColor: lightColors.accent.successBgAlt,
  },
  info: {
    flex: 1,
  },
  title: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
  },
  highlight: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.successFg,
    marginTop: 2,
  },
  subtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
    marginTop: 2,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: lightColors.border.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    backgroundColor: lightColors.accent.successFg,
    borderColor: lightColors.accent.successFg,
  },
  radioCheck: {
    color: lightColors.bg.primary,
    fontSize: typography.sizes.xs.fontSize,
    fontFamily: 'HankenGrotesk-Bold',
  },
});
