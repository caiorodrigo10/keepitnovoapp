import { describe, expect, it, vi } from 'vitest';

import {
  consumePasswordRecoveryUrl,
  createPasswordRecoveryLinking,
  PASSWORD_RECOVERY_CALLBACK,
} from './passwordRecoveryLinking';

/**
 * Espera um macrotask (em vez de contar `Promise.resolve()`) — robusto ao
 * número exato de microtasks encadeados dentro de `consumePasswordRecoveryUrl`
 * (um `await` interno + o `.then` externo do `subscribe`).
 */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Story 2.7 (AC3, AC5): garante que o token/URL bruta do callback nunca
 * chega à camada de navegação — só a rota segura `?recovery=ready|invalid`
 * sai deste módulo — e que `RecuperarSenha` é a única rota configurada
 * para `auth/reset`.
 */
describe('passwordRecoveryLinking (Story 2.7)', () => {
  it('entrega a URL bruta somente ao AuthPort e retorna rota sem token (AC5)', async () => {
    const establishPasswordRecoverySession = vi.fn(async () => undefined);
    const rawUrl = `${PASSWORD_RECOVERY_CALLBACK}#access_token=secret&refresh_token=also-secret&type=recovery`;

    await expect(
      consumePasswordRecoveryUrl(rawUrl, { establishPasswordRecoverySession }),
    ).resolves.toBe(`${PASSWORD_RECOVERY_CALLBACK}?recovery=ready`);
    expect(establishPasswordRecoverySession).toHaveBeenCalledWith(rawUrl);
    expect(establishPasswordRecoverySession).toHaveBeenCalledTimes(1);
  });

  it('encaminha callback inválido/expirado para o estado recuperável, sem dados sensíveis (AC3)', async () => {
    const establishPasswordRecoverySession = vi.fn(async () => {
      throw new Error('provider detail');
    });

    const result = await consumePasswordRecoveryUrl(
      `${PASSWORD_RECOVERY_CALLBACK}#error=expired&description=secret`,
      { establishPasswordRecoverySession },
    );

    expect(result).toBe(`${PASSWORD_RECOVERY_CALLBACK}?recovery=invalid`);
    expect(result).not.toContain('secret');
  });

  it('URL nula (sem link) resolve null e não chama o AuthPort', async () => {
    const establishPasswordRecoverySession = vi.fn();
    await expect(consumePasswordRecoveryUrl(null, { establishPasswordRecoverySession })).resolves.toBeNull();
    expect(establishPasswordRecoverySession).not.toHaveBeenCalled();
  });

  it('ignora URL de outra rota (não é o callback canônico) e não chama o AuthPort', async () => {
    const establishPasswordRecoverySession = vi.fn();
    await expect(
      consumePasswordRecoveryUrl('com.keepithub.cliente://auth/other', { establishPasswordRecoverySession }),
    ).resolves.toBeNull();
    expect(establishPasswordRecoverySession).not.toHaveBeenCalled();
  });

  it('configura RecuperarSenha como única rota receptora de auth/reset (decisão de arquitetura 0.1.3)', () => {
    const linking = createPasswordRecoveryLinking(
      { establishPasswordRecoverySession: vi.fn(async () => undefined) },
      { getInitialURL: async () => null, addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
    );

    expect(linking.prefixes).toEqual(['com.keepithub.cliente://']);
    expect(linking.config).toEqual({
      screens: { Auth: { screens: { RecuperarSenha: 'auth/reset' } } },
    });
  });

  it('getInitialURL do LinkingOptions delega ao gateway e sanitiza o resultado (app aberto pelo link a frio)', async () => {
    const establishPasswordRecoverySession = vi.fn(async () => undefined);
    const rawUrl = `${PASSWORD_RECOVERY_CALLBACK}#access_token=a&refresh_token=b&type=recovery`;
    const linking = createPasswordRecoveryLinking(
      { establishPasswordRecoverySession },
      { getInitialURL: async () => rawUrl, addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
    );

    await expect(linking.getInitialURL?.()).resolves.toBe(`${PASSWORD_RECOVERY_CALLBACK}?recovery=ready`);
  });

  it('subscribe só notifica o listener quando a URL recebida é o callback de recuperação', async () => {
    const establishPasswordRecoverySession = vi.fn(async () => undefined);
    let urlHandler: ((event: { url: string }) => void) | undefined;
    const addEventListener = vi.fn((_type: 'url', handler: (event: { url: string }) => void) => {
      urlHandler = handler;
      return { remove: vi.fn() };
    });
    const linking = createPasswordRecoveryLinking(
      { establishPasswordRecoverySession },
      { getInitialURL: async () => null, addEventListener },
    );

    const listener = vi.fn();
    const unsubscribe = linking.subscribe?.(listener);
    expect(urlHandler).toBeDefined();

    // Deep link de outra rota do app — não relacionado à recuperação — não deve notificar.
    urlHandler!({ url: 'com.keepithub.cliente://qualquer-outra-rota' });
    await flushMicrotasks();
    expect(listener).not.toHaveBeenCalled();

    urlHandler!({ url: `${PASSWORD_RECOVERY_CALLBACK}#access_token=a&refresh_token=b&type=recovery` });
    await flushMicrotasks();
    expect(listener).toHaveBeenCalledWith(`${PASSWORD_RECOVERY_CALLBACK}?recovery=ready`);

    unsubscribe?.();
  });
});
