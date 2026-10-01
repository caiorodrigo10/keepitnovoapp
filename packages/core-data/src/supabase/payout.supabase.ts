import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';
import type { PayoutPort, Repasse } from '../ports/payout.port';

type Row = {
  id: string; estabelecimento_id: string; semana_inicio: string; previsto_para: string;
  valor_centavos: number; estado?: Repasse['estado']; destinatario_nome?: string | null;
  destinatario_responsavel?: string | null; chave_pix?: string | null; chave_pix_tipo?: string | null;
  referencia?: string | null; preparado_em?: string | null; confirmado_em?: string | null;
};

function parse(value: unknown, forecast = false): Repasse {
  const row = value as Row | null;
  if (!row?.id || !row.estabelecimento_id || !row.semana_inicio || !row.previsto_para || !Number.isSafeInteger(row.valor_centavos)) {
    throw new Error('RESPOSTA_REPASSE_INVALIDA');
  }
  return {
    id: row.id, estabelecimentoId: row.estabelecimento_id, semanaInicio: row.semana_inicio,
    previstoPara: row.previsto_para, valorCentavos: row.valor_centavos,
    estado: forecast ? 'previsto' : row.estado ?? 'pendente',
    destinatarioNome: row.destinatario_nome ?? null, destinatarioResponsavel: row.destinatario_responsavel ?? null,
    chavePix: row.chave_pix ?? null, chavePixTipo: row.chave_pix_tipo ?? null,
    referencia: row.referencia ?? null, preparadoEm: row.preparado_em ?? null, confirmadoEm: row.confirmado_em ?? null,
  };
}

export function createPayoutSupabase(client?: SupabaseClient<Database>): PayoutPort {
  const resolve = () => (client ??= createClient());
  return {
    async listar() {
      const [batches, forecasts, allocations] = await Promise.all([
        resolve().from('repasses' as never).select('*').order('semana_inicio', { ascending: false }),
        resolve().from('previsoes_repasse' as never).select('*').order('semana_inicio', { ascending: false }),
        resolve().from('repasse_itens' as never).select('repasse_id,lancamento_id,valor_centavos,lancamentos_financeiros(pedido_id)').order('criado_em', { ascending: true }),
      ]);
      if (batches.error) throw batches.error;
      if (forecasts.error) throw forecasts.error;
      if (allocations.error) throw allocations.error;
      const itemsByBatch = new Map<string, NonNullable<Repasse['itens']>>();
      for (const value of (allocations.data ?? []) as unknown[]) {
        const item = value as { repasse_id: string; lancamento_id: string; valor_centavos: number; lancamentos_financeiros?: { pedido_id: string | null } | null };
        const group = itemsByBatch.get(item.repasse_id) ?? [];
        group.push({ lancamentoId: item.lancamento_id, pedidoId: item.lancamentos_financeiros?.pedido_id ?? null,
          valorCentavos: item.valor_centavos });
        itemsByBatch.set(item.repasse_id, group);
      }
      return [ ...((batches.data ?? []) as unknown[]).map((row) => {
        const repasse = parse(row);
        repasse.itens = itemsByBatch.get(repasse.id) ?? [];
        return repasse;
      }),
        ...((forecasts.data ?? []) as unknown[]).map((row) => parse(row, true)) ]
        .sort((a, b) => b.semanaInicio.localeCompare(a.semanaInicio));
    },
    async preparar(input) {
      const { data, error } = await resolve().rpc('preparar_repasses_semanais' as never,
        { p_semana_inicio: input.semanaInicio, p_operacao_id: input.operacaoId } as never);
      if (error) throw error;
      return ((data ?? []) as unknown[]).map((row) => parse(row));
    },
    async confirmar(input) {
      const { data, error } = await resolve().rpc('confirmar_repasse' as never,
        { p_repasse_id: input.repasseId, p_referencia: input.referencia, p_operacao_id: input.operacaoId } as never);
      if (error) throw error;
      return parse(data);
    },
    async marcarEmAnalise(input) {
      const { data, error } = await resolve().rpc('marcar_repasse_em_analise' as never,
        { p_repasse_id: input.repasseId, p_motivo: input.motivo, p_operacao_id: input.operacaoId } as never);
      if (error) throw error;
      return parse(data);
    },
    async invalidar(input) {
      const { data, error } = await resolve().rpc('invalidar_repasse' as never,
        { p_repasse_id: input.repasseId, p_motivo: input.motivo, p_operacao_id: input.operacaoId } as never);
      if (error) throw error;
      return parse(data);
    },
    async resolverSemPix(input) {
      const { data, error } = await resolve().rpc('resolver_repasse_sem_pix' as never,
        { p_repasse_id: input.repasseId, p_motivo: input.motivo, p_evidencia_sem_pix: input.evidencia,
          p_operacao_id: input.operacaoId } as never);
      if (error) throw error;
      return parse(data);
    },
  };
}
