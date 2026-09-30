import { createClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import { createAsaasClient } from '../_shared/asaas.ts';
import { resolveAsaasConfig } from '../create-pix-payment/config.ts';
import { createReconcileHttpHandler } from './handler.ts';
import type { ReconcileDeps } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const authOptions = { autoRefreshToken: false, persistSession: false };

type EventRpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{
    data: Array<{ resultado?: string; pedido_id?: string | null }> | null;
    error: { message: string } | null;
  }>;
};

type BindingRpcClient = {
  rpc(name: 'vincular_cobranca_reconciliacao', args: {
    p_tentativa_id: string; p_cobranca_id: string;
  }): Promise<{ data: boolean | null; error: { message: string } | null }>;
};

Deno.serve(createReconcileHttpHandler({
  async authenticateAdmin(token) {
    const verifier = createClient(url, anonKey, { auth: authOptions });
    const { data, error } = await verifier.auth.getUser(token);
    const userId = error ? null : data.user?.id ?? null;
    if (!userId) return { authenticated: false, adminId: null };

    // A consulta usa a sessão e RLS. O client service_role ainda não existe.
    const userClient = createClient<Database>(url, anonKey, {
      auth: authOptions,
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const admin = await userClient.from('admin_users').select('id').eq('id', userId).maybeSingle();
    if (admin.error) throw admin.error;
    return { authenticated: true, adminId: admin.data?.id ?? null };
  },
  createDeps(): ReconcileDeps {
    const service = createClient<Database>(
      url,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: authOptions },
    );
    const asaas = createAsaasClient(resolveAsaasConfig({ get: (key) => Deno.env.get(key) }));
    const rpc = service as unknown as EventRpcClient;
    const bindingRpc = service as unknown as BindingRpcClient;
    return {
      attempts: {
        async getById(id) {
          const { data, error } = await service.from('tentativas_pagamento')
            .select('id, asaas_payment_id').eq('id', id).maybeSingle();
          if (error) throw error;
          return data ? { id: data.id, paymentId: data.asaas_payment_id } : null;
        },
        async bindPaymentId(attemptId, paymentId) {
          const { data, error } = await bindingRpc.rpc('vincular_cobranca_reconciliacao', {
            p_tentativa_id: attemptId,
            p_cobranca_id: paymentId,
          });
          if (error) throw new Error('VINCULO_RECONCILIACAO_FALHOU');
          return { bound: data === true };
        },
      },
      gateway: {
        getPayment: (id) => asaas.consultarCobranca(id),
        listPayments: (reference) => asaas.listarCobrancasPorReferencia(reference),
      },
      events: {
        async processPaymentEvent(input) {
          const { data, error } = await rpc.rpc('processar_evento_pagamento', {
            p_evento_id: input.eventId,
            p_evento: input.event,
            p_cobranca_id: input.paymentId,
            p_referencia: input.reference,
            p_valor_centavos: input.valueCents,
            p_metodo: input.method,
          });
          if (error) throw new Error('PROCESSAMENTO_EVENTO_FALHOU');
          const row = data?.[0];
          return { resultado: row?.resultado ?? 'erro_persistencia', pedidoId: row?.pedido_id ?? null };
        },
      },
    };
  },
}));
