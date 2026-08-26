/**
 * Regra "1 pedido = 1 loja" (Story 6.1, AC3) — decide se é necessário
 * confirmar com o cliente ANTES de trocar de loja no carrinho (o que limpa
 * o carrinho atual). Antes desta Story a troca acontecia silenciosamente
 * dentro de `CartContext.addItem`. [Source: docs/PERGUNTAS_REGRAS_NEGOCIO.md
 * #Rodada 5]
 *
 * [IDS] CREATE — extraída de `CartContext.addItem` como função pura para ser
 * testável sem harness de teste de hook React (gap de infraestrutura já
 * documentado nas Stories 2.1/5.4/5.6: `apps/cliente` não tem
 * `@testing-library/react-native`/`react-test-renderer` configurado).
 */
export function shouldConfirmStoreSwitch(
  estabelecimentoIdAtual: string | null,
  novoEstabelecimentoId: string,
  quantidadeItensAtual: number,
): boolean {
  return (
    estabelecimentoIdAtual !== null && estabelecimentoIdAtual !== novoEstabelecimentoId && quantidadeItensAtual > 0
  );
}
