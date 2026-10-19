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
    expect(invoke).toHaveBeenCalledWith('create-pix-payment', { body: { pedido_id: 'pedido-1', operacao_id: 'pedido-1' } });
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

it('iniciarPix conserva operação e recebe estado pendente sem confirmar pedido', async () => {
  const tentativa = { id: 'tentativa', pedidoId: 'pedido-1', estado: 'pendente' };
  const { client, invoke } = fakeClient({ data: { ...SUCESSO, tentativa }, error: null });
  expect(await createPaymentSupabase(client).iniciarPix({ pedidoId: 'pedido-1', operacaoId: 'op-estavel' })).toEqual(tentativa);
  expect(invoke).toHaveBeenCalledWith('create-pix-payment', { body: { pedido_id: 'pedido-1', operacao_id: 'op-estavel' } });
});
it('consultar lê projeção autorizada e não inicia cobrança', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  expect(await createPaymentSupabase({ rpc } as unknown as SupabaseClient<Database>).consultar('pedido')).toBeNull();
  expect(rpc).toHaveBeenCalledWith('consultar_tentativa_pagamento', { p_pedido_id: 'pedido' });
});

it('encerramento pede confirmação ao servidor com identidade estável', async () => {
  const tentativa = { id: 'tentativa', pedidoId: 'pedido', estado: 'expirado' };
  const { client, invoke } = fakeClient({ data: { tentativa }, error: null });
  expect(await createPaymentSupabase(client).encerrarTentativa({ tentativaId: 'tentativa', operacaoId: 'encerrar-op' })).toEqual(tentativa);
  expect(invoke).toHaveBeenCalledWith('close-payment-attempt', { body: { tentativa_id: 'tentativa', operacao_id: 'encerrar-op' } });
});
it('falha de encerramento não é convertida em tentativa encerrada', async () => {
  const { client } = fakeClient({ data: { error: { code: 'PAGAMENTO_RECONCILIACAO', message: 'Aguarde a conciliação.' } }, error: null });
  await expect(createPaymentSupabase(client).encerrarTentativa({ tentativaId: 'tentativa', operacaoId: 'encerrar-op' })).rejects.toThrow('conciliação');
});

