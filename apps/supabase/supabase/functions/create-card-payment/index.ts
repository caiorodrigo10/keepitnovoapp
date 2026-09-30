import { createClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createAsaasClient } from '../_shared/asaas.ts';
import type { DurablePaymentAttempt } from '../_shared/payment-attempt.ts';
import { resolveAsaasConfig } from '../create-pix-payment/config.ts';
import { createCardHttpHandler, trustedPayerIp } from './handler.ts';
import type { PedidoParaCobranca } from '../create-pix-payment/handler.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const authOptions = { autoRefreshToken: false, persistSession: false };
Deno.serve(createCardHttpHandler({
  // Lista explícita por ambiente, sem curingas nem confiança em Origin fornecido pelo cliente.
  allowedOrigins: (Deno.env.get('PAYMENT_ALLOWED_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean),
  async authenticate(token) {
    const verifier = createClient(url, anonKey, { auth: authOptions });
    const { data, error } = await verifier.auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  },
  async authorizeOrder(token, pedidoId, usuarioId) {
    const userClient = createClient<Database>(url, anonKey, { auth: authOptions, global: { headers: { Authorization: `Bearer ${token}` } } });
    // RLS sob a sessão, antes de construir qualquer client service_role.
    // O filtro de dono também exclui lojistas/admins que podem ler o pedido por outra policy.
    const { data, error } = await userClient.from('pedidos').select('id')
      .eq('id', pedidoId).eq('cliente_id', usuarioId)
      .eq('status', 'aguardando_pagamento').eq('forma_pagamento', 'cartao')
      .is('pago_em', null).not('cotacao_id', 'is', null).maybeSingle();
    if (error) throw error;
    return data?.id === pedidoId;
  },
  trustedIp: trustedPayerIp,
  createDeps(token) {
    const userClient = createClient<Database>(url, anonKey, { auth: authOptions, global: { headers: { Authorization: `Bearer ${token}` } } });
    const admin = createClient<Database>(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: authOptions });
    return {
      asaasClient: createAsaasClient(resolveAsaasConfig({ get: (key) => Deno.env.get(key) })),
      pedidos: {
        async getById(pedidoId) {
          const { data, error } = await admin.rpc('obter_pedido_pagamento', { p_pedido_id: pedidoId });
          if (error) throw error;
          return data as unknown as PedidoParaCobranca | null;
        },
        async claim(pedidoId, operacaoId) {
          const reservation = await userClient.rpc('reservar_tentativa_pagamento', { p_pedido_id: pedidoId, p_forma: 'cartao', p_operacao_id: operacaoId });
          if (reservation.error) throw reservation.error;
          const tentativa = reservation.data as { id: string };
          const { data, error } = await admin.rpc('claim_tentativa_pagamento', { p_tentativa_id: tentativa.id });
          if (error) throw error;
          return data as unknown as { attempt: DurablePaymentAttempt; acquired: boolean };
        },
        async save(id, claimToken, patch) {
          if (!claimToken) throw new Error('CLAIM_INVALIDO');
          const { data, error } = await admin.rpc('salvar_tentativa_pagamento', { p_tentativa_id: id, p_claim_token: claimToken, p_patch: patch });
          if (error) throw error;
          return data as unknown as DurablePaymentAttempt;
        },
      },
    };
  },
}));
