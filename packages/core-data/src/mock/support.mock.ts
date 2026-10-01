import type { SupportCase, SupportPort } from '../ports/support.port';
import { businessConfig } from '@keepit/config';
import type { MockDb } from './db';
import { generateMockId } from './async-helpers';
import { registrarReembolso } from './refund-helpers';
import { remainingRefund } from '../refund-limits';

const TERMINAIS = new Set(['entregue', 'cancelado', 'cancelado_timeout', 'cancelado_atraso', 'cancelado_admin', 'recusado', 'nao_retirado', 'nao_entregue_lojista', 'estornado_chargeback']);

export function createSupportMock(db: MockDb): SupportPort {
  return {
    async abrir(input) {
      return db.runClienteMutation(async (persist) => {
        const pedido = db.pedidos.find((item) => item.id === input.pedidoId);
        if (!pedido) throw new Error('PEDIDO_NAO_ENCONTRADO');
        const cliente = db.sessionClienteId === pedido.cliente_id;
        const lojista = db.sessionLojistaUserId !== null && db.estabelecimentosCadastrados.some((item) => item.id === pedido.estabelecimento_id && item.donoUserId === db.sessionLojistaUserId);
        if (input.tipo === 'cliente_ausente' ? !lojista : !cliente) throw new Error('ACESSO_NEGADO');
        const solicitanteId = input.tipo === 'cliente_ausente' ? db.sessionLojistaUserId! : db.sessionClienteId!;
        const alias = db.operacoesSolicitacao.find((item) => item.operacaoId === input.operacaoId);
        const retry = db.solicitacoesPedido.find((item) => item.id === alias?.casoId || item.operacaoId === input.operacaoId);
        if (retry) {
          if (retry.pedidoId !== input.pedidoId || retry.tipo !== input.tipo || (alias && alias.solicitanteId !== solicitanteId)) throw new Error('OPERACAO_ID_EM_USO');
          return retry;
        }
        if (!input.motivo.trim()) throw new Error('MOTIVO_OBRIGATORIO');
        if (TERMINAIS.has(pedido.status) && !(pedido.status === 'entregue' && input.tipo === 'pos_entrega')) throw new Error('ESTADO_INVALIDO');
        if (pedido.status === 'entregue' && input.tipo !== 'pos_entrega') throw new Error('ESTADO_INVALIDO');
        if (input.tipo === 'pos_entrega' && pedido.status !== 'entregue') throw new Error('ESTADO_INVALIDO');
        if (input.tipo === 'cliente_ausente' && pedido.status !== 'no_hub') throw new Error('ESTADO_INVALIDO');
        if (input.tipo === 'lojista_ausente') {
          const limite = pedido.cliente_chegou_em
            ? new Date(pedido.cliente_chegou_em).getTime() + Math.max(pedido.tempo_estimado_min ?? 0, businessConfig.esperaLojistaMaxMin) * 60_000
            : Infinity;
          if (pedido.status !== 'no_hub' || Date.now() <= limite) throw new Error('TEMPO_MINIMO_NAO_ATINGIDO');
        }
        if (input.tipo === 'atraso') {
          const limite = pedido.aceito_em && pedido.tempo_estimado_min
            ? new Date(pedido.aceito_em).getTime() + 2 * pedido.tempo_estimado_min * 60_000
            : Infinity;
          if (!['aceito', 'em_preparo'].includes(pedido.status) || Date.now() <= limite) throw new Error('ATRASO_NAO_CONFIRMADO');
        }
        const existente = db.solicitacoesPedido.find((item) => item.pedidoId === pedido.id && item.tipo === input.tipo && item.estado === 'aberta');
        if (existente) {
          db.operacoesSolicitacao.push({ operacaoId: input.operacaoId, casoId: existente.id, pedidoId: pedido.id, tipo: input.tipo, solicitanteId });
          await persist();
          return existente;
        }
        const agora = new Date().toISOString();
        const imediato = input.tipo === 'cancelamento' && ['aguardando_pagamento', 'aguardando_aceite'].includes(pedido.status);
        const caso: SupportCase = {
          id: generateMockId('solicitacao'), pedidoId: pedido.id, tipo: input.tipo,
          estado: imediato ? 'aprovada' : 'aberta', motivo: input.motivo.trim(),
          motivoDecisao: imediato ? 'cancelamento antes do aceite' : null,
          criadoEm: agora, encerradaEm: imediato ? agora : null, operacaoId: input.operacaoId,
        };
        db.solicitacoesPedido.push(caso);
        db.operacoesSolicitacao.push({ operacaoId: input.operacaoId, casoId: caso.id, pedidoId: pedido.id, tipo: input.tipo, solicitanteId });
        if (imediato) {
          const pago = pedido.status === 'aguardando_aceite';
          pedido.status = 'cancelado';
          pedido.cancelado_em = agora;
          pedido.motivo_cancelamento = input.motivo.trim();
          delete db.clienteOrderAutomation[pedido.id];
          if (pago) {
            const refund = registrarReembolso(db, pedido, 'cancelamento_cliente_pre_aceite');
            refund.caso_id = caso.id;
            refund.responsavel = 'keepit';
          }
          db.decisoesSolicitacao.push({ id: generateMockId('decisao'), casoId: caso.id, operacaoId: input.operacaoId, aprovar: true, motivo: 'cancelamento antes do aceite', decididoEm: agora, evento: 'decisao' });
        }
        await persist();
        db.clienteOrderChangeListeners.forEach((listener) => listener({ clienteId: pedido.cliente_id, pedidoId: pedido.id, reason: 'mutation' }));
        return caso;
      });
    },
    async listar() {
      const clienteId = db.sessionClienteId;
      const lojistaId = db.sessionLojistaUserId;
      return db.solicitacoesPedido.filter((caso) => {
        const pedido = db.pedidos.find((item) => item.id === caso.pedidoId);
        if (!pedido) return false;
        if (clienteId) return pedido.cliente_id === clienteId;
        if (lojistaId) return db.estabelecimentosCadastrados.some((item) => item.id === pedido.estabelecimento_id && item.donoUserId === lojistaId);
        return true;
      });
    },
    async decidir(input) {
      return db.runClienteMutation(async (persist) => {
        if (db.sessionClienteId || db.sessionLojistaUserId) throw new Error('ACESSO_NEGADO');
        const caso = db.solicitacoesPedido.find((item) => item.id === input.casoId);
        if (!caso) throw new Error('SOLICITACAO_NAO_ENCONTRADA');
        if (db.decisoesSolicitacao.some((item) => item.operacaoId === input.operacaoId && item.casoId === caso.id)) return caso;
        if (!input.motivo.trim()) throw new Error('MOTIVO_OBRIGATORIO');
        if (caso.estado !== 'aberta') throw new Error('ESTADO_INVALIDO');
        const pedido = db.pedidos.find((item) => item.id === caso.pedidoId)!;
        if (input.aprovar && caso.tipo !== 'pos_entrega' && TERMINAIS.has(pedido.status)) throw new Error('ESTADO_INVALIDO');
        if (input.aprovar && caso.tipo === 'pos_entrega' && (!Number.isSafeInteger(input.valorCentavos) || input.valorCentavos! <= 0 || !['keepit', 'lojista'].includes(input.responsavel ?? ''))) throw new Error('VALOR_RESPONSABILIDADE_OBRIGATORIOS');
        if (input.aprovar && caso.tipo === 'pos_entrega') {
          const comprometido = db.reembolsos.filter((item) => item.pedido_id === pedido.id && item.estado_reserva !== 'liberada');
          const concluido = comprometido.filter((item) => item.status === 'estornado').reduce((sum, item) => sum + Math.round(item.valor_a_estornar_reais * 100), 0);
          const reservado = comprometido.filter((item) => item.status !== 'estornado').reduce((sum, item) => sum + Math.round(item.valor_a_estornar_reais * 100), 0);
          if (input.valorCentavos! > remainingRefund(Math.round(pedido.total_pago_reais * 100), concluido, reservado)) throw new Error('REEMBOLSO_EXCEDIDO');
        }
        const agora = new Date().toISOString();
        caso.estado = input.aprovar ? 'aprovada' : 'negada';
        caso.motivoDecisao = input.motivo.trim();
        caso.encerradaEm = agora;
        const decisaoId = generateMockId('decisao');
        db.decisoesSolicitacao.push({ id: decisaoId, casoId: caso.id, operacaoId: input.operacaoId, aprovar: input.aprovar, motivo: input.motivo.trim(), decididoEm: agora, evento: 'decisao' });
        if (input.aprovar && caso.tipo === 'pos_entrega') {
          db.reembolsos.push({
            id: generateMockId('reembolso'), pedido_id: pedido.id, caso_id: caso.id,
            motivo: 'pos_entrega', valor_a_estornar_reais: input.valorCentavos! / 100,
            valor_ao_lojista_reais: 0, forma_pagamento: pedido.forma_pagamento,
            status: 'pendente_admin', criado_em: agora, responsavel: input.responsavel,
            referencia_externa: null, estado_reserva: 'ativa',
          });
        }
        if (input.aprovar && caso.tipo !== 'pos_entrega') {
          pedido.status = 'cancelado_admin';
          pedido.cancelado_em = agora;
          pedido.motivo_cancelamento = input.motivo.trim();
          const refund = registrarReembolso(db, pedido, 'cancelamento_admin');
          refund.caso_id = caso.id;
          refund.responsavel = 'keepit';
          for (const outro of db.solicitacoesPedido) {
            if (outro.pedidoId === pedido.id && outro.estado === 'aberta') {
              outro.estado = 'negada'; outro.motivoDecisao = 'pedido cancelado por decisão administrativa'; outro.encerradaEm = agora;
              db.decisoesSolicitacao.push({ id: generateMockId('decisao'), casoId: outro.id, operacaoId: generateMockId('operacao'), aprovar: false, motivo: outro.motivoDecisao, decididoEm: agora, decisaoOrigemId: decisaoId, evento: 'decisao' });
            }
          }
        }
        await persist();
        db.clienteOrderChangeListeners.forEach((listener) => listener({ clienteId: pedido.cliente_id, pedidoId: pedido.id, reason: 'mutation' }));
        return caso;
      });
    },
    async confirmarReembolso(input) {
      return db.runClienteMutation(async (persist) => {
        if (db.sessionClienteId || db.sessionLojistaUserId) throw new Error('ACESSO_NEGADO');
        if (!input.referencia.trim()) throw new Error('REFERENCIA_OBRIGATORIA');
        const caso = db.solicitacoesPedido.find((item) => item.id === input.casoId && item.estado === 'aprovada');
        if (!caso) throw new Error('SOLICITACAO_NAO_APROVADA');
        const refund = db.reembolsos.find((item) => item.caso_id === caso.id);
        if (!refund) throw new Error('REEMBOLSO_NAO_ENCONTRADO');
        if (refund.referencia_externa && refund.referencia_externa !== input.referencia.trim()) throw new Error('REFERENCIA_DIVERGENTE');
        if (refund.estado_reserva === 'liberada') throw new Error('RESERVA_LIBERADA');
        if (refund.status === 'estornado') return;
        refund.status = 'estornado';
        refund.referencia_externa = input.referencia.trim();
        if (refund.responsavel === 'lojista' && !db.ajustesReembolso.some((item) => item.reembolsoId === refund.id)) {
          db.ajustesReembolso.push({ reembolsoId: refund.id, pedidoId: refund.pedido_id, valorCentavos: -Math.round(refund.valor_a_estornar_reais * 100) });
        }
        await persist();
      });
    },
  };
}
