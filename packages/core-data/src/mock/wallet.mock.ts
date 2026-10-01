import type { CarteiraLojista, Saque, WalletPort } from '../ports/wallet.port';
import type { AsyncCallOptions } from '../types';
import { simulateAsync } from './async-helpers';
import type { MockDb } from './db';

function roundReais(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Projeta créditos por PIN, ajustes, repasses reservados e histórico de PIX.
 */
function computeCarteira(db: MockDb, estabelecimentoId: string): CarteiraLojista {
  let creditos = 0;

  for (const pedido of db.pedidos) {
    if (pedido.estabelecimento_id !== estabelecimentoId || pedido.status !== 'entregue' || !pedido.entregue_em) {
      continue;
    }
    const valorLiquido =
      pedido.subtotal_produtos_reais - pedido.taxa_keepit_reais + pedido.taxa_deslocamento_reais;
    creditos += valorLiquido;
  }

  const saquesLegados = db.saques
    .filter((s) => s.estabelecimento_id === estabelecimentoId && s.status !== 'erro')
    .reduce((sum, s) => sum + s.valor_reais, 0);
  const saquesLegadosPagos = db.saques
    .filter((s) => s.estabelecimento_id === estabelecimentoId && s.status === 'concluido')
    .reduce((sum, s) => sum + s.valor_reais, 0);
  const lotes = db.repasses.filter((item) => item.estabelecimentoId === estabelecimentoId);
  const reservado = lotes.filter((item) => item.estado === 'pendente' || item.estado === 'em_analise')
    .reduce((sum, item) => sum + item.valorCentavos / 100, 0);
  const pago = lotes.filter((item) => item.estado === 'pago')
    .reduce((sum, item) => sum + item.valorCentavos / 100, 0);
  const totalDebitadoCentavos = db.ajustesReembolso
    .filter((ajuste) => db.pedidos.some((pedido) => pedido.id === ajuste.pedidoId && pedido.estabelecimento_id === estabelecimentoId))
    .reduce((sum, ajuste) => sum - ajuste.valorCentavos, 0);

  return {
    estabelecimento_id: estabelecimentoId,
    saldo_disponivel_reais: roundReais(creditos - saquesLegados - reservado - pago - totalDebitadoCentavos / 100),
    saldo_bloqueado_reais: roundReais(reservado),
    total_sacado_reais: roundReais(saquesLegadosPagos + pago),
    total_debitado_reais: totalDebitadoCentavos / 100,
  };
}

export function createWalletMock(db: MockDb): WalletPort {
  return {
    getBalance(estabelecimentoId: string, options?: AsyncCallOptions): Promise<CarteiraLojista> {
      return simulateAsync(
        () => computeCarteira(db, estabelecimentoId),
        {
          estabelecimento_id: estabelecimentoId,
          saldo_disponivel_reais: 0,
          saldo_bloqueado_reais: 0,
          total_sacado_reais: 0,
          total_debitado_reais: 0,
        },
        options,
      );
    },

    requestWithdrawal(_estabelecimentoId: string, _valorReais: number): Promise<Saque> {
      return Promise.reject(new Error('SAQUES_DESATIVADOS_USE_REPASSE_SEMANAL'));
    },

    statement(estabelecimentoId: string, options?: AsyncCallOptions): Promise<Saque[]> {
      return simulateAsync(
        () => [
          ...db.saques.filter((s) => s.estabelecimento_id === estabelecimentoId),
          ...db.repasses.filter((r) => r.estabelecimentoId === estabelecimentoId && r.estado === 'pago' && !!r.confirmadoEm)
            .map((r): Saque => ({ id: r.id, estabelecimento_id: estabelecimentoId, valor_reais: r.valorCentavos / 100,
              status: 'concluido', solicitado_em: r.confirmadoEm as string, processado_em: null, concluido_em: r.confirmadoEm })),
        ].sort((a, b) => b.solicitado_em.localeCompare(a.solicitado_em)),
        [],
        options,
      );
    },
  };
}
