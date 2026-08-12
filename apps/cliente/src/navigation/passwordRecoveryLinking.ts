import type { LinkingOptions } from '@react-navigation/native';

import type { AuthPort } from '@keepit/core-data';

import type { RootStackParamList } from './types';

/**
 * Story 2.7 (AC3, AC5) — decisão de arquitetura 0.1.3: mesma constante do
 * callback canônico usada por `auth.supabase.ts`
 * (`PASSWORD_RECOVERY_REDIRECT_TO`), duplicada aqui como string literal
 * (não importa `packages/core-data` para uma constante) porque este módulo
 * roda antes da navegação — comparar contra o literal exato é suficiente e
 * evita acoplar a UI ao pacote de dados por um valor.
 */
export const PASSWORD_RECOVERY_CALLBACK = 'com.keepithub.cliente://auth/reset';

/** Formato mínimo de `Linking` do React Native — permite injetar um fake nos testes. */
interface LinkingGateway {
  getInitialURL(): Promise<string | null>;
  addEventListener(type: 'url', listener: (event: { url: string }) => void): { remove(): void };
}

/**
 * Story 2.7 (AC3, AC5). Converte a URL bruta do callback (que pode carregar
 * `access_token`/`refresh_token`/`code`) numa URL interna SEM nenhum dado
 * sensível, antes de ela alcançar o estado de navegação/deep-linking do
 * `react-navigation` — que registraria a URL completa (com o token) em
 * `NavigationContainer`'s state, potencialmente visível em devtools/logs.
 * A URL original só é repassada, uma única vez, para
 * `auth.establishPasswordRecoverySession` (dentro da fronteira de dados);
 * nunca é devolvida, logada nem guardada por este módulo.
 *
 * Retorna `null` para qualquer URL que não seja o callback de recuperação
 * (deixa o `react-navigation` tratar normalmente); `?recovery=ready` em
 * sucesso; `?recovery=invalid` em qualquer falha (link ausente, de outra
 * rota simulada, expirado, sem sessão) — sem detalhar a causa ao usuário
 * (ver `RecuperarSenha.tsx`, AC3).
 */
export async function consumePasswordRecoveryUrl(
  url: string | null,
  auth: Pick<AuthPort, 'establishPasswordRecoverySession'>,
): Promise<string | null> {
  if (!url || !isPasswordRecoveryCallback(url)) {
    return null;
  }

  try {
    await auth.establishPasswordRecoverySession(url);
    return `${PASSWORD_RECOVERY_CALLBACK}?recovery=ready`;
  } catch {
    return `${PASSWORD_RECOVERY_CALLBACK}?recovery=invalid`;
  }
}

/**
 * Story 2.7 (AC3) — decisão de arquitetura 0.1.3: `RecuperarSenha` mapeada
 * para `auth/reset` dentro do `AuthStack`. `getInitialURL`/`subscribe`
 * cobrem, respectivamente, o app aberto pelo link a frio e o app já em
 * execução recebendo o link.
 */
export function createPasswordRecoveryLinking(
  auth: Pick<AuthPort, 'establishPasswordRecoverySession'>,
  linking: LinkingGateway,
): LinkingOptions<RootStackParamList> {
  return {
    prefixes: ['com.keepithub.cliente://'],
    config: {
      screens: {
        Auth: {
          screens: {
            RecuperarSenha: 'auth/reset',
          },
        },
      },
    },
    async getInitialURL() {
      return consumePasswordRecoveryUrl(await linking.getInitialURL(), auth);
    },
    subscribe(listener) {
      const subscription = linking.addEventListener('url', ({ url }) => {
        void consumePasswordRecoveryUrl(url, auth).then((safeUrl) => {
          if (safeUrl) {
            listener(safeUrl);
          }
        });
      });
      return () => subscription.remove();
    },
  };
}

function isPasswordRecoveryCallback(value: string): boolean {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}` === PASSWORD_RECOVERY_CALLBACK;
  } catch {
    return false;
  }
}
