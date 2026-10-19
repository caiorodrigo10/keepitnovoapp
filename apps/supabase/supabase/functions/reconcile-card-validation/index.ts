import { createClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import { createAsaasClient } from '../_shared/asaas.ts';
import { createCardValidationRepository, type CardRpcClient } from '../_shared/card-repository.ts';
import { resolveAsaasConfig } from '../create-pix-payment/config.ts';
import { createReconcileCardValidationHttpHandler } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const auth = { autoRefreshToken: false, persistSession: false };

Deno.serve(createReconcileCardValidationHttpHandler({
  enabled: Deno.env.get('CARD_TOKENIZATION_ENABLED') === 'true',
  async authenticateAdmin(token) {
    const verifier = createClient(url, anonKey, { auth });
    const { data, error } = await verifier.auth.getUser(token);
    const userId = error ? null : data.user?.id ?? null;
    if (!userId) return { authenticated: false, adminId: null };
    const userClient = createClient<Database>(url, anonKey, { auth, global: { headers: { Authorization: `Bearer ${token}` } } });
    const admin = await userClient.from('admin_users').select('id').eq('id', userId).maybeSingle();
    if (admin.error) throw admin.error;
    return { authenticated: true, adminId: admin.data?.id ?? null };
  },
  createDeps() {
    const service = createClient<Database>(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth });
    return {
      ambiente: Deno.env.get('ASAAS_ENVIRONMENT') === 'production' ? ('producao' as const) : ('sandbox' as const),
      cards: createCardValidationRepository(service as unknown as CardRpcClient),
      asaas: createAsaasClient(resolveAsaasConfig({ get: (key) => Deno.env.get(key) })),
    };
  },
}));
