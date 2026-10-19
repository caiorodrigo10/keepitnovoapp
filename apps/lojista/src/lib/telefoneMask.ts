/**
 * Máscara e validação de telefone BR — Story 3.2 (AC1, AC3).
 *
 * [IDS] ADAPT de `apps/cliente/src/lib/telefoneMask.ts` (Story 2.2, AC4):
 * mesma lógica de máscara progressiva (não copiável entre apps — cada app
 * mobile é um pacote isolado, sem import cruzado `apps/lojista` →
 * `apps/cliente`). A única diferença de comportamento é `isTelefoneBRValido`:
 * no Cliente o telefone é opcional (string vazia é válida); no Lojista, o
 * Passo 1 do cadastro (AC1) lista telefone como campo obrigatório do
 * responsável pela loja — vazio é inválido aqui.
 */

/**
 * Aplica a máscara progressiva `(11) 91234-5678` enquanto o usuário digita.
 * Mesmo algoritmo de `apps/cliente/src/lib/telefoneMask.ts#maskTelefoneBR`
 * (Story 2.2) — inclui o mesmo descarte de DDI `55` em entradas de 12/13
 * dígitos coladas no formato internacional.
 */
export function maskTelefoneBR(value: string): string {
  const rawDigits = value.replace(/\D/g, '');
  const digitsWithoutDDI =
    (rawDigits.length === 12 || rawDigits.length === 13) && rawDigits.startsWith('55')
      ? rawDigits.slice(2)
      : rawDigits;
  const digits = digitsWithoutDDI.slice(0, 11);

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
 * Valida o formato completo de um telefone BR mascarado — AC1 (Story 3.2)
 * exige telefone do responsável no Passo 1, então, ao contrário do Cliente
 * (Story 2.2), string vazia é **inválida** aqui.
 */
export function isTelefoneBRValido(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  return /^\(\d{2}\) \d{4,5}-\d{4}$/.test(trimmed);
}
