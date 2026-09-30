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
        p_itens: input.itens.map(({ produtoId, quantidade }) => ({ produtoId, quantidade })),
      });
      if (error) throw error;
      return parseCotacao(data);
    },
    async criar() { throw new Error('CHECKOUT_INDISPONIVEL: criação e pagamento aguardam a integração de pagamentos.'); },
  };
}
