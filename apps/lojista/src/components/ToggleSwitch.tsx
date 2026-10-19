import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

import { darkColors, radii } from '@keepit/ui-tokens';

const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 26;
const THUMB_SIZE = 20;
const THUMB_MARGIN = 3;

/**
 * Toggle animado (pill + bolinha) — Story 0.9.
 *
 * [IDS] CREATE: nenhum toggle existia em `apps/lojista` (a Story 0.8 não
 * teve nenhum switch binário). Fiel a `docs/design-refs/lojista-07-catalogo.png`
 * / `lojista-09-horarios.png`: trilho `accent.brand` quando ligado /
 * `bg.muted` quando desligado, bolinha `bg.primary`. Reaproveitado pelo
 * `ProductCard` (pausar/reativar) e por `HorariosDisponibilidade` (loja
 * aberta + linhas de FUNCIONAMENTO).
 */
export interface ToggleSwitchProps {
  value: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
}

export function ToggleSwitch({ value, onValueChange, disabled = false }: ToggleSwitchProps) {
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [value, progress]);

  const trackColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [darkColors.bg.muted, darkColors.accent.brand],
  });
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [THUMB_MARGIN, TRACK_WIDTH - THUMB_SIZE - THUMB_MARGIN],
  });

  return (
    <Pressable
      onPress={() => onValueChange?.(!value)}
      disabled={disabled || !onValueChange}
      hitSlop={6}
    >
      <Animated.View style={[styles.track, { backgroundColor: trackColor, opacity: disabled ? 0.6 : 1 }]}>
        <Animated.View style={[styles.thumb, { backgroundColor: darkColors.bg.primary, transform: [{ translateX }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: radii.full,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radii.full,
  },
});
