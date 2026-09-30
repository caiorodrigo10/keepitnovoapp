import { describe, expect, it } from 'vitest';
import { parseTaxasForm } from './taxasForm';
describe('formulário de taxas', () => {
  it.each([
    ['10','2,90',{ comissaoBps: 1000, servicoCentavos: 290 }],
    ['12,34','0.05',{ comissaoBps: 1234, servicoCentavos: 5 }],
    ['100.00','0',{ comissaoBps: 10000, servicoCentavos: 0 }],
    ['0','0,29',{ comissaoBps: 0, servicoCentavos: 29 }],
  ])('converte uma vez %s%% e R$ %s sem erro decimal', (comissao,servico,expected) => {
    expect(parseTaxasForm(comissao,servico)).toEqual(expected);
  });
  it.each([['100.01','1'],['-1','1'],['10','-1'],['10','2,999'],['','2'],['10','1e2'],['10','1.000,00'],['10','90071992547409.92']])('rejeita limites/precisão/ambiguidade %s %s', (comissao,servico) => {
    expect(() => parseTaxasForm(comissao,servico)).toThrow('TAXAS_INVALIDAS');
  });
});
