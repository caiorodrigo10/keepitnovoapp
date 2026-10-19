import { createClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import type { PaymentAttempt } from '@keepit/shared-types/payment';
import { createAsaasClient } from '../_shared/asaas.ts';
import { resolveAsaasConfig } from '../create-pix-payment/config.ts';
import { createClosePaymentHttpHandler, type ClosureClaim } from './handler.ts';
const url = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const authOptions = { autoRefreshToken: false, persistSession: false };
Deno.serve(createClosePaymentHttpHandler({
  allowedOrigins: (Deno.env.get('PAYMENT_ALLOWED_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean),
  async authenticate(token) {
    const verifier = createClient(url, anonKey, { auth: authOptions });
    const { data, error } = await verifier.auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  },
  createDeps(token) {
    const userClient = createClient<Database>(url, anonKey, { auth: authOptions, global: { headers: { Authorization: `Bearer ${token}` } } });
    const admin = createClient<Database>(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: authOptions });
    return {
      asaasClient: createAsaasClient(resolveAsaasConfig({ get: (key) => Deno.env.get(key) })),
      repo: {
        async prepare(tentativaId, operacaoId) {
          const { error } = await userClient.rpc('preparar_encerramento_tentativa', { p_tentativa_id: tentativaId, p_operacao_id: operacaoId });
          if (error) throw error;
          const claimed = await admin.rpc('claim_encerramento_tentativa', { p_tentativa_id: tentativaId, p_operacao_id: operacaoId });
          if (claimed.error) throw claimed.error;
          return claimed.data as unknown as ClosureClaim;
        },
        async complete(tentativaId, claimToken, proof) {
          const { data, error } = await admin.rpc('concluir_encerramento_tentativa', { p_tentativa_id: tentativaId, p_claim_token: claimToken,
            p_confirmacao: { id: proof.id, deleted: proof.deleted, status: proof.status, value: proof.value, billingType: proof.billingType, externalReference: proof.externalReference } });
          if (error) throw error;
          return data as unknown as PaymentAttempt;
        },
        async uncertain(tentativaId, claimToken) {
          const { error } = await admin.rpc('registrar_incerteza_encerramento', { p_tentativa_id: tentativaId, p_claim_token: claimToken });
          if (error) throw error;
        },
      },
    };
  },
}));
