/** Antes do aceite a decisão é imediata; depois a solicitação vai ao Admin. */
export type CancelamentoFase = 'antes_aceite' | 'em_analise';

export function cancelamentoFaseFromStatus(
  status: 'aguardando_pagamento' | 'aguardando_aceite' | 'aceito' | 'em_preparo' | 'saindo_hub' | 'no_hub',
): CancelamentoFase {
  if (status === 'aguardando_pagamento' || status === 'aguardando_aceite') {
    return 'antes_aceite';
  }
  return 'em_analise';
}
