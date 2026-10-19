export const FORM_SCROLL_PROPS = {
  keyboardShouldPersistTaps: 'handled',
  keyboardDismissMode: 'on-drag',
} as const;

export interface CheckboxAccessibilityProps {
  accessibilityRole: 'checkbox';
  accessibilityLabel: string;
  accessibilityState: { checked: boolean };
  accessibilityHint?: string;
}

export function getKeyboardAvoidingBehavior(platform: string): 'padding' | 'height' {
  return platform === 'ios' ? 'padding' : 'height';
}

export function getCheckboxAccessibilityProps(
  label: string,
  checked: boolean,
  error?: string,
): CheckboxAccessibilityProps {
  return {
    accessibilityRole: 'checkbox',
    accessibilityLabel: label,
    accessibilityState: { checked },
    ...(error ? { accessibilityHint: error } : {}),
  };
}
