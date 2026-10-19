import { describe, expect, it } from 'vitest';

import { classifyCardGatewayFailure, parseCardTokenMetadata } from './card-contract';

describe('parseCardTokenMetadata', () => {
  it('extrai exclusivamente token, bandeira e os quatro últimos dígitos comprovados', () => {
    const result = parseCardTokenMetadata({
      creditCardToken: 'token_ficticio_sanitizado',
      creditCardBrand: 'VISA',
      creditCardNumber: '4242',
      creditCardHolderInfo: { name: 'Não deve sair do parser' },
      extra: 'descartado',
    });

    expect(result).toEqual({ token: 'token_ficticio_sanitizado', bandeira: 'VISA', ultimo4: '4242' });
  });

  it('rejeita metadados incompletos ou número que não seja exatamente os quatro últimos dígitos', () => {
    expect(parseCardTokenMetadata({ creditCardToken: 'token', creditCardBrand: 'VISA', creditCardNumber: '123456' })).toBeNull();
    expect(parseCardTokenMetadata({ creditCardToken: '', creditCardBrand: 'VISA', creditCardNumber: '4242' })).toBeNull();
  });
});

describe('classifyCardGatewayFailure', () => {
  it('classifica somente a recusa de cartão documentada, sem inferir token inválido', () => {
    expect(classifyCardGatewayFailure({ errors: [{ code: 'invalid_creditCard', description: 'Transação não autorizada.' }] }, 400))
      .toEqual({ categoria: 'recusado', code: 'invalid_creditCard' });
  });

  it.each([0, 408, 429, 500, 503])('mantém %s como incerto para reconciliação', (status) => {
    expect(classifyCardGatewayFailure({ errors: [{ code: 'invalid_object', description: 'Dados inválidos.' }] }, status))
      .toEqual({ categoria: 'incerto' });
  });

  it('não transforma erro genérico ou de configuração em token inválido', () => {
    expect(classifyCardGatewayFailure({ errors: [{ code: 'invalid_object', description: 'Dados inválidos.' }] }, 400))
      .toEqual({ categoria: 'incerto' });
    expect(classifyCardGatewayFailure({ errors: [{ code: 'invalid_api_key', description: 'Credencial inválida.' }] }, 401))
      .toEqual({ categoria: 'indisponivel', code: 'invalid_api_key' });
  });
});
