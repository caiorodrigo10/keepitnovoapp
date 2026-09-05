import { describe, expect, it } from 'vitest';

import {
  getButtonAccessibility,
  getFavoriteButtonAccessibility,
  getSelectionAccessibility,
} from './interactionAccessibility';

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

  it('expõe label e estados completos ao favoritar e desfavoritar', () => {
    expect(getFavoriteButtonAccessibility('loja', 'Mercado Central', false, false, false)).toEqual({
      accessibilityRole: 'button',
      accessibilityLabel: 'Favoritar loja Mercado Central',
      accessibilityState: { selected: false, disabled: false, busy: false },
    });
    expect(getFavoriteButtonAccessibility('hub', 'Praça Norte', true, true, false)).toEqual({
      accessibilityRole: 'button',
      accessibilityLabel: 'Desfavoritar hub Praça Norte',
      accessibilityState: { selected: true, disabled: true, busy: false },
    });
  });
});
