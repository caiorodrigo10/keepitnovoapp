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
