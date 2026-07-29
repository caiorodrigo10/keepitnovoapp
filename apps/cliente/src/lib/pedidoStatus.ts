import type { PedidoStatus } from '@keepit/core-data';

/**
 * [IDS] CREATE — nenhum util de tradução de `PedidoStatus` existia em
 * `apps/cliente` antes desta story (Story 0.7). Centraliza aqui o mapeamento
 * "enum real do banco → rótulo em português" citado nos Dev Notes da story
 * ("o mock deve usar os valores do enum real; a UI traduz para os rótulos
 * amigáveis apenas na exibição") para não duplicar o dicionário em
 * `MeusPedidos`, `ModalConfirmarPin` e `Recibo`.
 * [Source: docs/stories/0.7.story.md#Máquina de estados do pedido]
 */

/** Rótulo amigável exibido em badges/telas — nunca o valor cru do enum. */
export const PEDIDO_STATUS_LABEL: Record<PedidoStatus, string> = {
  aguardando_pagamento: 'Aguardando pagamento',
  aguardando_aceite: 'Aguardando aceite',
  aceito: 'Aceito',
  em_preparo: 'Em preparo',
  saindo_hub: 'Saindo para o hub',
  no_hub: 'Pronto no hub',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
  cancelado_timeout: 'Cancelado (tempo esgotado)',
  cancelado_atraso: 'Cancelado (atraso)',
  cancelado_admin: 'Cancelado pela Keepit',
  recusado: 'Recusado pela loja',
  nao_retirado: 'Não retirado',
  nao_entregue_lojista: 'Lojista não veio',
  estornado_chargeback: 'Estornado',
};

/**
 * Status "em andamento" (AC1: aba "Em andamento" de Meus Pedidos) — do
 * `Novo` (mock: `aguardando_pagamento`/`aguardando_aceite`) até `No hub`,
 * conforme a máquina de estados feliz da story. Qualquer status fora deste
 * conjunto é considerado terminal → aba "Concluídos"/histórico.
 * [Source: docs/stories/0.7.story.md#Task 5]
 */
const EM_ANDAMENTO_STATUSES: ReadonlySet<PedidoStatus> = new Set([
  'aguardando_pagamento',
  'aguardando_aceite',
  'aceito',
  'em_preparo',
  'saindo_hub',
  'no_hub',
]);

export function isPedidoEmAndamento(status: PedidoStatus): boolean {
  return EM_ANDAMENTO_STATUSES.has(status);
}

export function isPedidoConcluido(status: PedidoStatus): boolean {
  return !EM_ANDAMENTO_STATUSES.has(status);
}

/** `true` para qualquer ramo de cancelamento/recusa/não-retirado (histórico "com problema"). */
export function isPedidoCancelado(status: PedidoStatus): boolean {
  return (
    status === 'cancelado' ||
    status === 'cancelado_timeout' ||
    status === 'cancelado_atraso' ||
    status === 'cancelado_admin' ||
    status === 'recusado' ||
    status === 'nao_retirado' ||
    status === 'nao_entregue_lojista' ||
    status === 'estornado_chargeback'
  );
}

/**
 * Índice (0-3) do estágio ativo na timeline de 4 passos de "Seu pedido"
 * (`cliente-06-seu-pedido-pin.png`: Pago → Em preparo → Pronto no hub →
 * Entregue). O protótipo comprime os 6 status oficiais da AC2 em 4 passos
 * visuais — `saindo_hub` e `no_hub` mapeiam ambos para "Pronto no hub"
 * (do ponto de vista do cliente, a diferença entre "a caminho do hub" e
 * "já chegou" não muda a ação esperada dele: aguardar e mostrar o PIN).
 */
export const TIMELINE_STEPS = ['Pago', 'Em preparo', 'Pronto no hub', 'Entregue'] as const;

export function timelineStepIndex(status: PedidoStatus): number {
  switch (status) {
    case 'aguardando_pagamento':
    case 'aguardando_aceite':
    case 'aceito':
      return 0;
    case 'em_preparo':
      return 1;
    case 'saindo_hub':
    case 'no_hub':
      return 2;
    case 'entregue':
      return 3;
    default:
      // Ramos de exceção (cancelado/recusado/não retirado) não usam a
      // timeline feliz — quem chama decide não renderizar o componente.
      return 0;
  }
}
