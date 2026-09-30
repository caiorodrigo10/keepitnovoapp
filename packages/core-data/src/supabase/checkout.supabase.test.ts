import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createCheckoutSupabase } from './checkout.supabase';
const input = { estabelecimentoId: 'loja', hubId: 'hub', itens: [{ produtoId: 'produto', quantidade: 1 }] };
const cotacao = { id: 'cotacao', taxas: { versao: 'v1', comissaoBps: 1000, servicoCentavos: 290 }, subtotalCentavos: 10000, freteCentavos: 500, comissaoCentavos: 1000, totalCentavos: 10790, liquidoLojistaCentavos: 9500 };
function setup(data: unknown = cotacao, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { rpc, checkout: createCheckoutSupabase({ rpc } as unknown as SupabaseClient<Database>) };
}
describe('checkout Supabase', () => {
  it('envia só identificadores e quantidades; exibe os valores do servidor', async () => {
    const { checkout, rpc } = setup();
    expect(await checkout.cotar({ ...input, totalCentavos: 1 } as typeof input)).toEqual(cotacao);
    expect(rpc).toHaveBeenCalledWith('cotar_pedido', { p_estabelecimento_id: 'loja', p_hub_id: 'hub', p_itens: [{ produtoId: 'produto', quantidade: 1 }] });
  });
  it('propaga falha sem calcular cotação fictícia', async () => {
    const error = { message: 'LOJA_INDISPONIVEL' };
    await expect(setup(null,error).checkout.cotar(input)).rejects.toBe(error);
  });
  it.each([null, { ...cotacao, totalCentavos: 107.9 }, { ...cotacao, totalCentavos: 1 }])('rejeita resposta financeira malformada', async (data) => {
    await expect(setup(data).checkout.cotar(input)).rejects.toThrow('RESPOSTA_INVALIDA');
  });
  it('cria somente a partir da cotação e conserva identidade da operação', async () => {
    const { checkout, rpc } = setup({ pedidoId: 'pedido' });
    expect(await checkout.criar({ cotacaoId: 'cotacao', forma: 'pix', nfSolicitada: false, operacaoId: 'op' })).toEqual({ pedidoId: 'pedido' });
    expect(rpc).toHaveBeenCalledWith('criar_pedido_cotado', { p_cotacao_id: 'cotacao', p_forma: 'pix', p_nf_solicitada: false, p_operacao_id: 'op' });
  });
});
