// Dados fictícios do exemplo oficial Asaas. Nunca enviados à rede nestes testes.
// https://docs.asaas.com/docs/cobrancas-via-cartao-de-credito
export const sandboxCard = { holderName: 'Marcelo Almeida', number: '4444444444444444', expiryMonth: '12', expiryYear: '2028', ccv: '123' };
export const sandboxHolder = { name: 'Marcelo Almeida', email: 'sandbox@example.invalid', cpfCnpj: '24971563792', postalCode: '89223005', addressNumber: '277', phone: '4738010919' };

/** Resposta sanitizada sintética: apenas os três campos aceitos pelo contrato. */
export const cardTokenizationResponseFixture = {
  creditCardToken: 'token_ficticio_sanitizado',
  creditCardBrand: 'VISA',
  creditCardNumber: '4242',
};
