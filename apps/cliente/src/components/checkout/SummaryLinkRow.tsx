import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

interface SummaryLinkRowProps {
  icon?: ReactNode;
  label?: string;
  title: string;
  subtitle?: string;
  linkLabel?: string;
  onPress?: () => void;
}

/**
 * [IDS] CREATE — linha "RETIRAR EM / Hub Centro / Rua das Flores, 120 ·
 * Alterar" e "Cartão •••• 4242 · Alterar" do resumo do Checkout, fiel a
 * `cliente-04-carrinho.png`. Componente único reaproveitado pelas 2 linhas
 * (hub + forma de pagamento) da tela Checkout.
 */
export function SummaryLinkRow({ icon, label, title, subtitle, linkLabel = 'Alterar', onPress }: SummaryLinkRowProps) {
  return (
    <View style={styles.row}>
      {icon}
      <View style={styles.info}>
        {!!label && <Text style={styles.labelText}>{label}</Text>}
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {!!onPress && (
        <Pressable onPress={onPress} hitSlop={8}>
          <Text style={styles.link}>{linkLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
    padding: spacing['4'],
    borderRadius: radii.card,
    backgroundColor: lightColors.bg.surface,
    marginBottom: spacing['3'],
  },
  info: {
    flex: 1,
  },
  labelText: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.xs.fontSize,
    color: lightColors.text.tertiary,
    marginBottom: 2,
  },
  title: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
  },
  subtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
    marginTop: 2,
  },
  link: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.successFg,
  },
});
