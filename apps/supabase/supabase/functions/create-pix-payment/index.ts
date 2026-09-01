/**
 * Entrypoint `Deno.serve` da Edge Function `create-pix-payment` — Story 7.2 (AC4).
 *
 * Fino de propósito: lê o body (`{ pedido_id }`), monta as dependências reais
 * (`resolveAsaasConfig` + `createAsaasClient`, Story 7.1; client Supabase real
 * com a `service_role` key), chama o handler puro (`handleCreatePixPayment`,
 * testado via Vitest em `handler.test.ts`) e traduz o resultado em uma
 * resposta HTTP. Este arquivo usa `Deno.serve`/`Deno.env` e por isso NÃO é
 * exercitado por Vitest (ver `_shared/deno-globals.d.ts` para a declaração
 * ambiente mínima que permite `tsc --noEmit` typechecar este arquivo sob
 * Node).
 *
 * Chamado pelo client (`packages/core-data/src/supabase/payment.supabase.ts`)
 * via `supabase.functions.invoke('create-pix-payment', { body: { pedido_id } })`
 * — DEPOIS que a RPC `criar_pedido`/`criar_pedido_com_ledger` já criou o
 * pedido (não integrado na RPC — RPCs Postgres não fazem chamada HTTP; ver
 * Dev Notes da Story 7.2).
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import { createAsaasClient } from '../_shared/asaas';
import { resolveAsaasConfig } from './config';
import { handleCreatePixPayment } from './handler';
import type { PedidoParaCobranca, PedidosRepo } from './handler';

type PedidoRow = {
  id: string;
  total_pago_reais: number;
  asaas_payment_id: string | null;
  qr_code_pix: string | null;
  pix_copia_e_cola: string | null;
  clientes: { nome: string; cpf: string | null } | null;
};

function createPedidosRepo(supabase: ReturnType<typeof createClient<Database>>): PedidosRepo {
  return {
    async getById(pedidoId: string): Promise<PedidoParaCobranca | null> {
      const { data, error } = await supabase
        .from('pedidos')
        .select('id, total_pago_reais, asaas_payment_id, qr_code_pix, pix_copia_e_cola, clientes(nome, cpf)')
        .eq('id', pedidoId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      const row = data as unknown as PedidoRow;
      return {
        id: row.id,
        cliente_nome: row.clientes?.nome ?? '',
        cliente_cpf: row.clientes?.cpf ?? null,
        total_pago_reais: row.total_pago_reais,
        asaas_payment_id: row.asaas_payment_id,
        qr_code_pix: row.qr_code_pix,
        pix_copia_e_cola: row.pix_copia_e_cola,
      };
    },

    async salvarCobrancaPix(pedidoId, fields): Promise<void> {
      const { error } = await supabase
        .from('pedidos')
        .update({
          asaas_payment_id: fields.asaas_payment_id,
          qr_code_pix: fields.qr_code_pix,
          pix_copia_e_cola: fields.pix_copia_e_cola,
        })
        .eq('id', pedidoId);

      if (error) {
        throw new Error(`[create-pix-payment] Falha ao persistir cobrança PIX do pedido ${pedidoId}: ${error.message}`);
      }
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  let body: { pedido_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: { code: 'BODY_INVALIDO', message: 'Body JSON inválido ou ausente.' } });
  }

  if (typeof body.pedido_id !== 'string' || body.pedido_id.trim() === '') {
    return jsonResponse(400, { error: { code: 'PEDIDO_ID_OBRIGATORIO', message: '`pedido_id` é obrigatório e deve ser string.' } });
  }

  const asaasConfig = resolveAsaasConfig({ get: (key: string) => Deno.env.get(key) });
  const asaasClient = createAsaasClient(asaasConfig);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result = await handleCreatePixPayment({ pedido_id: body.pedido_id }, { asaasClient, pedidos: createPedidosRepo(supabase) });

  if (result.ok) {
    return jsonResponse(200, {
      pedido_id: body.pedido_id,
      asaas_payment_id: result.data.asaas_payment_id,
      qr_code_pix: result.data.qr_code_pix,
      pix_copia_e_cola: result.data.pix_copia_e_cola,
    });
  }

  return jsonResponse(result.error.status, { error: { code: result.error.code, message: result.error.message } });
});
