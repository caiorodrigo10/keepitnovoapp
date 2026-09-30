import { initialTaxas } from '@keepit/config';
import type { HistoricoTaxas, SettingsPort, Taxas } from '../ports/settings.port';
import { generateMockId as mockId } from './async-helpers';

/** Administração fictícia exclusiva do datasource demo, como as demais ports Admin mock. */
export function createSettingsMock(): SettingsPort {
  let taxas: Taxas = { versao: mockId('taxas'), ...initialTaxas };
  const historico: HistoricoTaxas[] = [];
  return {
    async getTaxas() { return { ...taxas }; },
    async updateTaxas(input) {
      if (!Number.isInteger(input.comissaoBps) || input.comissaoBps < 0 || input.comissaoBps > 10000
        || !Number.isSafeInteger(input.servicoCentavos) || input.servicoCentavos < 0
        || !input.versaoEsperada || !input.operacaoId || !input.motivo.trim() || input.motivo.trim().length > 1000) throw new Error('TAXAS_INVALIDAS');
      const retry = historico.find((h) => h.operacaoId === input.operacaoId);
      if (retry) {
        if (retry.antes.versao !== input.versaoEsperada || retry.motivo !== input.motivo.trim()
          || retry.depois.comissaoBps !== input.comissaoBps || retry.depois.servicoCentavos !== input.servicoCentavos) throw new Error('OPERACAO_CONFLITANTE');
        return { ...retry.depois };
      }
      if (taxas.versao !== input.versaoEsperada) throw new Error('VERSAO_CONFLITANTE');
      const antes = { ...taxas };
      taxas = { versao: mockId('taxas'), comissaoBps: input.comissaoBps, servicoCentavos: input.servicoCentavos };
      historico.unshift({ operacaoId: input.operacaoId, atorId: 'admin-demo', motivo: input.motivo.trim(), antes, depois: { ...taxas }, criadoEm: new Date().toISOString() });
      return { ...taxas };
    },
    async listHistoricoTaxas() { return historico.map((h) => ({ ...h, antes: { ...h.antes }, depois: { ...h.depois } })); },
  };
}
