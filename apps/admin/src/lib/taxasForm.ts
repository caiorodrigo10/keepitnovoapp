/** Percentual → bps e reais → centavos, uma única conversão decimal exata. */
export function parseTaxasForm(comissao: string, servico: string): { comissaoBps: number; servicoCentavos: number } {
  const parse = (text: string) => {
    const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(text.trim());
    if (!match) throw new Error('TAXAS_INVALIDAS: use valores não negativos com até duas casas decimais.');
    const value = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? '').padEnd(2, '0'));
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('TAXAS_INVALIDAS: valor muito alto.');
    return Number(value);
  };
  const comissaoBps = parse(comissao);
  if (comissaoBps > 10000) throw new Error('TAXAS_INVALIDAS: comissão deve estar entre 0 e 100%.');
  return { comissaoBps, servicoCentavos: parse(servico) };
}
