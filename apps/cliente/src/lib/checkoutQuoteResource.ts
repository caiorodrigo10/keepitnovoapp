import type { CheckoutPort, Cotacao, CotacaoInput } from '@keepit/core-data';
export interface CheckoutQuoteState { data: Cotacao | null; loading: boolean; error: string | null }
export function createCheckoutQuoteResource(cotar: CheckoutPort['cotar'], publish: (state: CheckoutQuoteState) => void) {
  let generation = 0;
  return {
    async load(input: CotacaoInput) {
      const current = ++generation;
      publish({ data: null, loading: true, error: null });
      try {
        const data = await cotar(input);
        if (generation === current) publish({ data, loading: false, error: null });
      } catch (error) {
        const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Não foi possível obter o total. Tente novamente.';
        const messages: Record<string, string> = {
          ACESSO_NEGADO: 'Entre na sua conta para continuar.',
          MINIMO_NAO_ATINGIDO: 'O valor dos produtos está abaixo do pedido mínimo da loja.',
          LOJA_INDISPONIVEL: 'Esta loja está indisponível para novos pedidos.',
          HUB_INDISPONIVEL: 'Este ponto de retirada não está disponível para a loja.',
          HORARIO_INVIAVEL: 'Não é possível entregar este pedido dentro do horário do ponto de retirada.',
          PRODUTO_INDISPONIVEL: 'Um produto do carrinho não está mais disponível. Revise os itens.',
          ITENS_INVALIDOS: 'Revise os itens e as quantidades do carrinho.',
          VALOR_INVALIDO: 'Não foi possível calcular este carrinho. Revise os itens.',
        };
        if (generation === current) publish({ data: null, loading: false, error: messages[message] ?? 'Não foi possível obter o total. Tente novamente.' });
      }
    },
    cancel() { generation++; },
  };
}
