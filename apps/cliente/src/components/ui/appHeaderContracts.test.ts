import { describe, expect, it, vi } from 'vitest';

import type { AppHeaderProps } from './AppHeader';
import { getHeaderControlAccessibility, runHeaderBack } from './appHeaderContracts';

describe('appHeaderContracts', () => {
  it('volta pelo histórico sem acionar fallback', () => {
    const navigation = { canGoBack: vi.fn(() => true), goBack: vi.fn() };
    const fallback = vi.fn();

    runHeaderBack(navigation, fallback);

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('usa o fallback quando não há histórico', () => {
    const navigation = { canGoBack: vi.fn(() => false), goBack: vi.fn() };
    const fallback = vi.fn();

    runHeaderBack(navigation, fallback);

    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('expõe label e estado de controles laterais', () => {
    expect(getHeaderControlAccessibility('Voltar')).toEqual({
      accessibilityRole: 'button',
      accessibilityLabel: 'Voltar',
      accessibilityState: {},
    });
    expect(
      getHeaderControlAccessibility('Favoritar produto', { selected: true, disabled: false }),
    ).toEqual({
      accessibilityRole: 'button',
      accessibilityLabel: 'Favoritar produto',
      accessibilityState: { selected: true, disabled: false },
    });
  });

  it('tipa título, subtítulo, badge e ação lateral como variantes combináveis', () => {
    const onPress = vi.fn();
    const variants = [
      { title: 'Pedidos' },
      { title: 'Pedido', subtitle: 'Retirada no Hub Centro' },
      { title: 'Loja', badge: { label: 'Aberta', tone: 'success' } },
      {
        title: 'Produto',
        action: { icon: 'heart-outline', label: 'Favoritar produto', onPress },
      },
    ] satisfies AppHeaderProps[];

    expect(variants.map(({ title }) => title)).toEqual(['Pedidos', 'Pedido', 'Loja', 'Produto']);
  });
});
