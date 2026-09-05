export interface HeaderNavigation {
  canGoBack(): boolean;
  goBack(): void;
}

export interface HeaderControlAccessibility {
  accessibilityRole: 'button';
  accessibilityLabel: string;
  accessibilityState: { disabled?: boolean; selected?: boolean };
}

export function runHeaderBack(navigation: HeaderNavigation, fallback: () => void): void {
  if (navigation.canGoBack()) {
    navigation.goBack();
    return;
  }

  fallback();
}

export function getHeaderControlAccessibility(
  label: string,
  state: { disabled?: boolean; selected?: boolean } = {},
): HeaderControlAccessibility {
  return {
    accessibilityRole: 'button',
    accessibilityLabel: label,
    accessibilityState: state,
  };
}
