import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';
import type { ComprovanteRepasse, PayoutPort, Repasse } from '../ports/payout.port';

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
      const [batches, forecasts, allocations, credits] = await Promise.all([
        resolve().rpc('listar_repasses_visiveis' as never),
        resolve().from('previsoes_repasse' as never).select('*').order('semana_inicio', { ascending: false }),
        resolve().from('repasse_itens' as never).select('repasse_id,lancamento_id,valor_centavos,liberado_em,lancamentos_financeiros(pedido_id,pedidos(numero,taxa_keepit_reais))').order('criado_em', { ascending: true }),
        resolve().from('lancamentos_financeiros').select('id,estabelecimento_id,semana_inicio,valor_centavos,pedido_id,pedidos(numero,taxa_keepit_reais)').eq('tipo', 'merchant_credit').eq('status', 'concluido'),
      ]);
      if (batches.error) throw batches.error;
      if (forecasts.error) throw forecasts.error;
      if (allocations.error) throw allocations.error;
      if (credits.error) throw credits.error;
      const itemsByBatch = new Map<string, NonNullable<Repasse['itens']>>();
      for (const value of (allocations.data ?? []) as unknown[]) {
        const item = value as { repasse_id: string; lancamento_id: string; valor_centavos: number; lancamentos_financeiros?: { pedido_id: string | null; pedidos?: { numero: number; taxa_keepit_reais: number } | null } | null };
        const group = itemsByBatch.get(item.repasse_id) ?? [];
        group.push({ lancamentoId: item.lancamento_id, pedidoId: item.lancamentos_financeiros?.pedido_id ?? null,
          valorCentavos: item.valor_centavos,
          numeroPedido: item.lancamentos_financeiros?.pedidos?.numero ?? null,
          comissaoCentavos: item.valor_centavos > 0 && item.lancamentos_financeiros?.pedidos
            ? Math.round(item.lancamentos_financeiros.pedidos.taxa_keepit_reais * 100) : null });
        itemsByBatch.set(item.repasse_id, group);
      }
      return [ ...((batches.data ?? []) as unknown[]).map((row) => {
        const repasse = parse(row);
        repasse.itens = itemsByBatch.get(repasse.id) ?? [];
        return repasse;
      }),
        ...((forecasts.data ?? []) as unknown[]).map((row) => {
          const forecast = parse(row, true);
          const allocated = new Set(((allocations.data ?? []) as Array<{ lancamento_id: string; liberado_em: string | null }>)
            .filter((item) => !item.liberado_em).map((item) => item.lancamento_id));
          const itemRows = ((credits.data ?? []) as unknown as Array<{ id: string; estabelecimento_id: string;
            semana_inicio: string | null; valor_centavos: number; pedido_id: string | null;
            pedidos?: { numero: number; taxa_keepit_reais: number } | null }>).filter((item) =>
            item.estabelecimento_id === forecast.estabelecimentoId && item.semana_inicio === forecast.semanaInicio &&
            item.valor_centavos > 0 && !allocated.has(item.id));
          const gross = itemRows.reduce((sum, item) => sum + item.valor_centavos, 0);
          forecast.itens = itemRows.map((item) => ({ lancamentoId: item.id, pedidoId: item.pedido_id,
            valorCentavos: item.valor_centavos, numeroPedido: item.pedidos?.numero ?? null,
            comissaoCentavos: item.pedidos ? Math.round(item.pedidos.taxa_keepit_reais * 100) : null }));
          if (gross > forecast.valorCentavos) forecast.itens.push({ lancamentoId: `ajuste:${forecast.id}`,
            pedidoId: null, valorCentavos: forecast.valorCentavos - gross, numeroPedido: null, comissaoCentavos: null });
          return forecast;
        }) ]
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
        { p_repasse_id: input.repasseId, p_referencia: input.referencia,
          p_comprovante_identificador: input.comprovanteIdentificador, p_operacao_id: input.operacaoId } as never);
      if (error) throw error;
      return parse(data);
    },
    async consultarComprovante(repasseId) {
      const { data, error } = await resolve().rpc('consultar_comprovante_repasse' as never,
        { p_repasse_id: repasseId } as never);
      if (error) throw error;
      if (data == null) return null;
      const row = data as unknown as { referencia: string; comprovante_identificador: string | null; registrado_em: string };
      if (!row.referencia || !row.registrado_em) throw new Error('RESPOSTA_COMPROVANTE_INVALIDA');
      return { referencia: row.referencia, comprovanteIdentificador: row.comprovante_identificador,
        registradoEm: row.registrado_em } satisfies ComprovanteRepasse;
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
