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

/** Extensões aceitas pelo bucket PÚBLICO `produtos` (`allowed_mime_types`, migration `20260812190002`). */
export type ProdutoFotoExt = 'jpg' | 'jpeg' | 'png' | 'webp';

/**
 * Story 4.4 (AC4, AC5) — [IDS] ADAPT do padrão `HubFotoUploadInput`
 * (`AdminPort.hubsCrud.uploadFoto`, Story 4.1): mesmo formato `{ uri, ext }`,
 * mesma implementação de upload (`fetch(uri).blob()`). NÃO carrega o nome do
 * arquivo — diferente de `FachadaUploadInput`/`HubFotoUploadInput` (1 foto
 * fixa por dono), um lojista tem VÁRIOS produtos, então o adapter gera um
 * nome de arquivo único por upload internamente (path final
 * `${auth.uid()}/<arquivo>`, convenção fixada pela migration
 * `20260812190002_storage_bucket_produtos.sql` — a policy só permite gravar
 * sob a própria pasta do uid).
 */
export interface ProdutoFotoUploadInput {
  uri: string;
  ext: ProdutoFotoExt;
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
  /**
   * Upload da foto do produto (Story 4.4, AC4) — bucket PÚBLICO `produtos`.
   * Retorna a URL PÚBLICA direta do objeto (nunca uma URL assinada, mesmo
   * padrão de `AdminPort.hubsCrud.uploadFoto`) — `Produto.foto_url` persiste
   * essa URL tal como recebida, sem re-derivação no momento da leitura.
   */
  uploadFoto(input: ProdutoFotoUploadInput, options?: AsyncCallOptions): Promise<string>;
}
