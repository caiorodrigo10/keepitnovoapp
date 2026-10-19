import type { Produto } from '@keepit/core-data';

/**
 * `Produto` (schema real) + estoque de EXIBIÇÃO — Story 0.9.
 *
 * "Não há tabela de estoque" é decisão de negócio já fechada
 * [Source: docs/architecture/03-data-models.md#3.1, linha 356]. O protótipo
 * (painel P7) exibe "Estoque: 24"/"Estoque baixo: 3" nos cards — `estoqueDisplay`
 * cobre essa fidelidade visual sem inventar uma coluna real. Gerado
 * deterministicamente por `estoqueDisplayFromId` (ver `estoque.ts`) para
 * produtos das fixtures, e capturado do formulário (`NumericStepper`) para
 * produtos criados nesta sessão. NÃO deve ser copiado 1:1 quando
 * `ProductPort` ganhar a implementação Supabase (Épico 1+).
 */
export interface ProdutoCatalogo extends Produto {
  estoqueDisplay: number;
}
