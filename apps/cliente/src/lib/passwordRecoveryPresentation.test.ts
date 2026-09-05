import { describe, expect, it } from 'vitest';

import { resolvePasswordResetConfirmation } from './passwordRecoveryPresentation';

describe('resolvePasswordResetConfirmation', () => {
  it('mantém confirmação neutra e não oferece callback quando a capacidade entrega e-mail', () => {
    const confirmation = resolvePasswordResetConfirmation({ delivery: 'email' });

    expect(confirmation).toEqual({
      title: 'Verifique seu e-mail',
      message: 'Se houver uma conta cadastrada com este e-mail, enviamos um link para redefinir sua senha.',
      showDemoAction: false,
    });
  });

  it('explica o modo demonstração e oferece o callback quando essa capacidade está presente', () => {
    const confirmation = resolvePasswordResetConfirmation({
      delivery: 'demo',
      callbackUrl: 'com.keepithub.cliente://auth/reset?requestId=mock-1',
    });

    expect(confirmation).toEqual({
      title: 'Modo demonstração',
      message: 'Modo demonstração — nenhum e-mail real foi enviado.',
      showDemoAction: true,
    });
  });

  it.each([
    ['e-mail', 'cliente-secreto@example.com'],
    ['callback', 'com.keepithub.cliente://auth/reset?requestId=mock-secret'],
    ['erro técnico', 'AuthApiError: provider detail'],
  ])('não interpola %s presente no callback na mensagem', (_label, sensitiveValue) => {
    const callbackUrl = `com.keepithub.cliente://auth/reset?requestId=${encodeURIComponent(sensitiveValue)}`;

    const confirmation = resolvePasswordResetConfirmation({ delivery: 'demo', callbackUrl });

    expect(confirmation.message).not.toContain(sensitiveValue);
    expect(confirmation.message).not.toContain(callbackUrl);
  });
});
