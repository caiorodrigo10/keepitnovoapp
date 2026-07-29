/**
 * [IDS] CREATE — nenhum util de formatação de moeda existia em
 * `apps/cliente` antes desta story (Story 0.5/0.4 duplicaram um
 * `formatPreco` local por arquivo, ex. `DetalheProduto.tsx`,
 * `ProductRow.tsx`). Story 0.6 precisa do mesmo formato em 4 telas novas
 * (Carrinho, Checkout, Pagamento, AdicionarCartao) — centralizar aqui evita
 * quadruplicar a mesma função `toLocaleString`.
 */
export function formatReais(valorReais: number): string {
  return valorReais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
