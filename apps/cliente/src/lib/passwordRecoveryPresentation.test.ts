import { describe, expect, it } from 'vitest';

import {
  createPasswordRecoveryDemoCallbackAction,
  resolvePasswordResetConfirmation,
} from './passwordRecoveryPresentation';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

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

describe('createPasswordRecoveryDemoCallbackAction', () => {
  it('ignora uma segunda abertura depois que o callback de uso único começou', async () => {
    const firstOpenGate = deferred<void>();
    const openedUrls: string[] = [];
    let openAttempt = 0;
    const action = createPasswordRecoveryDemoCallbackAction({
      async openUrl(url) {
        openedUrls.push(url);
        openAttempt += 1;
        if (openAttempt === 1) await firstOpenGate.promise;
      },
      onOpening: () => undefined,
    });
    const callbackUrl = 'com.keepithub.cliente://auth/reset?requestId=recovery-single-use';

    const firstOpen = action.open(callbackUrl);
    const duplicateOpen = action.open(callbackUrl);

    await expect(duplicateOpen).resolves.toBe('ignored');
    expect(openedUrls).toEqual([callbackUrl]);

    firstOpenGate.resolve(undefined);
    await expect(firstOpen).resolves.toBe('started');

    await expect(action.open(callbackUrl)).resolves.toBe('ignored');
    expect(openedUrls).toEqual([callbackUrl]);
  });

  it('marca loading antes de iniciar a abertura do callback', async () => {
    const events: string[] = [];
    const action = createPasswordRecoveryDemoCallbackAction({
      async openUrl() {
        events.push('open');
      },
      onOpening() {
        events.push('loading');
      },
    });

    await action.open('com.keepithub.cliente://auth/reset?requestId=recovery-loading');

    expect(events).toEqual(['loading', 'open']);
  });
});
