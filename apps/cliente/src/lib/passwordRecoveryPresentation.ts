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
