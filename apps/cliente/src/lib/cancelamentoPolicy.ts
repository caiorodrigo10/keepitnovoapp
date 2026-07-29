import { businessConfig } from '@keepit/config';

/**
 * Percentuais de reembolso por fase de cancelamento — promovidos para
 * `businessConfig` (Story 1.10, Task 9). Antes hard-codados localmente
 * (Story 0.7) enquanto `packages/config` não expunha a matriz completa da
 * Rodada 2 de `docs/PERGUNTAS_REGRAS_NEGOCIO.md`; agora este objeto apenas
 * reexporta/remapeia `businessConfig`, nunca fixando os números aqui.
 * [Source: docs/PERGUNTAS_REGRAS_NEGOCIO.md#Rodada 2 — Cancelamento e exceções]
 */
export const cancelamentoPolicy = {
  /** Cliente cancela antes do aceite do lojista → reembolso integral. */
  antesAceitePercent: businessConfig.cancelamentoAntesAceitePercent,
  /** Cliente cancela após aceite, antes de "Saindo para o hub" → % ao cliente / % retido pelo lojista. */
  aposAceitePercentCliente: businessConfig.cancelamentoAposAceitePercentCliente,
  aposAceitePercentLojista: businessConfig.cancelamentoAposAceitePercentLojista,
  /** Lojista não aparece no hub → reembolso integral + registro de falha de qualidade do lojista. */
  lojistaNaoVeioPercent: businessConfig.lojistaNaoVeioPercent,
} as const;

export type CancelamentoFase = 'antes_aceite' | 'apos_aceite_antes_saida' | 'bloqueado_apos_saida';

/**
 * Deriva a fase de cancelamento a partir do status atual do pedido — usada
 * por `CancelarPedido` (Task 6) para decidir copy/percentual/bloqueio. Fica
 * local (não migra para `businessConfig`): é lógica de derivação de UI a
 * partir do status, não um valor de regra de negócio.
 * [Source: docs/stories/0.7.story.md#Matriz de cancelamento e reembolso]
 */
export function cancelamentoFaseFromStatus(
  status: 'aguardando_pagamento' | 'aguardando_aceite' | 'aceito' | 'em_preparo' | 'saindo_hub' | 'no_hub',
): CancelamentoFase {
  if (status === 'aguardando_pagamento' || status === 'aguardando_aceite') {
    return 'antes_aceite';
  }
  if (status === 'aceito' || status === 'em_preparo') {
    return 'apos_aceite_antes_saida';
  }
  return 'bloqueado_apos_saida';
}
