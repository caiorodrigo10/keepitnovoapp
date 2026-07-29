import type { AsyncCallOptions } from '../types';

/**
 * Domínio: tabela `produtos`.
 * Nota do schema: "Não há tabela de estoque" — decisão de negócio já fechada,
 * não inventar campo de estoque no mock.
 * [Source: docs/architecture/03-data-models.md#3.1]
 */
export interface Produto {
  id: string;
  estabelecimento_id: string;
  nome: string;
  descricao: string | null;
  preco_reais: number;
  categoria_produto: string;
  foto_url: string | null;
  ativo: boolean;
  /** Soft delete — `null` enquanto o produto existe; preenchido em vez de remover a linha (Story 1.10, Task 5). */
  excluido_em: string | null;
}

export interface CreateProdutoInput {
  estabelecimento_id: string;
  nome: string;
  descricao?: string | null;
  preco_reais: number;
  categoria_produto: string;
  foto_url?: string | null;
}

export interface UpdateProdutoInput {
  nome?: string;
  descricao?: string | null;
  preco_reais?: number;
  categoria_produto?: string;
  foto_url?: string | null;
  /** `true` reativa um produto pausado; `false` equivale a `pause()` (Story 1.10, Task 5). */
  ativo?: boolean;
}

export interface ProductPort {
  /**
   * Por padrão retorna só `ativo === true && excluido_em === null`. Com
   * `incluirInativos: true`, inclui também os pausados (`ativo === false`),
   * mas nunca os soft-deleted (`excluido_em` preenchido) — Story 1.10 (Task 5).
   */
  list(
    estabelecimentoId: string,
    options?: AsyncCallOptions & { incluirInativos?: boolean },
  ): Promise<Produto[]>;
  getById(id: string, options?: AsyncCallOptions): Promise<Produto | null>;
  create(input: CreateProdutoInput, options?: AsyncCallOptions): Promise<Produto>;
  update(id: string, input: UpdateProdutoInput, options?: AsyncCallOptions): Promise<Produto>;
  /** Atalho para `update(id, { ativo: false })` — usado pelo CRUD do lojista (Story 0.9). */
  pause(id: string, options?: AsyncCallOptions): Promise<Produto>;
  /** Soft delete via `excluido_em` — nunca remove a linha de `db.produtos` (Story 1.10, Task 5). */
  delete(id: string, options?: AsyncCallOptions): Promise<void>;
}
