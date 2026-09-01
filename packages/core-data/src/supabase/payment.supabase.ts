import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type { PaymentPort, PixChargeResult } from '../ports/payment.port';
import type { AsyncCallOptions } from '../types';

/**
 * Story 7.2 (AC3) — primeira chamada a `supabase.functions.invoke` do
 * repositório (nenhum adapter existente usa Edge Functions antes desta
 * Story). Formato do supabase-js v2: `error` cobre falha de
 * rede/transporte e respostas HTTP não-2xx (`FunctionsHttpError`/
 * `FunctionsRelayError`/`FunctionsFetchError` — quando presente, `data`
 * normalmente é `null`); o corpo de erro estruturado que a própria Edge
 * Function devolve (`{ error: { code, message } }`, ver `index.ts`) chega
 * como o `data` de uma resposta 2xx OU como o payload que o SDK não
 * conseguiu classificar como sucesso — os dois casos são tratados aqui,
 * sempre lançando um `Error` com mensagem legível (nunca propagando o
 * objeto de erro cru do SDK), mesmo padrão de outros adapters supabase do
 * projeto (ver `order.supabase.ts`).
 */
type CreatePixPaymentResponseBody = {
  pedido_id: string;
  asaas_payment_id: string;
  qr_code_pix: string;
  pix_copia_e_cola: string;
};

type CreatePixPaymentErrorBody = {
  error: { code?: string; message: string };
};

function isErrorBody(data: unknown): data is CreatePixPaymentErrorBody {
  return !!data && typeof data === 'object' && 'error' in (data as Record<string, unknown>);
}

export function createPaymentSupabase(client?: SupabaseClient<Database>): PaymentPort {
  let cachedClient: SupabaseClient<Database> | null = client ?? null;
  const resolveClient = (): SupabaseClient<Database> => cachedClient ?? (cachedClient = createClient());

  return {
    async criarCobrancaPix(pedidoId: string, _options?: AsyncCallOptions): Promise<PixChargeResult> {
      const supabase = resolveClient();

      const { data, error } = await supabase.functions.invoke<CreatePixPaymentResponseBody | CreatePixPaymentErrorBody>(
        'create-pix-payment',
        { body: { pedido_id: pedidoId } },
      );

      if (error) {
        throw new Error(`[core-data/supabase] criarCobrancaPix falhou (pedido ${pedidoId}): ${error.message}`);
      }

      if (!data || isErrorBody(data)) {
        const message = isErrorBody(data)
          ? data.error.message
          : 'resposta vazia/inesperada da Edge Function create-pix-payment.';
        throw new Error(`[core-data/supabase] criarCobrancaPix falhou (pedido ${pedidoId}): ${message}`);
      }

      return {
        pedido_id: data.pedido_id,
        asaas_payment_id: data.asaas_payment_id,
        qr_code_pix: data.qr_code_pix,
        pix_copia_e_cola: data.pix_copia_e_cola,
      };
    },
  };
}
