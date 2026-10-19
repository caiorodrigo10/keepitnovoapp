import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import type { CategoriaDiscovery } from '../../lib/discoveryDisplay';
import { getSelectionAccessibility } from '../ui/interactionAccessibility';

interface CategoryChipsProps {
  categorias: CategoriaDiscovery[];
  selected: string;
  onSelect: (categoriaId: string) => void;
}

/**
 * [IDS] CREATE — tabs de filtro fiel a `cliente-11-busca.png`
 * ("Tudo / Farmácia / Roupas / Conv.", chip ativo preto/pill claro).
 */
export function CategoryChips({ categorias, selected, onSelect }: CategoryChipsProps) {
  return (
    <ScrollView
      accessibilityRole="tablist"
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {categorias.map((categoria) => {
        const active = categoria.id === selected;
        return (
          <Pressable
            {...getSelectionAccessibility('tab', categoria.label, active)}
            key={categoria.id}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(categoria.id)}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{categoria.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing['2'],
    paddingVertical: spacing['1'],
  },
  chip: {
    paddingHorizontal: spacing['4'],
    minHeight: spacing['12'],
    borderRadius: radii.full,
    backgroundColor: lightColors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: lightColors.text.primary,
  },
  label: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.secondary,
  },
  labelActive: {
    color: lightColors.bg.primary,
  },
});
