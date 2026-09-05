import { useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { lightColors, radii, spacing } from '@keepit/ui-tokens';

import { useFavorites } from '../../context/FavoritesContext';

interface FavoriteButtonProps {
  kind: 'hub' | 'store';
  resourceId: string;
  resourceName: string;
  disabled?: boolean;
}

export function FavoriteButton({
  kind,
  resourceId,
  resourceName,
  disabled = false,
}: FavoriteButtonProps) {
  const {
    favoriteHubIds,
    favoriteStoreIds,
    toggleHub,
    toggleStore,
  } = useFavorites();
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const selected = kind === 'hub'
    ? favoriteHubIds.has(resourceId)
    : favoriteStoreIds.has(resourceId);
  const resourceLabel = kind === 'hub' ? 'hub' : 'loja';
  const accessibilityLabel = `${selected ? 'Desfavoritar' : 'Favoritar'} ${resourceLabel} ${resourceName}`;
  const interactionDisabled = disabled || pending;

  async function handlePress(event: GestureResponderEvent) {
    event.stopPropagation();
    if (interactionDisabled || pendingRef.current) return;

    pendingRef.current = true;
    setPending(true);
    const result = await (kind === 'hub' ? toggleHub(resourceId) : toggleStore(resourceId));
    pendingRef.current = false;
    setPending(false);

    if (result.status === 'reverted') {
      Alert.alert(result.error.message);
    }
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: interactionDisabled }}
      disabled={interactionDisabled}
      hitSlop={8}
      onPress={(event) => void handlePress(event)}
      style={({ pressed }) => [
        styles.button,
        selected && styles.buttonSelected,
        interactionDisabled && styles.buttonDisabled,
        pressed && !interactionDisabled && styles.buttonPressed,
      ]}
    >
      <Ionicons
        name={selected ? 'heart' : 'heart-outline'}
        size={20}
        color={selected ? lightColors.accent.warning : lightColors.text.secondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: lightColors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['1'],
  },
  buttonSelected: {
    backgroundColor: lightColors.bg.primary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.7,
  },
});
