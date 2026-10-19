/** Mensagem exibida enquanto o Supabase aguarda a confirmação do e-mail. */
export function getSignupSuccessMessage(email: string): string {
  return `Enviamos um e-mail de confirmação para ${email.trim()}. Abra o link para ativar sua conta.`;
}

const GENERIC_SIGNUP_ERROR = 'Não foi possível criar sua conta agora. Tente novamente em instantes.';

/** Traduz apenas erros de validação conhecidos; detalhes de rede ficam privados. */
export function getSignupErrorMessage(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
      ? error.message
      : '';
  const normalized = message.toLowerCase();

  if (normalized.includes('password') && (normalized.includes('least') || normalized.includes('weak'))) {
    return 'A senha precisa ter pelo menos 8 caracteres.';
  }

  return GENERIC_SIGNUP_ERROR;
}
