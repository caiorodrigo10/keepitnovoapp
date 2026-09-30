import type { Cotacao } from './ports/checkout.port';
import type { HistoricoTaxas, Taxas } from './ports/settings.port';

function invalid(): never { throw new Error('RESPOSTA_INVALIDA'); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return invalid();
  return value;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}
export function parseTaxas(value: unknown): Taxas {
  const v = record(value);
  const taxas = { versao: string(v.versao), comissaoBps: integer(v.comissaoBps), servicoCentavos: integer(v.servicoCentavos) };
  if (taxas.comissaoBps > 10000) return invalid();
  return taxas;
}
export function parseCotacao(value: unknown): Cotacao {
  const v = record(value);
  const cotacao = {
    id: string(v.id), taxas: parseTaxas(v.taxas), subtotalCentavos: integer(v.subtotalCentavos),
    freteCentavos: integer(v.freteCentavos), comissaoCentavos: integer(v.comissaoCentavos),
    totalCentavos: integer(v.totalCentavos), liquidoLojistaCentavos: integer(v.liquidoLojistaCentavos),
  };
  const sub = BigInt(cotacao.subtotalCentavos);
  const frete = BigInt(cotacao.freteCentavos);
  const comissao = (sub * BigInt(cotacao.taxas.comissaoBps) + BigInt(5000)) / BigInt(10000);
  if (BigInt(cotacao.comissaoCentavos) !== comissao || BigInt(cotacao.totalCentavos) !== sub + frete + BigInt(cotacao.taxas.servicoCentavos)
    || BigInt(cotacao.liquidoLojistaCentavos) !== sub - comissao + frete) return invalid();
  return cotacao;
}
export function parseHistoricoTaxas(value: unknown): HistoricoTaxas[] {
  if (!Array.isArray(value)) return invalid();
  return value.map((entry) => {
    const v = record(entry);
    return { operacaoId: string(v.operacaoId), atorId: string(v.atorId), motivo: string(v.motivo),
      criadoEm: string(v.criadoEm), antes: parseTaxas(v.antes), depois: parseTaxas(v.depois) };
  });
}
