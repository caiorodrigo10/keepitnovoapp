import type { PayoutPort, Repasse } from '../ports/payout.port';
import { generateMockId } from './async-helpers';
import type { MockDb } from './db';
import { estabelecimentosAdminExtraFixture } from './fixtures/estabelecimentos-admin';

function isoDate(date: Date): string { return date.toISOString().slice(0, 10); }

export function repasseWeek(instant: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(instant)).map((item) => [item.type, item.value]));
  const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return isoDate(day);
}

function dueDate(week: string): string {
  const date = new Date(`${week}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 11);
  return isoDate(date);
}

function validWeek(week: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(week) && !Number.isNaN(Date.parse(`${week}T00:00:00Z`)) && new Date(`${week}T00:00:00Z`).getUTCDay() === 1;
}

export function createPayoutMock(db: MockDb): PayoutPort {
  const admin = () => {
    if (db.sessionClienteId || db.sessionLojistaUserId) throw new Error('ACESSO_NEGADO');
  };
  const find = (id: string) => {
    const repasse = db.repasses.find((item) => item.id === id);
    if (!repasse) throw new Error('REPASSE_NAO_ENCONTRADO');
    return repasse;
  };
  const credits = (estabelecimentoId: string, week: string) => db.pedidos.filter((item) =>
    item.estabelecimento_id === estabelecimentoId && item.status === 'entregue' && !!item.entregue_em &&
    repasseWeek(item.entregue_em) <= week && !db.repasseItens.some((alloc) => alloc.fonteId === item.id && alloc.valorCentavos > 0 && !alloc.liberado));
  const adjustments = (estabelecimentoId: string) => db.ajustesReembolso.flatMap((item) => {
    const pedido = db.pedidos.find((order) => order.id === item.pedidoId);
    if (pedido?.estabelecimento_id !== estabelecimentoId) return [];
    const consumed = db.repasseItens.filter((alloc) => alloc.fonteId === item.reembolsoId && alloc.valorCentavos < 0 && !alloc.liberado)
      .reduce((sum, alloc) => sum - alloc.valorCentavos, 0);
    return [{ ...item, restante: Math.max(0, -item.valorCentavos - consumed) }];
  });
  const amount = (pedido: (typeof db.pedidos)[number]) => Math.round((pedido.subtotal_produtos_reais - pedido.taxa_keepit_reais + pedido.taxa_deslocamento_reais) * 100);

  return {
    async listar() {
      const ownStoreIds = db.sessionLojistaUserId
        ? new Set(db.estabelecimentosCadastrados.filter((item) => item.donoUserId === db.sessionLojistaUserId).map((item) => item.id))
        : null;
      if (db.sessionClienteId) return [];
      const materialized = db.repasses.filter((item) => !ownStoreIds || ownStoreIds.has(item.estabelecimentoId));
      materialized.forEach((repasse) => {
        repasse.itens = db.repasseItens.filter((item) => item.repasseId === repasse.id)
          .map((item) => ({ lancamentoId: item.fonteId, pedidoId: item.pedidoId, valorCentavos: item.valorCentavos }));
      });
      const weeks = new Map<string, { store: string; week: string; gross: number }>();
      for (const pedido of db.pedidos) {
        if (pedido.status !== 'entregue' || !pedido.entregue_em || (ownStoreIds && !ownStoreIds.has(pedido.estabelecimento_id))) continue;
        const week = repasseWeek(pedido.entregue_em);
        if (!credits(pedido.estabelecimento_id, week).some((item) => item.id === pedido.id)) continue;
        const key = `${pedido.estabelecimento_id}:${week}`;
        const existing = weeks.get(key);
        weeks.set(key, { store: pedido.estabelecimento_id, week, gross: (existing?.gross ?? 0) + amount(pedido) });
      }
      const debtUsed = new Map<string, number>();
      const forecasts: Repasse[] = [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)).map(({ store, week, gross }) => {
        const debt = adjustments(store).reduce((sum, item) => sum + item.restante, 0);
        const prior = debtUsed.get(store) ?? 0;
        debtUsed.set(store, prior + gross);
        return {
          id: `previsto:${store}:${week}`, estabelecimentoId: store, semanaInicio: week, previstoPara: dueDate(week),
          valorCentavos: Math.max(0, gross - Math.max(0, debt - prior)), estado: 'previsto',
          destinatarioNome: null, destinatarioResponsavel: null, chavePix: null, chavePixTipo: null,
          referencia: null, preparadoEm: null, confirmadoEm: null,
        };
      });
      return [...materialized, ...forecasts].sort((a, b) => b.semanaInicio.localeCompare(a.semanaInicio));
    },
    async preparar(input) {
      admin();
      if (!validWeek(input.semanaInicio)) throw new Error('SEMANA_INVALIDA');
      const prior = db.operacoesPreparacaoRepasse.find((item) => item.operacaoId === input.operacaoId);
      if (prior) {
        if (prior.semanaInicio !== input.semanaInicio) throw new Error('OPERACAO_ID_EM_USO');
        return prior.repasseIds.map(find);
      }
      const stores = [...new Set(db.pedidos.map((item) => item.estabelecimento_id))].sort();
      const result: Repasse[] = [];
      for (const store of stores) {
        const existing = db.repasses.find((item) => item.estabelecimentoId === store && item.semanaInicio === input.semanaInicio && item.estado !== 'invalidado');
        if (existing) { result.push(existing); continue; }
        const sources = credits(store, input.semanaInicio);
        if (!sources.length) continue;
        const gross = sources.reduce((sum, item) => sum + amount(item), 0);
        const owed = adjustments(store);
        const debt = owed.reduce((sum, item) => sum + item.restante, 0);
        const total = Math.max(0, gross - debt);
        const account = db.estabelecimentosCadastrados.find((item) => item.id === store);
        const payment = estabelecimentosAdminExtraFixture[store];
        if (!payment?.chave_pix?.trim()) throw new Error('CHAVE_PIX_OBRIGATORIA');
        const repasse: Repasse = {
          id: generateMockId('repasse'), estabelecimentoId: store, semanaInicio: input.semanaInicio,
          previstoPara: dueDate(input.semanaInicio), valorCentavos: total, estado: total ? 'pendente' : 'compensado',
          destinatarioNome: account?.nomeFantasia ?? null, destinatarioResponsavel: payment?.responsavel_nome ?? null,
          chavePix: payment?.chave_pix ?? null, chavePixTipo: payment?.chave_pix_tipo ?? null,
          referencia: null, preparadoEm: new Date().toISOString(), confirmadoEm: null,
        };
        db.repasses.push(repasse);
        sources.forEach((item) => db.repasseItens.push({ repasseId: repasse.id, fonteId: item.id, pedidoId: item.id, valorCentavos: amount(item), liberado: false }));
        let toOffset = gross - total;
        for (const ajuste of owed) {
          if (!toOffset) break;
          const consumed = Math.min(toOffset, ajuste.restante);
          if (!consumed) continue;
          db.repasseItens.push({ repasseId: repasse.id, fonteId: ajuste.reembolsoId, pedidoId: ajuste.pedidoId, valorCentavos: -consumed, liberado: false });
          toOffset -= consumed;
        }
        repasse.itens = db.repasseItens.filter((item) => item.repasseId === repasse.id)
          .map((item) => ({ lancamentoId: item.fonteId, pedidoId: item.pedidoId, valorCentavos: item.valorCentavos }));
        result.push(repasse);
      }
      db.operacoesPreparacaoRepasse.push({ operacaoId: input.operacaoId, semanaInicio: input.semanaInicio, repasseIds: result.map((item) => item.id) });
      return result;
    },
    async confirmar(input) {
      admin();
      if (!input.referencia.trim()) throw new Error('REFERENCIA_OBRIGATORIA');
      const repasse = find(input.repasseId);
      const prior = db.repasseEventos.find((item) => item.repasseId === repasse.id && item.tipo === 'confirmacao');
      if (repasse.estado === 'pago') {
        if (prior?.operacaoId !== input.operacaoId) throw new Error('OPERACAO_ID_EM_USO');
        if (repasse.referencia !== input.referencia.trim()) throw new Error('REFERENCIA_DIVERGENTE');
        return repasse;
      }
      if (!['pendente', 'em_analise'].includes(repasse.estado)) throw new Error('ESTADO_INVALIDO');
      if (db.repasseEventos.some((item) => item.tipo === 'confirmacao' && item.operacaoId === input.operacaoId)) throw new Error('OPERACAO_ID_EM_USO');
      if (db.repasses.some((item) => item.id !== repasse.id && item.estado === 'pago' && item.referencia === input.referencia.trim())) throw new Error('REFERENCIA_EM_USO');
      repasse.estado = 'pago'; repasse.referencia = input.referencia.trim(); repasse.confirmadoEm = new Date().toISOString();
      db.repasseEventos.push({ repasseId: repasse.id, tipo: 'confirmacao', operacaoId: input.operacaoId, referencia: input.referencia.trim() });
      return repasse;
    },
    async marcarEmAnalise(input) {
      admin();
      if (!input.motivo.trim()) throw new Error('MOTIVO_OBRIGATORIO');
      const repasse = find(input.repasseId);
      const prior = db.repasseEventos.find((item) => item.tipo === 'analise' && item.operacaoId === input.operacaoId);
      if (prior) {
        if (prior.repasseId !== repasse.id || prior.motivo !== input.motivo.trim()) throw new Error('OPERACAO_ID_EM_USO');
        return repasse;
      }
      if (!['pendente', 'em_analise'].includes(repasse.estado)) throw new Error('ESTADO_INVALIDO');
      repasse.estado = 'em_analise';
      db.repasseEventos.push({ repasseId: repasse.id, tipo: 'analise', operacaoId: input.operacaoId, motivo: input.motivo.trim() });
      return repasse;
    },
    async invalidar(input) {
      admin();
      if (!input.motivo.trim()) throw new Error('MOTIVO_OBRIGATORIO');
      const repasse = find(input.repasseId);
      if (repasse.estado === 'invalidado' && db.repasseEventos.some((item) => item.tipo === 'invalidacao' && item.operacaoId === input.operacaoId && item.repasseId === repasse.id)) return repasse;
      if (repasse.estado !== 'pendente') throw new Error('ESTADO_INVALIDO');
      repasse.estado = 'invalidado';
      db.repasseEventos.push({ repasseId: repasse.id, tipo: 'invalidacao', operacaoId: input.operacaoId, motivo: input.motivo.trim() });
      db.repasseItens.filter((item) => item.repasseId === repasse.id).forEach((item) => { item.liberado = true; });
      return repasse;
    },
    async resolverSemPix(input) {
      admin();
      if (!input.motivo.trim()) throw new Error('MOTIVO_OBRIGATORIO');
      if (!input.evidencia.trim()) throw new Error('EVIDENCIA_SEM_PIX_OBRIGATORIA');
      const repasse = find(input.repasseId);
      const prior = db.repasseEventos.find((item) => item.tipo === 'resolucao_sem_pix' && item.repasseId === repasse.id && item.operacaoId === input.operacaoId);
      if (prior && repasse.estado === 'invalidado') {
        if (prior.motivo !== input.motivo.trim() || prior.evidencia !== input.evidencia.trim()) throw new Error('OPERACAO_ID_EM_USO');
        return repasse;
      }
      if (repasse.estado !== 'em_analise') throw new Error('ESTADO_INVALIDO');
      if (db.repasseEventos.some((item) => item.operacaoId === input.operacaoId && item.repasseId === repasse.id)) throw new Error('OPERACAO_ID_EM_USO');
      repasse.estado = 'invalidado';
      db.repasseItens.filter((item) => item.repasseId === repasse.id).forEach((item) => { item.liberado = true; });
      db.repasseEventos.push({ repasseId: repasse.id, tipo: 'resolucao_sem_pix', operacaoId: input.operacaoId, motivo: input.motivo.trim(), evidencia: input.evidencia.trim() });
      return repasse;
    },
  };
}
