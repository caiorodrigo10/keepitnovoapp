import { businessConfig } from '@keepit/config';

import type { CarteiraLojista, Saque, WalletPort } from '../ports/wallet.port';
import type { AsyncCallOptions } from '../types';
import { generateMockId, simulateAsync } from './async-helpers';
import type { MockDb } from './db';

function roundReais(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Reimplementa em memória a mesma lógica da view SQL `carteira_lojista`
 * (docs/architecture/03-data-models.md#6.5): pedidos entregues há mais de
 * `businessConfig.carteiraLiberacaoDias` dias entram em saldo disponível;
 * os mais recentes ficam bloqueados. Saques e débitos abatem do disponível.
 */
function computeCarteira(db: MockDb, estabelecimentoId: string): CarteiraLojista {
  const liberacaoMs = businessConfig.carteiraLiberacaoDias * 24 * 60 * 60 * 1000;
  const agora = Date.now();

  let saldoDisponivel = 0;
  let saldoBloqueado = 0;

  for (const pedido of db.pedidos) {
    if (pedido.estabelecimento_id !== estabelecimentoId || pedido.status !== 'entregue' || !pedido.entregue_em) {
      continue;
    }
    const valorLiquido =
      pedido.subtotal_produtos_reais - pedido.taxa_keepit_reais + pedido.taxa_deslocamento_reais;
    const entregueEm = new Date(pedido.entregue_em).getTime();
    if (agora - entregueEm >= liberacaoMs) {
      saldoDisponivel += valorLiquido;
    } else {
      saldoBloqueado += valorLiquido;
    }
  }

  const totalSacado = db.saques
    .filter((s) => s.estabelecimento_id === estabelecimentoId && s.status !== 'erro')
    .reduce((sum, s) => sum + s.valor_reais, 0);

  return {
    estabelecimento_id: estabelecimentoId,
    saldo_disponivel_reais: roundReais(saldoDisponivel - totalSacado),
    saldo_bloqueado_reais: roundReais(saldoBloqueado),
    total_sacado_reais: roundReais(totalSacado),
    total_debitado_reais: 0,
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

    requestWithdrawal(estabelecimentoId: string, valorReais: number, options?: AsyncCallOptions): Promise<Saque> {
      return simulateAsync(
        () => {
          if (valorReais < businessConfig.saqueMinimoReais) {
            throw new Error(
              `[mock] Valor de saque abaixo do mínimo (R$ ${businessConfig.saqueMinimoReais})`,
            );
          }
          const carteira = computeCarteira(db, estabelecimentoId);
          if (valorReais > carteira.saldo_disponivel_reais) {
            throw new Error('[mock] Saldo disponível insuficiente para o saque solicitado');
          }
          const saque: Saque = {
            id: generateMockId('saque'),
            estabelecimento_id: estabelecimentoId,
            valor_reais: valorReais,
            status: 'solicitado',
            solicitado_em: new Date().toISOString(),
            processado_em: null,
            concluido_em: null,
          };
          db.saques.push(saque);
          return saque;
        },
        {} as Saque,
        options,
      );
    },

    statement(estabelecimentoId: string, options?: AsyncCallOptions): Promise<Saque[]> {
      return simulateAsync(
        () => db.saques.filter((s) => s.estabelecimento_id === estabelecimentoId),
        [],
        options,
      );
    },
  };
}
