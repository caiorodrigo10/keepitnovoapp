import { createClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import { handleAsaasWebhook } from './handler.ts';
import type { PagamentosRepo } from './handler.ts';

type EventRpcRow = { resultado?: string; pedido_id?: string | null };
type EventRpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{
    data: EventRpcRow[] | EventRpcRow | null;
    error: { message: string } | null;
  }>;
};

function firstRow(data: EventRpcRow[] | EventRpcRow | null): EventRpcRow {
  return Array.isArray(data) ? data[0] ?? {} : data ?? {};
}

function createPagamentosRepo(supabase: ReturnType<typeof createClient<Database>>): PagamentosRepo {
  const rpc = supabase as unknown as EventRpcClient;
  return {
    async processRefundEvent(input) {
      const { data, error } = await rpc.rpc('processar_evento_reembolso', {
        p_evento_id: input.eventId,
        p_evento: input.event,
        p_cobranca_id: input.paymentId,
        p_reembolso_id: input.refundId,
        p_valor_centavos: input.valueCents,
        p_metodo: input.method,
        p_referencia: input.reference,
      });
      if (error) throw new Error('PROCESSAMENTO_REEMBOLSO_FALHOU');
      const row = firstRow(data);
      return { resultado: row.resultado ?? 'erro_persistencia', pedidoId: row.pedido_id ?? null };
    },
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
      const row = firstRow(data);
      return { resultado: row.resultado ?? 'erro_persistencia', pedidoId: row.pedido_id ?? null };
    },
    async processAnticipationEvent(input) {
      const { data, error } = await rpc.rpc('processar_evento_antecipacao', {
        p_evento_id: input.eventId,
        p_evento: input.event,
        p_antecipacao_id: input.anticipationId,
        p_cobranca_id: input.paymentId,
        p_estado: input.status,
        p_valor_centavos: input.grossValueCents,
        p_tarifa_centavos: input.feeCents,
        p_liquido_centavos: input.netValueCents,
        p_data_credito: input.creditDate,
        p_motivo_negacao: input.denialReason,
      });
      if (error) throw new Error('PROCESSAMENTO_ANTECIPACAO_FALHOU');
      const row = firstRow(data);
      return { resultado: row.resultado ?? 'erro_persistencia', pedidoId: row.pedido_id ?? null };
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const headerToken = req.headers.get('asaas-access-token');
  let body: unknown = null;
  try { body = await req.json(); } catch { /* payload inválido é tratado pelo handler */ }

  const supabase = createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const result = await handleAsaasWebhook(
    { headerToken, body },
    {
      webhookToken: Deno.env.get('ASAAS_WEBHOOK_TOKEN') ?? '',
      pagamentos: createPagamentosRepo(supabase),
    },
  );
  return jsonResponse(result.status, result.body);
});
