import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import { createDataClient } from '../index';

type SavedCardsPortContract = {
  listar(): Promise<Array<{ id: string; bandeira: string; ultimo4: string; principal: boolean }>>;
  definirPrincipal(input: { cartaoId: string; operacaoId: string }): Promise<Array<{ id: string; bandeira: string; ultimo4: string; principal: boolean }>>;
  remover(input: { cartaoId: string; operacaoId: string }): Promise<Array<{ id: string; bandeira: string; ultimo4: string; principal: boolean }>>;
  consultarConfiguracao(): Promise<{ disponivel: boolean; valorCentavos: number }>;
  cadastrar(input: {
    operacaoId: string;
    cartao: { holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string };
    titular: { name: string; email: string; cpfCnpj: string; postalCode: string; addressNumber: string; phone: string };
  }): Promise<{ id: string; estado: string; valorCentavos: number }>;
  consultarCadastro(operacaoId: string): Promise<{ id: string; estado: string; valorCentavos: number } | null>;
};

function fakeClient() {
  const rpc = vi.fn();
  const invoke = vi.fn();
  return { client: { rpc, functions: { invoke } } as unknown as SupabaseClient<Database>, rpc, invoke };
}

describe('saved-cards.supabase (contract)', () => {
  it('usa somente a projeção pública nas RPCs de listagem e gestão', async () => {
    const { client, rpc } = fakeClient();
    rpc
      .mockResolvedValueOnce({ data: [{ id: 'card-a', bandeira: 'VISA', ultimo4: '4242', principal: true, created_at: '2026-01-01T00:00:00.000Z', asaas_credit_card_token: 'never-expose', asaas_customer_id: 'never-expose' }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'card-b', bandeira: 'MASTERCARD', ultimo4: '5555', principal: true, token: 'never-expose' }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const dataClient = createDataClient({ source: 'supabase', supabaseClient: client });
    const cards = (dataClient as unknown as { savedCards?: SavedCardsPortContract }).savedCards;

    expect(cards).toBeDefined();
    const listed = await cards!.listar();
    const selected = await cards!.definirPrincipal({ cartaoId: 'card-b', operacaoId: 'op-select' });
    await cards!.remover({ cartaoId: 'card-b', operacaoId: 'op-remove' });

    expect(listed).toEqual([{ id: 'card-a', bandeira: 'VISA', ultimo4: '4242', principal: true }]);
    expect(selected).toEqual([{ id: 'card-b', bandeira: 'MASTERCARD', ultimo4: '5555', principal: true }]);
    expect(rpc).toHaveBeenNthCalledWith(1, 'listar_cartoes_cliente');
    expect(rpc).toHaveBeenNthCalledWith(2, 'definir_cartao_principal', { p_cartao_id: 'card-b', p_operacao_id: 'op-select' });
    expect(rpc).toHaveBeenNthCalledWith(3, 'remover_cartao_cliente', { p_cartao_id: 'card-b', p_operacao_id: 'op-remove' });
  });

  it('usa tokenize-card estritamente para configuração e cadastro transitório', async () => {
    const { client, invoke, rpc } = fakeClient();
    invoke
      .mockResolvedValueOnce({ data: { disponivel: true, valorCentavos: 137, token: 'never-expose', customer: 'never-expose' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'operation-a', estado: 'validando', valorCentavos: 137, token: 'never-expose', customer: 'never-expose' }, error: null });
    rpc.mockResolvedValueOnce({ data: { id: 'operation-a', estado: 'estorno_pendente', valorCentavos: 137, token: 'never-expose', customer: 'never-expose' }, error: null });
    const cards = (createDataClient({ source: 'supabase', supabaseClient: client }) as unknown as { savedCards?: SavedCardsPortContract }).savedCards;
    const cartao = { holderName: 'Pessoa Teste', number: '4111111111111111', expiryMonth: '12', expiryYear: '2028', ccv: '123' };
    const titular = { name: 'Pessoa Teste', email: 'pessoa@example.invalid', cpfCnpj: '24971563792', postalCode: '89223005', addressNumber: '277', phone: '4738010919' };

    expect(cards).toBeDefined();
    expect(await cards!.consultarConfiguracao()).toEqual({ disponivel: true, valorCentavos: 137 });
    expect(await cards!.cadastrar({ operacaoId: 'operation-a', cartao, titular })).toEqual({ id: 'operation-a', estado: 'validando', valorCentavos: 137 });
    expect(await cards!.consultarCadastro('operation-a')).toEqual({ id: 'operation-a', estado: 'estorno_pendente', valorCentavos: 137 });
    expect(invoke).toHaveBeenNthCalledWith(1, 'tokenize-card', { body: { acao: 'configuracao' } });
    expect(invoke).toHaveBeenNthCalledWith(2, 'tokenize-card', { body: { acao: 'cadastrar', operacao_id: 'operation-a', cartao, titular } });
    expect(rpc).toHaveBeenCalledWith('consultar_cadastro_cartao', { p_operacao_id: 'operation-a' });
  });

  it('rejeita respostas malformadas sem propagar campos secretos', async () => {
    const { client, rpc } = fakeClient();
    rpc.mockResolvedValue({ data: [{ id: 'card-a', bandeira: 'VISA', ultimo4: 4242, principal: true, token: 'never-expose' }], error: null });
    const cards = (createDataClient({ source: 'supabase', supabaseClient: client }) as unknown as { savedCards?: SavedCardsPortContract }).savedCards;

    expect(cards).toBeDefined();
    await expect(cards!.listar()).rejects.toThrow('RESPOSTA_INVALIDA');
  });

  it('rejeita um ultimo4 que poderia conter PAN inteiro', async () => {
    const { client, rpc } = fakeClient();
    rpc.mockResolvedValue({ data: [{ id: 'card-a', bandeira: 'VISA', ultimo4: '4111111111111111', principal: true }], error: null });
    const cards = (createDataClient({ source: 'supabase', supabaseClient: client }) as unknown as { savedCards?: SavedCardsPortContract }).savedCards;

    expect(cards).toBeDefined();
    await expect(cards!.listar()).rejects.toThrow('RESPOSTA_INVALIDA');
  });

  it('descarta campos extras do formulário antes de chamar tokenize-card', async () => {
    const { client, invoke } = fakeClient();
    invoke.mockResolvedValue({ data: { id: 'operation-a', estado: 'validando', valorCentavos: 137 }, error: null });
    const cards = (createDataClient({ source: 'supabase', supabaseClient: client }) as unknown as { savedCards?: SavedCardsPortContract }).savedCards;
    const cartao = { holderName: 'Pessoa Teste', number: '4111111111111111', expiryMonth: '12', expiryYear: '2028', ccv: '123', token: 'never-send' };
    const titular = { name: 'Pessoa Teste', email: 'pessoa@example.invalid', cpfCnpj: '24971563792', postalCode: '89223005', addressNumber: '277', phone: '4738010919', customer: 'never-send' };

    expect(cards).toBeDefined();
    await cards!.cadastrar({ operacaoId: 'operation-a', cartao: cartao as never, titular: titular as never });

    expect(invoke).toHaveBeenCalledWith('tokenize-card', {
      body: {
        acao: 'cadastrar',
        operacao_id: 'operation-a',
        cartao: { holderName: 'Pessoa Teste', number: '4111111111111111', expiryMonth: '12', expiryYear: '2028', ccv: '123' },
        titular: { name: 'Pessoa Teste', email: 'pessoa@example.invalid', cpfCnpj: '24971563792', postalCode: '89223005', addressNumber: '277', phone: '4738010919' },
      },
    });
  });
});
