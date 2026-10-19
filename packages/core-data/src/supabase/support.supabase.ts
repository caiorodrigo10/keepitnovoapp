import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';
import type { SupportCase, SupportPort } from '../ports/support.port';

type Row = {
  id: string; pedido_id: string; tipo: SupportCase['tipo']; estado: SupportCase['estado'];
  motivo: string; motivo_decisao: string | null; criado_em: string; encerrada_em: string | null; operacao_id: string;
};

function parseCase(value: unknown): SupportCase {
  const row = value as Row | null;
  if (!row || !row.id || !row.pedido_id || !row.operacao_id) throw new Error('RESPOSTA_INVALIDA');
  return {
    id: row.id, pedidoId: row.pedido_id, tipo: row.tipo, estado: row.estado,
    motivo: row.motivo, motivoDecisao: row.motivo_decisao,
    criadoEm: row.criado_em, encerradaEm: row.encerrada_em, operacaoId: row.operacao_id,
  };
}

export function createSupportSupabase(client?: SupabaseClient<Database>): SupportPort {
  const resolve = () => (client ??= createClient());
  return {
    async abrir(input) {
      const { data, error } = await resolve().rpc('abrir_solicitacao_pedido' as never, {
        p_pedido_id: input.pedidoId, p_tipo: input.tipo, p_motivo: input.motivo, p_operacao_id: input.operacaoId,
      } as never);
      if (error) throw error;
      return parseCase(data);
    },
    async listar() {
      const { data, error } = await resolve().from('solicitacoes_pedido' as never).select('*').order('criado_em', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown[]).map(parseCase);
    },
    async decidir(input) {
      const { data, error } = await resolve().rpc('decidir_solicitacao_pedido' as never, {
        p_caso_id: input.casoId, p_aprovar: input.aprovar, p_motivo: input.motivo,
        p_valor_centavos: input.valorCentavos ?? null, p_responsavel: input.responsavel ?? null,
        p_operacao_id: input.operacaoId,
      } as never);
      if (error) throw error;
      return parseCase(data);
    },
    async confirmarReembolso(input) {
      const { error } = await resolve().rpc('confirmar_reembolso' as never, {
        p_caso_id: input.casoId, p_referencia: input.referencia, p_operacao_id: input.operacaoId,
      } as never);
      if (error) throw error;
    },
  };
}
