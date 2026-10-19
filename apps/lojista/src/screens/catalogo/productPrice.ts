/**
 * Converte a entrada do preço para reais sem perder os centavos. Uma sequência
 * só de dígitos vem do teclado numérico e representa centavos; entrada com
 * vírgula ou ponto mantém a parte decimal que o lojista informou. Texto já
 * mascarado em pt-BR ("1.234,56", bug O2) tem os pontos de milhar removidos
 * antes da conversão.
 */
export function parseProductPrice(text: string): number {
  const value = text.trim().replace(/^R\$\s*/, "");

  // Milhar sem centavos ("1.234"): separador de milhar, não decimal.
  if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) {
    const centavos = BigInt(value.replace(/\./g, "")) * 100n;
    if (centavos > BigInt(Number.MAX_SAFE_INTEGER)) return Number.NaN;
    return Number(centavos) / 100;
  }

  const semMilhar = value.includes(",") ? value.replace(/\./g, "") : value;
  const match = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(semMilhar);
  if (!match) return Number.NaN;

  const centavos = match[2] === undefined
    ? BigInt(match[1])
    : BigInt(match[1]) * 100n + BigInt(match[2].padEnd(2, "0"));

  if (centavos > BigInt(Number.MAX_SAFE_INTEGER)) return Number.NaN;
  return Number(centavos) / 100;
}

/**
 * Máscara do campo "Preço (R$)" durante a digitação (bug O2): só os dígitos
 * contam e são interpretados como centavos (mesma semântica do
 * `parseProductPrice` para dígitos puros), exibidos em pt-BR com separador
 * de milhar e vírgula decimal — digitar 1599 mostra "15,99". O rótulo do
 * campo já traz "R$", por isso a máscara não repete o prefixo (mesmo padrão
 * do placeholder "0,00"). Campo vazio continua vazio; no máximo 12 dígitos
 * (R$ 9.999.999.999,99) — teclas além disso são ignoradas.
 */
export function formatProductPriceInput(text: string): string {
  const digits = text.replace(/\D/g, "").slice(0, 12);
  if (!digits) return "";

  const centavos = BigInt(digits);
  const reais = (centavos / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cents = (centavos % 100n).toString().padStart(2, "0");
  return `${reais},${cents}`;
}
