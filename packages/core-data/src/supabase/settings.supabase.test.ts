import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createSettingsSupabase } from './settings.supabase';
const taxas = { versao: 'versao-1', comissaoBps: 1000, servicoCentavos: 290 };
function setup(data: unknown = taxas, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { rpc, settings: createSettingsSupabase({ rpc } as unknown as SupabaseClient<Database>) };
}
describe('settings Supabase', () => {
  it('lê taxas persistidas sem defaults', async () => {
    const { settings, rpc } = setup();
    expect(await settings.getTaxas()).toEqual(taxas);
    expect(rpc).toHaveBeenCalledWith('obter_taxas');
  });
  it('envia versão, motivo e operação para atualização', async () => {
    const { settings, rpc } = setup();
    await settings.updateTaxas({ comissaoBps: 1000, servicoCentavos: 290, versaoEsperada: 'v0', motivo: 'Ajuste', operacaoId: 'op' });
    expect(rpc).toHaveBeenCalledWith('alterar_taxas', { p_comissao_bps: 1000, p_servico_centavos: 290, p_versao_esperada: 'v0', p_motivo: 'Ajuste', p_operacao_id: 'op' });
  });
  it.each(['VERSAO_CONFLITANTE', 'ACESSO_NEGADO', 'network'])('propaga %s sem fallback', async (message) => {
    const error = { message }; const { settings } = setup(null,error);
    await expect(settings.updateTaxas({ ...taxas, versaoEsperada: 'v0', motivo: 'Ajuste', operacaoId: 'op' })).rejects.toBe(error);
  });
  it.each([null, { ...taxas, servicoCentavos: 2.9 }, { ...taxas, comissaoBps: 10001 }])('recusa taxa malformada', async (data) => {
    await expect(setup(data).settings.getTaxas()).rejects.toThrow('RESPOSTA_INVALIDA');
  });
  it('lê histórico autorizado', async () => {
    const history = [{ operacaoId: 'op', atorId: 'admin', motivo: 'Ajuste', criadoEm: '2026-09-30T12:00:00Z', antes: taxas, depois: { ...taxas, versao: 'v2' } }];
    expect(await setup(history).settings.listHistoricoTaxas()).toEqual(history);
  });
});
