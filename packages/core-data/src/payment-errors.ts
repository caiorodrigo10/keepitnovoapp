export type PaymentActionErrorCode = 'PAGAMENTO_RECUSADO' | 'CARTAO_TOKEN_INVALIDO' | 'PAGAMENTO_RECONCILIACAO' | 'CARTAO_INDISPONIVEL' | 'CARD_TOKENIZATION_DISABLED';

const messages: Record<PaymentActionErrorCode, string> = {
  PAGAMENTO_RECUSADO: 'Cartão recusado. Escolha outro cartão ou pague com Pix.',
  CARTAO_TOKEN_INVALIDO: 'Este cartão não está mais disponível e foi removido. Adicione-o novamente ou escolha outra forma de pagamento.',
  PAGAMENTO_RECONCILIACAO: 'Aguarde a conciliação antes de tentar pagar novamente.',
  CARTAO_INDISPONIVEL: 'Este cartão não está disponível. Escolha outra forma de pagamento.',
  CARD_TOKENIZATION_DISABLED: 'Cartões salvos estão temporariamente indisponíveis. Digite os dados do cartão sem salvar ou use Pix.',
};

/** Erro público do fluxo de cartão: código permitido e mensagem local, sem detalhes do gateway. */
export class PaymentActionError extends Error {
  readonly code: PaymentActionErrorCode;

  constructor(code: PaymentActionErrorCode) {
    super(messages[code]);
    this.name = 'PaymentActionError';
    this.code = code;
  }
}

export function isPaymentActionErrorCode(value: unknown): value is PaymentActionErrorCode {
  return typeof value === 'string' && value in messages;
}
