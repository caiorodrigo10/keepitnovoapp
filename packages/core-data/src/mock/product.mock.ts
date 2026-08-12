import type {
  CreateProdutoInput,
  ProdutoFotoUploadInput,
  Produto,
  ProductPort,
  UpdateProdutoInput,
} from '../ports/product.port';
import type { AsyncCallOptions } from '../types';
import { generateMockId, simulateAsync } from './async-helpers';
import type { MockDb } from './db';

export function createProductMock(db: MockDb): ProductPort {
  function findOrThrow(id: string): Produto {
    const produto = db.produtos.find((p) => p.id === id);
    if (!produto) {
      throw new Error(`[mock] Produto não encontrado: ${id}`);
    }
    return produto;
  }

  return {
    list(
      estabelecimentoId: string,
      options?: AsyncCallOptions & { incluirInativos?: boolean },
    ): Promise<Produto[]> {
      return simulateAsync(
        () =>
          db.produtos.filter((p) => {
            if (p.estabelecimento_id !== estabelecimentoId || p.excluido_em !== null) {
              return false;
            }
            return options?.incluirInativos ? true : p.ativo;
          }),
        [],
        options,
      );
    },

    getById(id: string, options?: AsyncCallOptions): Promise<Produto | null> {
      return simulateAsync(() => db.produtos.find((p) => p.id === id) ?? null, null, options);
    },

    create(input: CreateProdutoInput, options?: AsyncCallOptions): Promise<Produto> {
      return simulateAsync(
        () => {
          const produto: Produto = {
            id: generateMockId('produto'),
            estabelecimento_id: input.estabelecimento_id,
            nome: input.nome,
            descricao: input.descricao ?? null,
            preco_reais: input.preco_reais,
            categoria_produto: input.categoria_produto,
            foto_url: input.foto_url ?? null,
            ativo: true,
            excluido_em: null,
          };
          db.produtos.push(produto);
          return produto;
        },
        {} as Produto,
        options,
      );
    },

    update(id: string, input: UpdateProdutoInput, options?: AsyncCallOptions): Promise<Produto> {
      return simulateAsync(
        () => {
          const produto = findOrThrow(id);
          Object.assign(produto, input);
          return produto;
        },
        {} as Produto,
        options,
      );
    },

    pause(id: string, options?: AsyncCallOptions): Promise<Produto> {
      return simulateAsync(
        () => {
          const produto = findOrThrow(id);
          produto.ativo = false;
          return produto;
        },
        {} as Produto,
        options,
      );
    },

    delete(id: string, options?: AsyncCallOptions): Promise<void> {
      return simulateAsync(
        () => {
          const produto = findOrThrow(id);
          produto.excluido_em = new Date().toISOString();
        },
        undefined,
        options,
      );
    },

    /**
     * Story 4.4 (AC4, AC5) — mock não tem Storage real, ecoa a MESMA `uri`
     * de volta (mesma simplificação honesta já usada em
     * `admin.mock.ts#hubsCrud.uploadFoto`): a `uri` recebida (ex.: uma Blob
     * URL válida na sessão atual do navegador) continua funcional para fins
     * de preview/demo, sem simular um endpoint de upload que não existe
     * neste modo.
     */
    uploadFoto(input: ProdutoFotoUploadInput, options?: AsyncCallOptions): Promise<string> {
      return simulateAsync(() => input.uri, '', options);
    },
  };
}
