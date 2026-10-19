import type { PasswordResetRequestResult } from '@keepit/core-data';

export type PasswordResetConfirmation =
  | {
      title: 'Verifique seu e-mail';
      message: 'Se houver uma conta cadastrada com este e-mail, enviamos um link para redefinir sua senha.';
      showDemoAction: false;
    }
  | {
      title: 'Modo demonstração';
      message: 'Modo demonstração — nenhum e-mail real foi enviado.';
      showDemoAction: true;
    };

interface PasswordRecoveryDemoCallbackActionOptions {
  openUrl(callbackUrl: string): Promise<void>;
  onOpening(): void;
}

export interface PasswordRecoveryDemoCallbackAction {
  open(callbackUrl: string): Promise<'started' | 'ignored'>;
}

/**
 * Guarda one-shot do CTA demo. A trava é adquirida antes de notificar loading
 * ou chamar o sistema operacional e não é reaberta: o callback é consumível
 * uma única vez, e a tela navega para `ready` ou `invalid` depois da abertura.
 */
export function createPasswordRecoveryDemoCallbackAction(
  options: PasswordRecoveryDemoCallbackActionOptions,
): PasswordRecoveryDemoCallbackAction {
  let started = false;

  return {
    async open(callbackUrl) {
      if (started) return 'ignored';

      started = true;
      options.onOpening();
      await options.openUrl(callbackUrl);
      return 'started';
    },
  };
}

/**
 * Resolve a confirmação pela capacidade devolvida pela port. O texto nunca
 * incorpora endereço informado, callback ou detalhes técnicos do provider.
 */
export function resolvePasswordResetConfirmation(
  result: PasswordResetRequestResult,
): PasswordResetConfirmation {
  if (result.delivery === 'demo') {
    return {
      title: 'Modo demonstração',
      message: 'Modo demonstração — nenhum e-mail real foi enviado.',
      showDemoAction: true,
    };
  }

  return {
    title: 'Verifique seu e-mail',
    message: 'Se houver uma conta cadastrada com este e-mail, enviamos um link para redefinir sua senha.',
    showDemoAction: false,
  };
}
