import { describe, expect, it } from 'vitest';
import { createSettingsMock } from './settings.mock';
describe('settings demo', () => {
  it('versiona, audita e deduplica; estado retornado não muta o armazenamento', async () => {
    const settings = createSettingsMock();
    const antes = await settings.getTaxas();
    const input = { comissaoBps: 1234, servicoCentavos: 567, versaoEsperada: antes.versao, motivo: 'Ajuste', operacaoId: 'op' };
    const depois = await settings.updateTaxas(input);
    expect(depois).toMatchObject({ comissaoBps: 1234, servicoCentavos: 567 });
    expect(depois.versao).not.toBe(antes.versao);
    expect(await settings.updateTaxas(input)).toEqual(depois);
    await expect(settings.updateTaxas({ ...input, servicoCentavos: 568 })).rejects.toThrow('OPERACAO_CONFLITANTE');
    await expect(settings.updateTaxas({ ...input, operacaoId: 'op2' })).rejects.toThrow('VERSAO_CONFLITANTE');
    expect(await settings.listHistoricoTaxas()).toEqual([expect.objectContaining({ antes, depois, motivo: 'Ajuste' })]);
    depois.comissaoBps = 9999;
    expect((await settings.getTaxas()).comissaoBps).toBe(1234);
  });
  it.each([{ comissaoBps: -1 }, { comissaoBps: 10001 }, { servicoCentavos: 2.9 }, { servicoCentavos: -1 }, { motivo: ' ' }])('valida entrada %j', async (invalid) => {
    const settings = createSettingsMock();
    await expect(settings.updateTaxas({ comissaoBps: 1000, servicoCentavos: 290, versaoEsperada: (await settings.getTaxas()).versao, motivo: 'Teste', operacaoId: 'op', ...invalid })).rejects.toThrow('TAXAS_INVALIDAS');
  });
});
