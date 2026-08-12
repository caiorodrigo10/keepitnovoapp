/**
 * Validação de formato de CNPJ (dígito verificador) — Story 3.3 (AC1, AC3).
 *
 * [IDS] CREATE — nenhum utilitário de CNPJ existe hoje no repositório (Grep
 * em `apps/`/`packages/` não encontrou nenhum). Segue o mesmo padrão
 * local-por-app de `apps/lojista/src/lib/telefoneMask.ts` (Story 3.2):
 * função pura, síncrona, sem dependência de rede nem de nenhuma port do
 * `@keepit/core-data`. [AUTO-DECISION] Não promovido para
 * `packages/config` → (reason: aquele pacote é reservado a placeholders
 * financeiros/operacionais, ver JSDoc de `businessConfig` em
 * `packages/config/src/index.ts` — um algoritmo de validação não é um
 * "placeholder a fechar com o stakeholder", é lógica determinística. Se o
 * Admin (Story 3.7, exibição de dados do lojista) precisar do mesmo
 * algoritmo, extrair para um pacote compartilhado é decisão daquela Story —
 * não antecipada aqui, evita abstração prematura sobre um único
 * consumidor).
 *
 * Algoritmo padrão da Receita Federal: 2 dígitos verificadores calculados
 * por soma ponderada (módulo 11) sobre os 12 dígitos base do CNPJ.
 * [Source: docs/stories/3.3.story.md, AC1]
 */

const PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Remove qualquer caractere que não seja dígito (máscara, espaços, etc.). */
export function apenasDigitosCnpj(value: string): string {
  return value.replace(/\D/g, '');
}

function calcularDigitoVerificador(digitos: number[], pesos: number[]): number {
  const soma = digitos.reduce((acc, digito, index) => acc + digito * pesos[index], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * Valida um CNPJ (mascarado ou só dígitos) pelo algoritmo de dígito
 * verificador da Receita Federal — 2 checksums sobre os 12 dígitos base
 * (AC1). Rejeita:
 * - Qualquer entrada com menos/mais de 14 dígitos após remover a máscara.
 * - Os 14 dígitos repetidos (ex.: `"00000000000000"`, `"11111111111111"`)
 *   — esse padrão passa aritmeticamente no cálculo do DV (soma sempre
 *   múltipla do dígito repetido, resultando em DV=dígito repetido em vários
 *   casos, e DV=0 no caso de zeros), então precisa de rejeição explícita
 *   (Testing da Story 3.3, "dígitos repetidos que sempre falham").
 *
 * NÃO verifica situação cadastral (ativo/inativo na Receita) — isso é
 * conferência humana do Admin (AC5), fora do escopo desta função.
 */
export function isCnpjValido(value: string): boolean {
  const digitos = apenasDigitosCnpj(value);
  if (digitos.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digitos)) return false;

  const nums = digitos.split('').map(Number);
  const base12 = nums.slice(0, 12);
  const dv1 = calcularDigitoVerificador(base12, PESOS_DV1);
  const dv2 = calcularDigitoVerificador([...base12, dv1], PESOS_DV2);

  return nums[12] === dv1 && nums[13] === dv2;
}
