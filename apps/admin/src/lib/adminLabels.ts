import type { EstabelecimentoFalhaTipo, PedidoStatus, ReembolsoMotivo } from '@keepit/core-data';

/**
 * Traduções de enums do schema para exibição — Story 0.13 (Tasks 2, 4, 9),
 * tipos religados para `@keepit/core-data` (Story 1.10, Task 4) — antes
 * importados de `../mock/adminOpsTypes` (removido nesta story). Nenhum valor
 * numérico/financeiro aqui, só rótulos de texto; os valores em si (R$, min,
 * dias) sempre vêm do dado (pedido/reembolso), nunca hardcoded.
 */
export const REEMBOLSO_MOTIVO_LABEL: Record<ReembolsoMotivo, string> = {
  timeout_aceite: 'Timeout de aceite',
  recusa_lojista: 'Recusa do lojista',
  cancelamento_cliente_pre_aceite: 'Cancelamento do cliente (pré-aceite)',
  cancelamento_cliente_pos_aceite: 'Cancelamento do cliente (pós-aceite)',
  cancelamento_atraso: 'Cancelamento por atraso',
  nao_retirado_cliente: 'Cliente não retirou',
  nao_entregue_lojista: 'Lojista não entregou',
  chargeback: 'Chargeback',
  cancelamento_admin: 'Cancelamento pelo admin',
};

export const PEDIDO_STATUS_LABEL: Record<PedidoStatus, string> = {
  aguardando_pagamento: 'Aguardando pagamento',
  aguardando_aceite: 'Aguardando aceite',
  aceito: 'Aceito',
  em_preparo: 'Em preparo',
  saindo_hub: 'Saindo do hub',
  no_hub: 'No hub',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
  cancelado_timeout: 'Cancelado (timeout)',
  cancelado_atraso: 'Cancelado (atraso)',
  cancelado_admin: 'Cancelado (admin)',
  recusado: 'Recusado',
  nao_retirado: 'Não retirado',
  nao_entregue_lojista: 'Não entregue (lojista)',
  estornado_chargeback: 'Estornado (chargeback)',
};

export const ESTABELECIMENTO_FALHA_TIPO_LABEL: Record<EstabelecimentoFalhaTipo, string> = {
  lojista_nao_apareceu: 'Lojista não apareceu',
  atraso_grave: 'Atraso grave',
  chargeback: 'Chargeback',
  reclamacao_admin: 'Reclamação (admin)',
};

export function formatReais(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
