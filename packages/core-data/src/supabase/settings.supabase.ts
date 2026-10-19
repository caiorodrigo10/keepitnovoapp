import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';
import type { SettingsPort } from '../ports/settings.port';
import { parseHistoricoTaxas, parseTaxas } from '../financial-contract';
export function createSettingsSupabase(client?: SupabaseClient<Database>): SettingsPort {
  const getClient = () => (client ??= createClient());
  return {
    async getTaxas() {
      const { data, error } = await getClient().rpc('obter_taxas');
      if (error) throw error;
      return parseTaxas(data);
    },
    async updateTaxas(input) {
      const { data, error } = await getClient().rpc('alterar_taxas', {
        p_comissao_bps: input.comissaoBps, p_servico_centavos: input.servicoCentavos,
        p_versao_esperada: input.versaoEsperada, p_motivo: input.motivo, p_operacao_id: input.operacaoId,
      });
      if (error) throw error;
      return parseTaxas(data);
    },
    async listHistoricoTaxas() {
      const { data, error } = await getClient().rpc('listar_historico_taxas');
      if (error) throw error;
      return parseHistoricoTaxas(data);
    },
  };
}
