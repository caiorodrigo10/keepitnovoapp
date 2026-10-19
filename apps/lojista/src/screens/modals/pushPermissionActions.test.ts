import { describe, expect, it, vi } from 'vitest';

import { acceptPushPermission, declinePushPermission } from './pushPermissionActions';

describe('ações do modal de permissão push', () => {
  it('fecha o modal tanto ao permitir quanto ao adiar a decisão', () => {
    const navigation = { goBack: vi.fn() };

    acceptPushPermission(navigation);
    declinePushPermission(navigation);

    expect(navigation.goBack).toHaveBeenCalledTimes(2);
  });
});
