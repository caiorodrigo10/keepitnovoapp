import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';
import type { CheckoutPort } from '../ports/checkout.port';
import { parseCotacao } from '../financial-contract';
export function createCheckoutSupabase(client?: SupabaseClient<Database>): CheckoutPort {
  const getClient = () => (client ??= createClient());
  return {
    async cotar(input) {
      const { data, error } = await getClient().rpc('cotar_pedido', {
        p_estabelecimento_id: input.estabelecimentoId, p_hub_id: input.hubId,
        p_itens: input.itens.map(({ produtoId, quantidade, complementoIds }) => ({ produtoId, quantidade, ...(complementoIds ? { complementoIds } : {}) })),
      });
      if (error) throw error;
      return parseCotacao(data);
    },
    async criar(input) {
      const { data, error } = await getClient().rpc('criar_pedido_cotado', {
        p_cotacao_id: input.cotacaoId, p_forma: input.forma,
        p_nf_solicitada: input.nfSolicitada, p_operacao_id: input.operacaoId,
      });
      if (error) throw error;
      if (!data || typeof data !== 'object' || !('pedidoId' in data) || typeof data.pedidoId !== 'string') throw new Error('RESPOSTA_INVALIDA');
      return { pedidoId: data.pedidoId };
    },
  };
}
