/**
 * Normalização/validação de CEP — Story 5.1.1 (AC3, AC5).
 *
 * [IDS] ADAPT do precedente de `apps/cliente/src/lib/telefoneMask.ts`
 * (Story 2.2): mesmo padrão de extrair só os dígitos de uma entrada
 * mascarada/livre e validar o comprimento — aqui, 8 dígitos fixos de CEP
 * (sem máscara progressiva enquanto digita, o CEP não precisa dela para o
 * fluxo desta Story: um único input, sem formatação visual obrigatória).
 */

/**
 * Extrai os dígitos de um CEP em qualquer formato (`12345-678`, `12345678`,
 * com espaços etc.) e retorna a string normalizada de 8 dígitos, ou `null`
 * se a entrada não tiver exatamente 8 dígitos (CEP incompleto/inválido,
 * string vazia).
 */
export function normalizeCep(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  return digits.length === 8 ? digits : null;
}
