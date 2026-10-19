import type { LinkingOptions } from '@react-navigation/native';

import type { RootStackParamList } from './types';

export const EMAIL_CONFIRMATION_CALLBACK = 'com.keepithub.lojista://auth/callback';
const EMAIL_CONFIRMATION_TOAST = 'E-mail confirmado, faça login';
const SAFE_EMAIL_CONFIRMATION_URL = `${EMAIL_CONFIRMATION_CALLBACK}?toast=${encodeURIComponent(EMAIL_CONFIRMATION_TOAST)}`;

interface LinkingGateway {
  getInitialURL(): Promise<string | null>;
  addEventListener(type: 'url', listener: (event: { url: string }) => void): { remove(): void };
}

type HasActiveSession = () => Promise<boolean>;

export function createEmailConfirmationLinking(
  linking: LinkingGateway,
  hasActiveSession: HasActiveSession = async () => false,
): LinkingOptions<RootStackParamList> {
  return {
    prefixes: ['com.keepithub.lojista://'],
    config: { screens: { Auth: { screens: { Login: 'auth/callback' } } } },
    async getInitialURL() {
      return consumeEmailConfirmationUrl(await linking.getInitialURL(), hasActiveSession);
    },
    subscribe(listener) {
      const subscription = linking.addEventListener('url', ({ url }) => {
        void consumeEmailConfirmationUrl(url, hasActiveSession).then((safeUrl) => {
          if (safeUrl) listener(safeUrl);
        });
      });
      return () => subscription.remove();
    },
  };
}

async function consumeEmailConfirmationUrl(url: string | null, hasActiveSession: HasActiveSession): Promise<string | null> {
  if (!url || !isEmailConfirmationCallback(url)) return null;

  const parsed = new URL(url);
  if (await hasActiveSession()) return null;
  return parsed.searchParams.has('code') && !parsed.searchParams.has('error')
    ? SAFE_EMAIL_CONFIRMATION_URL
    : null;
}

function isEmailConfirmationCallback(value: string): boolean {
  try {
    const url = new URL(value);
    return !url.username && !url.password && `${url.protocol}//${url.host}${url.pathname}` === EMAIL_CONFIRMATION_CALLBACK;
  } catch {
    return false;
  }
}
