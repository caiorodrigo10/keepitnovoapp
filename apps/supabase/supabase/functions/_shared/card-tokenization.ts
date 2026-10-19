export function cardTokenizationDisabled() {
  return {
    status: 503,
    body: {
      error: {
        code: 'CARD_TOKENIZATION_DISABLED',
        message: 'Cartões salvos estão temporariamente indisponíveis. Digite os dados do cartão sem salvar ou use Pix.',
      },
    },
  };
}
