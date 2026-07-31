/**
 * Máscara e validação de telefone BR — Story 2.2, AC4.
 *
 * [IDS] CREATE — extraído de `CriarConta.tsx` para ser testável sem depender
 * de `@testing-library/react-native` (fora de escopo desta story, ver Dev
 * Notes da Story 2.2). Segue o padrão de módulo puro de `apps/cliente/src/lib/`
 * (mesmo estilo de `onboardingFlag.ts`/`cancelamentoPolicy.ts`).
 *
 * Telefone é **opcional** (decisão 10.4 + FR1): string vazia é sempre válida.
 * Quando preenchido, o telefone é **não verificado** — estas funções só
 * validam o formato (DDD + 8 ou 9 dígitos), não a existência real do número
 * nem a titularidade. Nenhuma confirmação por SMS é feita neste MVP.
 */

/**
 * Aplica a máscara progressiva `(11) 91234-5678` enquanto o usuário digita.
 * Aceita qualquer entrada (inclusive já mascarada) — extrai apenas os
 * dígitos e reaplica a máscara, limitando a 11 dígitos (DDD + 9 dígitos).
 */
export function maskTelefoneBR(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);

  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;

  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);

  if (rest.length <= 4) {
    return `(${ddd}) ${rest}`;
  }

  if (digits.length <= 10) {
    // Formato de 8 dígitos: (11) 1234-5678
    const prefix = rest.slice(0, 4);
    const suffix = rest.slice(4);
    return `(${ddd}) ${prefix}${suffix ? `-${suffix}` : ''}`;
  }

  // Formato de 9 dígitos: (11) 91234-5678
  const prefix = rest.slice(0, 5);
  const suffix = rest.slice(5);
  return `(${ddd}) ${prefix}${suffix ? `-${suffix}` : ''}`;
}

/**
 * Valida o formato completo de um telefone BR mascarado.
 * String vazia é **válida** — telefone é opcional (AC2/AC4).
 * Para não-vazia, exige DDD + 8 ou 9 dígitos no formato completo
 * `(11) 1234-5678` ou `(11) 91234-5678`.
 */
export function isTelefoneBRValido(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;

  return /^\(\d{2}\) \d{4,5}-\d{4}$/.test(trimmed);
}
