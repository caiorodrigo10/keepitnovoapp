export interface ButtonAccessibility {
  accessibilityRole: 'button';
  accessibilityLabel: string;
  accessibilityState: { disabled: boolean; busy: boolean };
}

export interface SelectionAccessibility {
  accessibilityRole: 'tab' | 'radio';
  accessibilityLabel: string;
  accessibilityState: { selected: boolean } | { checked: boolean };
}

export interface FavoriteButtonAccessibility {
  accessibilityRole: 'button';
  accessibilityLabel: string;
  accessibilityState: { selected: boolean; disabled: boolean; busy: boolean };
}

export function getButtonAccessibility(
  label: string,
  disabled: boolean,
  busy: boolean,
): ButtonAccessibility {
  return {
    accessibilityRole: 'button',
    accessibilityLabel: label,
    accessibilityState: { disabled, busy },
  };
}

export function getSelectionAccessibility(
  role: 'tab' | 'radio',
  label: string,
  selected: boolean,
): SelectionAccessibility {
  return {
    accessibilityRole: role,
    accessibilityLabel: label,
    accessibilityState: role === 'tab' ? { selected } : { checked: selected },
  };
}

export function getFavoriteButtonAccessibility(
  resourceLabel: 'hub' | 'loja',
  resourceName: string,
  selected: boolean,
  disabled: boolean,
  busy: boolean,
): FavoriteButtonAccessibility {
  return {
    accessibilityRole: 'button',
    accessibilityLabel: `${selected ? 'Desfavoritar' : 'Favoritar'} ${resourceLabel} ${resourceName}`,
    accessibilityState: { selected, disabled, busy },
  };
}
