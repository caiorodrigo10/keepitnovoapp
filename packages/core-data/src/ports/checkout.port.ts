import type { Centavos, Taxas } from './settings.port';
export type Forma = 'pix' | 'cartao';
export interface Cotacao {
  id: string;
  taxas: Taxas;
  subtotalCentavos: Centavos;
  freteCentavos: Centavos;
  comissaoCentavos: Centavos;
  totalCentavos: Centavos;
  liquidoLojistaCentavos: Centavos;
}
export interface CotacaoInput {
  estabelecimentoId: string;
  hubId: string;
  itens: Array<{ produtoId: string; quantidade: number }>;
}
export interface CheckoutPort {
  cotar(input: CotacaoInput): Promise<Cotacao>;
  criar(input: { cotacaoId: string; forma: Forma; nfSolicitada: boolean; operacaoId: string }): Promise<{ pedidoId: string }>;
}
