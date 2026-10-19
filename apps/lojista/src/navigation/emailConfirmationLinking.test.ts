import { expect, it } from 'vitest';

it('encaminha o callback de confirmação ao Login sem expor o código PKCE', async () => {
  const { createEmailConfirmationLinking, EMAIL_CONFIRMATION_CALLBACK } = await import('./emailConfirmationLinking');
  const linking = createEmailConfirmationLinking({
    getInitialURL: async () => `${EMAIL_CONFIRMATION_CALLBACK}?code=pkce-secret`,
    addEventListener: () => ({ remove() {} }),
  });

  expect(linking.prefixes).toEqual(['com.keepithub.lojista://']);
  expect(linking.config).toEqual({ screens: { Auth: { screens: { Login: 'auth/callback' } } } });
  await expect(linking.getInitialURL?.()).resolves.toBe(
    `${EMAIL_CONFIRMATION_CALLBACK}?toast=E-mail%20confirmado%2C%20fa%C3%A7a%20login`,
  );
});

it('não navega para o Login quando já existe uma sessão ativa', async () => {
  const { createEmailConfirmationLinking, EMAIL_CONFIRMATION_CALLBACK } = await import('./emailConfirmationLinking');
  const linking = createEmailConfirmationLinking(
    {
      getInitialURL: async () => `${EMAIL_CONFIRMATION_CALLBACK}?code=pkce-secret`,
      addEventListener: () => ({ remove() {} }),
    },
    async () => true,
  );

  await expect(linking.getInitialURL?.()).resolves.toBeNull();
});
