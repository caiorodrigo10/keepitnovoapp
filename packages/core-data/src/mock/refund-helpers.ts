import { businessConfig } from '@keepit/config';

import type { ReembolsoMotivo, ReembolsoPendente } from '../ports/admin.port';
import type { Pedido } from '../ports/order.port';
import { generateMockId } from './async-helpers';
import type { MockDb } from './db';

function roundReais(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * % do valor pago que retorna ao Cliente, por `ReembolsoMotivo` — Story 1.10
 * (Task 4/AC9), derivado de `businessConfig` (nunca hard-coded). Motivos sem
 * percentual fechado na matriz (`chargeback`, `cancelamento_atraso`) usam o
 * valor mais próximo já decidido — documentado inline.
 * [Source: docs/PERGUNTAS_REGRAS_NEGOCIO.md#Rodada 2 — Cancelamento e exceções]
 */
function percentClientePorMotivo(motivo: ReembolsoMotivo): number {
  switch (motivo) {
    case 'timeout_aceite':
    case 'recusa_lojista':
    case 'cancelamento_cliente_pre_aceite':
    case 'cancelamento_admin':
      return businessConfig.cancelamentoAntesAceitePercent;
    case 'cancelamento_cliente_pos_aceite':
      return businessConfig.cancelamentoAposAceitePercentCliente;
    case 'cancelamento_atraso':
      return businessConfig.lojistaNaoVeioPercent;
    case 'nao_retirado_cliente':
      return businessConfig.clienteNaoApareceuPercentCliente;
    case 'nao_entregue_lojista':
      return businessConfig.lojistaNaoVeioPercent;
    case 'chargeback':
      return 0;
    default:
      return 100;
  }
}

/**
 * Insere a entrada correspondente em `db.reembolsos` — Story 1.10 (Task 4),
 * helper centralizado reutilizado por `order.mock.ts` (`cancel`, `refuse`,
 * `markCustomerNoShow`) e `admin.mock.ts` (`forceCancelOrder`), substituindo
 * o caminho isolado que só existia no mock local do Admin (Story 0.13).
 */
export function registrarReembolso(db: MockDb, pedido: Pedido, motivo: ReembolsoMotivo): ReembolsoPendente {
  const percentCliente = percentClientePorMotivo(motivo);
  const valorAEstornar = roundReais((pedido.total_pago_reais * percentCliente) / 100);
  const valorAoLojista = roundReais(pedido.total_pago_reais - valorAEstornar);

  const reembolso: ReembolsoPendente = {
    id: generateMockId('reembolso'),
    pedido_id: pedido.id,
    motivo,
    valor_a_estornar_reais: valorAEstornar,
    valor_ao_lojista_reais: valorAoLojista,
    forma_pagamento: pedido.forma_pagamento,
    status: 'pendente_admin',
    criado_em: new Date().toISOString(),
  };
  db.reembolsos.push(reembolso);
  return reembolso;
}