it('cartão envia apenas credenciais transitórias e IDs, devolvendo projeção segura', async () => {
  const tentativa = { id: 'attempt', pedidoId: 'order', estado: 'pendente', creditCard: { number: 'must-not-escape' }, claim_token: 'private' };
  const { client, invoke } = fakeClient({ data: { tentativa }, error: null });
  const cartao = { holderName: 'Teste', number: '4444444444444444', expiryMonth: '12', expiryYear: '2028', ccv: '123' };
  const titular = { name: 'Teste', email: 'test@example.invalid', cpfCnpj: '24971563792', postalCode: '89223005', addressNumber: '277', phone: '4738010919' };
  const result = await createPaymentSupabase(client).pagarCartao({ pedidoId: 'order', operacaoId: 'operation', cartao, titular, salvarCartao: true });
  expect(result).toEqual({ id: 'attempt', pedidoId: 'order', estado: 'pendente' });
  expect(invoke).toHaveBeenCalledWith('create-card-payment', { body: { pedido_id: 'order', operacao_id: 'operation', cartao, titular, salvar_cartao: true } });
});
it('cartão salvo envia somente seu ID e a identidade da compra', async () => {
  const tentativa = { id: 'attempt', pedidoId: 'order', estado: 'pendente' };
  const { client, invoke } = fakeClient({ data: { tentativa }, error: null });
  await expect(createPaymentSupabase(client).pagarCartao({ pedidoId: 'order', operacaoId: 'operation', cartaoSalvoId: 'card-a' } as never)).resolves.toEqual(tentativa);
  expect(invoke).toHaveBeenCalledWith('create-card-payment', { body: { pedido_id: 'order', operacao_id: 'operation', cartao_salvo_id: 'card-a' } });
});
it('preserva apenas o código permitido de uma resposta não-2xx do cartão', async () => {
  const response = new Response(JSON.stringify({ error: { code: 'PAGAMENTO_RECUSADO', message: 'mensagem externa que não pode vazar', details: 'segredo' } }), { status: 422 });
  const { client } = fakeClient({ data: null, error: { message: 'transporte', context: response } });
  await expect(createPaymentSupabase(client).pagarCartao({ pedidoId: 'order', operacaoId: 'operation', cartaoSalvoId: 'card-a' } as never)).rejects.toMatchObject({ code: 'PAGAMENTO_RECUSADO', message: 'Cartão recusado. Escolha outro cartão ou pague com Pix.' });
});
it.each([
  { data: null, error: { context: new Response(JSON.stringify({ error: { code: 'CARD_TOKENIZATION_DISABLED' } }), { status: 503 }) } },
  { data: { error: { code: 'CARD_TOKENIZATION_DISABLED' } }, error: null },
])('preserva código de feature indisponível vindo do HTTP', async (invokeResult) => {
  const { client } = fakeClient(invokeResult);
  await expect(createPaymentSupabase(client).pagarCartao({ pedidoId: 'pedido-1', operacaoId: 'op-1', cartaoSalvoId: 'card-1' } as never))
    .rejects.toMatchObject({
      code: 'CARD_TOKENIZATION_DISABLED',
      message: 'Cartões salvos estão temporariamente indisponíveis. Digite os dados do cartão sem salvar ou use Pix.',
    });
});
it('converte falha de cartão desconhecida em indisponibilidade local sem detalhes externos', async () => {
  const response = new Response(JSON.stringify({ error: { code: 'QUALQUER_COISA', message: 'detalhe externo', details: 'segredo' } }), { status: 500 });
  const { client } = fakeClient({ data: null, error: { message: 'detalhe externo', context: response } });
  await expect(createPaymentSupabase(client).pagarCartao({ pedidoId: 'order', operacaoId: 'operation', cartaoSalvoId: 'card-a' } as never)).rejects.toMatchObject({ code: 'CARTAO_INDISPONIVEL', message: 'Este cartão não está disponível. Escolha outra forma de pagamento.' });
});
it('preserva aviso nao_salvo como resultado financeiro válido', async () => {
  const tentativa = { id: 'attempt', pedidoId: 'order', estado: 'pendente', avisoCartao: 'nao_salvo' };
  const { client } = fakeClient({ data: { tentativa }, error: null });
  await expect(createPaymentSupabase(client).pagarCartao({ pedidoId: 'order', operacaoId: 'operation', cartaoSalvoId: 'card-a' } as never)).resolves.toEqual(tentativa);
});
it('rejeita projeção de tentativa com campos públicos opcionais inválidos', async () => {
  const tentativa = { id: 'attempt', pedidoId: 'order', estado: 'pendente', operacaoId: 3, avisoCartao: 'vaza', pix: { imagemBase64: 'qr', copiaCola: 'copy', expiraEm: 3 } };
  const { client } = fakeClient({ data: { tentativa }, error: null });
  await expect(createPaymentSupabase(client).pagarCartao({ pedidoId: 'order', operacaoId: 'operation', cartaoSalvoId: 'card-a' } as never)).rejects.toThrow('RESPOSTA_INVALIDA');
});
it('cartão nunca repassa mensagens de exceção do transporte contendo PAN/CVV', async () => {
  const leak = '4444444444444444 ccv=123';
  const { client } = fakeClient({ data: null, error: { message: leak } });
  await expect(createPaymentSupabase(client).pagarCartao({ pedidoId: 'order', operacaoId: 'operation', cartao: {} as never, titular: {} as never })).rejects.toMatchObject({ code: 'CARTAO_INDISPONIVEL', message: 'Este cartão não está disponível. Escolha outra forma de pagamento.' });
});

it('consulta conserva identidade de operação necessária à retomada', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { id: 'attempt', pedidoId: 'order', operacaoId: 'operation-second', estado: 'pendente' }, error: null });
  expect(await createPaymentSupabase({ rpc } as unknown as SupabaseClient<Database>).consultar('order')).toEqual({ id: 'attempt', pedidoId: 'order', operacaoId: 'operation-second', estado: 'pendente' });
});
