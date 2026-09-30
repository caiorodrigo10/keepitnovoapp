export type Centavos = number;
export interface Taxas {
  versao: string;
  comissaoBps: number;
  servicoCentavos: Centavos;
}
export type AlterarTaxasInput = Omit<Taxas, 'versao'> & {
  versaoEsperada: string; motivo: string; operacaoId: string;
};
export interface HistoricoTaxas {
  operacaoId: string;
  atorId: string;
  motivo: string;
  antes: Taxas;
  depois: Taxas;
  criadoEm: string;
}
export interface SettingsPort {
  getTaxas(): Promise<Taxas>;
  updateTaxas(input: AlterarTaxasInput): Promise<Taxas>;
  listHistoricoTaxas(): Promise<HistoricoTaxas[]>;
}
