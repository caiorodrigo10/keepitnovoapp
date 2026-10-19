/**
 * Story 6.7 (AC2) — [IDS] ADAPT do mesmo seam WA-001 já validado em
 * `apps/lojista/src/screens/perfil/ExcluirConta.tsx`/`Configuracoes.tsx`
 * (Story 3.6/3.12): funções PURAS que decidem o destino e o rótulo do link
 * "Como chegar" (`ModalConfirmarPin.tsx`), extraídas para serem testáveis
 * sem harness de componente — mesmo padrão de testabilidade já usado em
 * `checkoutValidation.ts#deveSincronizarCpfCollected` (Story 6.5).
 *
 * Nunca retorna uma URL com um número de WhatsApp inventado — só quando
 * `SUPORTE_WHATSAPP_DISPONIVEL` for `true` E `numero` não for `null`
 * (hoje `SUPORTE_WHATSAPP_NUMERO` é `null`, WA-001 pendente).
 */

/** `null` quando o canal está indisponível — quem chama decide não abrir nada (nunca um `wa.me` com número inventado). */
export function comoChegarUrl(disponivel: boolean, numero: string | null): string | null {
  if (!disponivel || !numero) {
    return null;
  }
  return `https://wa.me/${numero}`;
}

/** Dois sinais de honestidade (rótulo + estilo desabilitado no componente) — nunca um link mudo sem `onPress`. */
export function comoChegarLabel(disponivel: boolean): string {
  return disponivel ? 'Como chegar' : 'Como chegar (em breve)';
}
