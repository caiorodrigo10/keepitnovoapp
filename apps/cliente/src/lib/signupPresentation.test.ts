import { describe, expect, it } from 'vitest';

import { getSignupErrorMessage, getSignupSuccessMessage } from './signupPresentation';

describe('getSignupSuccessMessage', () => {
  it('informa o e-mail que deve ser confirmado quando o cadastro não cria sessão', () => {
    expect(getSignupSuccessMessage('  nova.pessoa@example.com ')).toBe(
      'Enviamos um e-mail de confirmação para nova.pessoa@example.com. Abra o link para ativar sua conta.',
    );
  });
});

describe('getSignupErrorMessage', () => {
  it('traduz a rejeição de senha fraca do provedor', () => {
    expect(getSignupErrorMessage({ message: 'Password should be at least 8 characters.' })).toBe(
      'A senha precisa ter pelo menos 8 caracteres.',
    );
  });

  it('não expõe detalhes técnicos em uma falha de rede', () => {
    expect(getSignupErrorMessage(new Error('fetch failed'))).toBe(
      'Não foi possível criar sua conta agora. Tente novamente em instantes.',
    );
  });
});
