/**
 * Formatação monetária/percentual do domínio Financeiro — Story 0.11.
 *
 * [IDS] CREATE: `statusMeta.ts#formatReais` (Story 0.10) não usa separador de
 * milhar (`R$ 12480,00`), insuficiente para os valores desta story (protótipo
 * mostra `R$ 12.480`). `Intl.NumberFormat('pt-BR', ...)` cobre milhar + vírgula
 * decimal corretamente, sem depender de nenhuma lib nova.
 */
const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** `R$ 4.820,50` — formatação padrão BRL desta story. */
export function formatBRL(valueReais: number): string {
  return currencyFormatter.format(valueReais);
}

/** `+ R$ 4.820,50` / `− R$ 5.200,00` — usado nas linhas de "Saques recentes"/"Movimentações". */
export function formatBRLSigned(valueReais: number): string {
  const abs = Math.abs(valueReais);
  const sign = valueReais < 0 ? '−' : '+';
  return `${sign} ${formatBRL(abs)}`;
}

/** `12%` / `8,4%` — variação percentual (já com sinal aplicado via prefixo no componente). */
export function formatPercent(valuePercent: number): string {
  const rounded = Math.round(valuePercent * 10) / 10;
  return `${rounded.toString().replace('.', ',')}%`;
}

/** `18 jun`, `10 jun` — a partir de um ISO date, mês abreviado em pt-BR. */
export function formatDataCurta(isoDate: string): string {
  const date = new Date(isoDate);
  const dia = date.getUTCDate();
  const mes = date.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '');
  return `${dia} ${mes}`;
}
