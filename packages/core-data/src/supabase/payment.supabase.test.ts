import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import { createPaymentSupabase } from './payment.supabase';

/**
 * Story 7.2 — [IDS] ADAPT do padrão de client fake já estabelecido em
 * `wallet.supabase.test.ts`, estendido com `functions.invoke` (primeira
 * chamada a Edge Function do repositório — sem precedente de fake para essa
 * superfície do SDK antes desta Story).
 */
function fakeClient(invokeResult: { data: unknown; error: unknown }) {
  const invoke = vi.fn(async (_name: string, _options: unknown) => invokeResult);
  const client = { functions: { invoke } } as unknown as SupabaseClient<Database>;
  return { client, invoke };
}

const SUCESSO = {
  pedido_id: 'pedido-1',
  asaas_payment_id: 'pay_456',
  qr_code_pix: 'base64-qr',
  pix_copia_e_cola: '000201-copia-cola',
};

describe('payment.supabase (contract) — Story 7.2', () => {
  it('sucesso: retorna o PixChargeResult do corpo da resposta', async () => {
    const { client, invoke } = fakeClient({ data: SUCESSO, error: null });
    const port = createPaymentSupabase(client);

    const resultado = await port.criarCobrancaPix('pedido-1');

    expect(resultado).toEqual(SUCESSO);
    expect(invoke).toHaveBeenCalledWith('create-pix-payment', { body: { pedido_id: 'pedido-1' } });
  });

  it('erro do SDK (`error` truthy — rede/HTTP não-2xx): lança Error com mensagem legível', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'Edge Function retornou 502' } });
    const port = createPaymentSupabase(client);

    await expect(port.criarCobrancaPix('pedido-1')).rejects.toThrow(/Edge Function retornou 502/);
  });

  it('erro estruturado no corpo (`data: { error: {...} }`): lança Error com a mensagem do corpo', async () => {
    const { client } = fakeClient({
      data: { error: { code: 'CLIENTE_SEM_CPF', message: 'cliente sem CPF cadastrado' } },
      error: null,
    });
    const port = createPaymentSupabase(client);

    await expect(port.criarCobrancaPix('pedido-1')).rejects.toThrow(/cliente sem CPF cadastrado/);
  });

  it('resposta vazia (sem error e sem data): lança Error descritivo', async () => {
    const { client } = fakeClient({ data: null, error: null });
    const port = createPaymentSupabase(client);

    await expect(port.criarCobrancaPix('pedido-1')).rejects.toThrow(/resposta vazia/);
  });
});
