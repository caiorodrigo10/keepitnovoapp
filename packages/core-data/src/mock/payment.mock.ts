import type { PaymentAttempt, PaymentPort, PixChargeResult } from '../ports/payment.port';
import type { AsyncCallOptions } from '../types';
import { simulateAsync } from './async-helpers';
import type { MockDb } from './db';

/**
 * Hash determinístico simples (FNV-1a truncado) — reimplementado localmente
 * (Story 7.2, Dev Notes: "payment.mock.ts — não importar de apps/cliente").
 * `packages/core-data` é consumido por `apps/cliente`/`apps/lojista`/
 * `apps/admin`, nunca o contrário — importar
 * `apps/cliente/src/lib/pagamentoSimulado.ts#hashPedidoId` violaria a
 * direção de dependência do monorepo. Mesma ideia (não a mesma função):
 * gera um sufixo plausível o suficiente para o QR fake parecer único por
 * pedido, sem nenhuma pretensão de segurança/criptografia.
 */
function hashPedidoId(pedidoId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < pedidoId.length; i += 1) {
    hash ^= pedidoId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(8, '0');
}

/**
 * Story 7.2 (AC3). Cobrança PIX fake, determinística a partir de `pedidoId`
 * (mesmo pedido → mesmo resultado, para o mock ser idempotente sem precisar
 * persistir estado extra — mas ainda assim mantém um `Map` interno para
 * congelar o valor gerado, mesma garantia de "2ª chamada retorna o mesmo
 * resultado, sem recriar" pedida pela Story).
 */
export function createPaymentMock(db: MockDb): PaymentPort {
  const cobrancasPorPedido = new Map<string, PixChargeResult>();

  const tentativas = new Map<string, { operacaoId: string; tentativa: PaymentAttempt }>();
  const port: PaymentPort = {
    async iniciarPix(input) {
      const pedido = db.pedidos.find((p) => p.id === input.pedidoId);
      if (!pedido || pedido.cliente_id !== db.sessionClienteId) throw new Error('ACESSO_NEGADO');
      if (pedido.status !== 'aguardando_pagamento' || pedido.forma_pagamento !== 'pix') throw new Error('PEDIDO_NAO_PAGAVEL');
      const atual = tentativas.get(pedido.id);
      if (atual) {
        if (atual.operacaoId !== input.operacaoId) throw new Error('TENTATIVA_EM_ANDAMENTO');
        return structuredClone(atual.tentativa);
      }
      const tentativa: PaymentAttempt = { id: `tentativa_mock_${input.operacaoId}`, pedidoId: pedido.id, estado: 'criando' };
      tentativas.set(pedido.id, { operacaoId: input.operacaoId, tentativa });
      const pix = await port.criarCobrancaPix(pedido.id, { delayMs: 0 });
      tentativa.estado = 'pendente';
      tentativa.pix = { imagemBase64: pix.qr_code_pix, copiaCola: pix.pix_copia_e_cola, expiraEm: null };
      return structuredClone(tentativa);
    },
    async pagarCartao() { throw new Error('PAGAMENTO_CARTAO_INDISPONIVEL'); },
    async consultar(pedidoId) {
      const pedido = db.pedidos.find((p) => p.id === pedidoId);
      if (!pedido || pedido.cliente_id !== db.sessionClienteId) throw new Error('ACESSO_NEGADO');
      const atual = tentativas.get(pedidoId);
      return atual ? structuredClone(atual.tentativa) : null;
    },
    criarCobrancaPix(pedidoId: string, options?: AsyncCallOptions): Promise<PixChargeResult> {
      return simulateAsync(
        () => {
          const jaExiste = cobrancasPorPedido.get(pedidoId);
          if (jaExiste) {
            return jaExiste;
          }

          // [AUTO-DECISION] Lança para pedidoId desconhecido (mesmo padrão
          // `findOrThrow` de `order.mock.ts`) — reason: o handler real
          // (`create-pix-payment/handler.ts`) retorna 404
          // PEDIDO_NAO_ENCONTRADO nesse caso; o mock deve ter paridade de
          // comportamento (falhar, não inventar uma cobrança para um
          // pedido que não existe).
          const pedido = db.pedidos.find((p) => p.id === pedidoId);
          if (!pedido) {
            throw new Error(`[mock] Pedido não encontrado: ${pedidoId}`);
          }

          const hash = hashPedidoId(pedidoId);
          const total = pedido.total_pago_reais.toFixed(2).replace('.', '');
          const resultado: PixChargeResult = {
            pedido_id: pedidoId,
            asaas_payment_id: `pay_mock_${hash}`,
            qr_code_pix: `MOCK-QR-${hash}`,
            pix_copia_e_cola: `00020126FAKE-KEEPIT-MOCK-${hash}-NAO-E-PIX-REAL5303986540${total}5802BR5913KEEPIT MOCK6009RIO DE JANEIRO6304FAKE`,
          };
          cobrancasPorPedido.set(pedidoId, resultado);
          return resultado;
        },
        {} as PixChargeResult,
        options,
      );
    },
  };
  return port;
}
