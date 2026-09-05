import { describe, expect, it } from 'vitest';

import { getButtonAccessibility, getSelectionAccessibility } from './interactionAccessibility';

describe('interactionAccessibility', () => {
  it('expõe botão ocupado como ocupado e desabilitado', () => {
    expect(getButtonAccessibility('Confirmar', true, true)).toEqual({
      accessibilityRole: 'button',
      accessibilityLabel: 'Confirmar',
      accessibilityState: { disabled: true, busy: true },
    });
  });

  it('expõe seleção de tab e radio com o estado correto', () => {
    expect(getSelectionAccessibility('tab', 'Farmácia', true)).toEqual({
      accessibilityRole: 'tab',
      accessibilityLabel: 'Farmácia',
      accessibilityState: { selected: true },
    });
    expect(getSelectionAccessibility('radio', 'PIX, Aprovação na hora', false)).toEqual({
      accessibilityRole: 'radio',
      accessibilityLabel: 'PIX, Aprovação na hora',
      accessibilityState: { checked: false },
    });
  });
});
