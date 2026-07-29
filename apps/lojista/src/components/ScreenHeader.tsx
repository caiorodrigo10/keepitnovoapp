import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

/**
 * Header com seta de voltar + título (+ slot opcional à direita) — Story 0.9.
 *
 * [IDS] CREATE: nenhum header com seta de voltar existia em `apps/lojista`
 * (as telas da Story 0.8 usam apenas título, sem navegação de volta — ver
 * `PerfilPublico.tsx`/`Configuracoes.tsx`). Painéis P7/P9 do protótipo
 * (Catálogo/Horários) exigem a seta "‹" fiel ao design, reaproveitável pelas
 * 4 telas desta story (Task 8).
 *
 * [IDS] ADAPT — seta trocada de glifo `‹` por `Ionicons chevron-back`
 * (débito de fidelidade visual pós-Stories 0.8-0.11).
 */
export interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  rightSlot?: ReactNode;
}

export function ScreenHeader({ title, onBack, rightSlot }: ScreenHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {onBack ? (
          <Pressable onPress={onBack} style={styles.backButton} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={darkColors.text.primary} />
          </Pressable>
        ) : null}
        <Text style={[styles.title, { color: darkColors.text.primary }]}>{title}</Text>
      </View>
      {rightSlot ?? null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
    lineHeight: typography.sizes.xl.lineHeight,
  },
});
