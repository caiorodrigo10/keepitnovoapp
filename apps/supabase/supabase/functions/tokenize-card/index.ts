import { createClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createAsaasClient } from '../_shared/asaas.ts';
import { createCardValidationRepository, type CardRpcClient } from '../_shared/card-repository.ts';
import { resolveAsaasConfig } from '../create-pix-payment/config.ts';
import { createTokenizeCardHttpHandler } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const authOptions = { autoRefreshToken: false, persistSession: false };
const amountCents = () => {
  const value = Deno.env.get('CARD_VALIDATION_AMOUNT_CENTS');
  return value && /^\d+$/.test(value) && Number(value) > 0 && Number.isSafeInteger(Number(value)) ? Number(value) : null;
};

Deno.serve(createTokenizeCardHttpHandler({
  enabled: Deno.env.get('CARD_TOKENIZATION_ENABLED') === 'true',
  allowedOrigins: (Deno.env.get('PAYMENT_ALLOWED_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean),
  amountCents,
  async authenticate(token) {
    const client = createClient(url, anonKey, { auth: authOptions });
    const { data, error } = await client.auth.getUser(token); return error ? null : data.user?.id ?? null;
  },
  async authorizeClient(token, usuarioId) {
    const userClient = createClient<Database>(url, anonKey, { auth: authOptions, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data, error } = await userClient.from('clientes').select('id').eq('id', usuarioId).maybeSingle();
    if (error) throw error;
    return data?.id === usuarioId;
  },
  createDeps() {
    const admin = createClient<Database>(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: authOptions });
    return { ambiente: Deno.env.get('ASAAS_ENVIRONMENT') === 'production' ? 'producao' as const : 'sandbox' as const,
      asaas: createAsaasClient(resolveAsaasConfig({ get: (key) => Deno.env.get(key) })), cards: createCardValidationRepository(admin as unknown as CardRpcClient) };
  },
}));
