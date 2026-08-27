/**
 * Entrypoint `Deno.serve` da Edge Function `asaas-payment-webhook` — Story 7.5
 * (AC1, AC3).
 *
 * Fino de propósito: lê o header `asaas-access-token` e o body JSON da
 * requisição, lê `ASAAS_WEBHOOK_TOKEN`/`SUPABASE_URL`/
 * `SUPABASE_SERVICE_ROLE_KEY` de `Deno.env`, monta um client Supabase real
 * com a `service_role` key, implementa o repositório injetado chamando a RPC
 * `confirmar_pagamento_pedido` via `supabase.rpc(...)`, chama o handler puro
 * (`handleAsaasWebhook`, testado via Vitest em `handler.test.ts`) e traduz o
 * resultado em uma resposta HTTP. Este arquivo usa `Deno.serve`/`Deno.env` e
 * por isso NÃO é exercitado por Vitest (ver `_shared/deno-globals.d.ts` para
 * a declaração ambiente mínima que permite `tsc --noEmit` typechecar este
 * arquivo sob Node).
 *
 * Diferente da 7.2, não há `config.ts` dedicado nesta Story — não há lógica
 * condicional de derivação (só leituras diretas de env), então essas
 * leituras ficam direto aqui.
 *
 * `apps/supabase/supabase/config.toml` tem `[functions.asaas-payment-webhook]`
 * com `verify_jwt = false` — o Asaas não envia nenhum JWT do Supabase, só
 * este header próprio, validado dentro do handler (AC2).
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import { handleAsaasWebhook } from './handler';
import type { PagamentosRepo, ResultadoConfirmacao } from './handler';

function createPagamentosRepo(supabase: ReturnType<typeof createClient<Database>>): PagamentosRepo {
  return {
    async confirmarPagamento({ asaasPaymentId, externalReference }) {
      const { data, error } = await supabase.rpc('confirmar_pagamento_pedido', {
        p_asaas_payment_id: asaasPaymentId,
        p_external_reference: externalReference,
      });
      if (error) {
        throw new Error(`[asaas-payment-webhook] RPC confirmar_pagamento_pedido falhou: ${error.message}`);
      }
      const row = data?.[0];
      return {
        resultado: (row?.resultado ?? 'pedido_nao_encontrado') as ResultadoConfirmacao,
        pedidoId: row?.pedido_id ?? null,
      };
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const headerToken = req.headers.get('asaas-access-token');
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    /* handler trata payload inválido (body permanece null → payload_invalido) */
  }

  const webhookToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result = await handleAsaasWebhook(
    { headerToken, body },
    { webhookToken, pedidos: createPagamentosRepo(supabase) },
  );

  return jsonResponse(result.status, result.body);
});
