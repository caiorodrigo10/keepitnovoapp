/**
 * Validação de formato de CPF (dígito verificador) — Story 6.5 (AC2).
 *
 * [IDS] ADAPT do precedente EXATO já existente no monorepo:
 * `apps/lojista/src/lib/cnpj.ts` (`isCnpjValido`, Story 3.3) — mesmo
 * algoritmo padrão da Receita Federal (módulo 11), mesma decisão de
 * localização ("não promovido para `packages/config` — é algoritmo
 * determinístico, não placeholder de negócio", ver JSDoc de
 * `businessConfig` em `packages/config/src/index.ts`), mesmo padrão de
 * rejeição de sequências repetidas. Fica em `apps/cliente/src/lib/`
 * (único consumidor hoje é `ModalCPF.tsx`), mesma decisão local-por-app já
 * tomada para CNPJ.
 *
 * Algoritmo: 2 dígitos verificadores calculados por soma ponderada
 * (módulo 11) sobre os 9 dígitos base do CPF. [Source: docs/stories/6.5.story.md, AC2]
 */

const PESOS_DV1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DV2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

/** Remove qualquer caractere que não seja dígito (máscara, espaços, etc.). */
export function apenasDigitosCpf(value: string): string {
  return value.replace(/\D/g, '');
}

function calcularDigitoVerificador(digitos: number[], pesos: number[]): number {
  const soma = digitos.reduce((acc, digito, index) => acc + digito * pesos[index], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * Valida um CPF (mascarado ou só dígitos) pelo algoritmo de dígito
 * verificador da Receita Federal — 2 checksums sobre os 9 dígitos base
 * (AC2). Rejeita:
 * - Qualquer entrada com menos/mais de 11 dígitos após remover a máscara.
 * - Os 11 dígitos repetidos (ex.: `"00000000000"`, `"11111111111"`) — esse
 *   padrão passa aritmeticamente no cálculo do DV, então precisa de
 *   rejeição explícita (mesmo cuidado de `cnpj.ts`).
 *
 * NÃO verifica situação cadastral na Receita — fora do escopo desta função
 * e do MVP (mesma decisão já tomada para CNPJ, Story 3.3).
 */
export function isCpfValido(value: string): boolean {
  const digitos = apenasDigitosCpf(value);
  if (digitos.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digitos)) return false;

  const nums = digitos.split('').map(Number);
  const base9 = nums.slice(0, 9);
  const dv1 = calcularDigitoVerificador(base9, PESOS_DV1);
  const dv2 = calcularDigitoVerificador([...base9, dv1], PESOS_DV2);

  return nums[9] === dv1 && nums[10] === dv2;
}
