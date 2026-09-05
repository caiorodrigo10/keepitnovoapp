import { describe, expect, it } from 'vitest';

import {
  FORM_SCROLL_PROPS,
  getCheckboxAccessibilityProps,
  getKeyboardAvoidingBehavior,
} from './formContracts';

describe('formContracts', () => {
  it('reduz a altura útil no Android e usa padding no iOS', () => {
    expect(getKeyboardAvoidingBehavior('android')).toBe('height');
    expect(getKeyboardAvoidingBehavior('ios')).toBe('padding');
  });

  it('mantém taps tratados e fecha o teclado ao arrastar', () => {
    expect(FORM_SCROLL_PROPS).toEqual({
      keyboardShouldPersistTaps: 'handled',
      keyboardDismissMode: 'on-drag',
    });
  });

  it('expõe label, seleção e erro do checkbox ao leitor de tela', () => {
    expect(
      getCheckboxAccessibilityProps(
        'Aceito os Termos e a Política de Privacidade',
        false,
        'É preciso aceitar os Termos e a Política de Privacidade.',
      ),
    ).toEqual({
      accessibilityRole: 'checkbox',
      accessibilityLabel: 'Aceito os Termos e a Política de Privacidade',
      accessibilityState: { checked: false },
      accessibilityHint: 'É preciso aceitar os Termos e a Política de Privacidade.',
    });

    expect(getCheckboxAccessibilityProps('Solicitar nota fiscal', true)).toEqual({
      accessibilityRole: 'checkbox',
      accessibilityLabel: 'Solicitar nota fiscal',
      accessibilityState: { checked: true },
    });
  });
});
