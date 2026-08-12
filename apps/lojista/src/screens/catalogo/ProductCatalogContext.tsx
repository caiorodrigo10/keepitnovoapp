import { createContext, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { getDataClient } from '@keepit/core-data';

import { isSupabaseDataSource } from '../../lib/dataSource';
import { CURRENT_ESTABELECIMENTO_ID } from './currentStore';
import { estoqueDisplayFromId } from './estoque';
import type { ProdutoCatalogo } from './types';

/**
 * Stories 4.3/4.4 — [AUTO-DECISION] resolução do `estabelecimento_id` do
 * lojista logado. `CURRENT_ESTABELECIMENTO_ID` (`currentStore.ts`) é um
 * fixture MOCK fixo — em `DATA_SOURCE=supabase` precisamos do id REAL do
 * PRÓPRIO estabelecimento do lojista autenticado, nunca esse fixture.
 *
 * Nem `getMeuEstabelecimento` (status/motivo_rejeicao) nem `getMeuPerfil`
 * (nome_fantasia/categoria/...) devolvem o `id` — reaproveita o novo método
 * leve `estabelecimentoCadastro.getMeuEstabelecimentoId()` (mesma port já
 * usada por `PerfilPublico.tsx`/`Login.tsx`, Stories 3.10/3.11), seguindo o
 * mesmo padrão screen-level de `isSupabaseDataSource()` já documentado em
 * `../../lib/dataSource.ts`.
 *
 * Escopo desta Story: só o catálogo (`ProductCatalogContext`). A
 * reconciliação mais ampla de `CURRENT_ESTABELECIMENTO_ID` nas demais telas
 * (Pedidos, Financeiro, `LojaDisponibilidadeContext`) permanece o débito já
 * documentado em `navigation/lojistaSession.ts` ("carry-forward para o
 * Épico 6+"), fora do escopo das Stories 4.3/4.4.
 */
async function resolveEstabelecimentoId(client: ReturnType<typeof getDataClient>): Promise<string | null> {
  if (!isSupabaseDataSource()) {
    return CURRENT_ESTABELECIMENTO_ID;
  }
  return client.estabelecimentoCadastro.getMeuEstabelecimentoId();
}

export interface NovoProdutoInput {
  nome: string;
  descricao: string | null;
  preco_reais: number;
  categoria_produto: string;
  foto_url: string | null;
  estoqueDisplay: number;
}

export type EditarProdutoInput = Partial<Omit<NovoProdutoInput, 'estoqueDisplay'>> & {
  estoqueDisplay?: number;
};

interface ProductCatalogContextValue {
  produtos: ProdutoCatalogo[];
  loading: boolean;
  error: Error | null;
  reload: () => void;
  getById: (id: string) => ProdutoCatalogo | undefined;
  createProduto: (input: NovoProdutoInput) => Promise<ProdutoCatalogo>;
  updateProduto: (id: string, input: EditarProdutoInput) => Promise<void>;
  toggleAtivo: (id: string, nextAtivo: boolean) => Promise<void>;
  deleteProduto: (id: string) => Promise<void>;
}

const ProductCatalogContext = createContext<ProductCatalogContextValue | null>(null);

/**
 * Provider do catálogo de produtos — Story 0.9 (Tasks 1-4). Envolve
 * `CatalogoStack` para compartilhar o estado entre `GerenciarCatalogo`,
 * `CadastrarProduto` e `EditarProduto`, mesmo padrão de
 * `screens/perfil/LojaPerfilContext.tsx` (Story 0.8).
 *
 * [IDS/AUTO-DECISION] Hook/Context vivem em `apps/lojista` (não em
 * `packages/core-data/src/hooks`, onde `useHubs`/`useOrders`/`useStores`
 * vivem por decisão da Story 0.2) — mantido assim na Story 1.10 por
 * consistência com o padrão já em uso neste app; migrar para
 * `@keepit/core-data/hooks` é um refactor independente, fora do escopo desta
 * story (que é sobre remover mocks locais, não sobre onde os hooks residem).
 *
 * `toggleAtivo`/`deleteProduto` agora refletem o retorno REAL de
 * `client.product.update`/`client.product.delete` (Story 1.10, Task 5) —
 * `ProductPort` ganhou `ativo` em `update()` (reativação real) e `delete()`
 * (soft delete via `excluido_em`), substituindo as mutações "local-only"
 * documentadas nas Stories 0.9/0.10.
 */
export function ProductCatalogProvider({ children }: PropsWithChildren) {
  const [produtos, setProdutos] = useState<ProdutoCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  /** Cache do `estabelecimento_id` resolvido nesta sessão — reaproveitado por `createProduto` sem re-resolver a cada chamada. */
  const estabelecimentoIdRef = useRef<string | null>(null);

  useEffect(() => {
    const client = getDataClient();
    let cancelled = false;

    setLoading(true);
    setError(null);

    resolveEstabelecimentoId(client)
      .then(async (estabelecimentoId) => {
        if (cancelled) return;
        estabelecimentoIdRef.current = estabelecimentoId;
        if (!estabelecimentoId) {
          // Story 4.3 (AC5) — sem estabelecimento resolvido para o lojista
          // autenticado (ex.: sessão sem cadastro ainda), estado vazio
          // honesto — não é um erro de rede/RLS.
          setProdutos([]);
          return;
        }
        // Story 4.3 (AC2) — `incluirInativos: true` para a tab "Pausados"
        // trazer produtos com `ativo=false` reais (filtro Ativos/Pausados
        // continua 100% client-side em `GerenciarCatalogo.tsx`).
        const lista = await client.product.list(estabelecimentoId, { incluirInativos: true });
        if (cancelled) return;
        setProdutos(lista.map((produto) => ({ ...produto, estoqueDisplay: estoqueDisplayFromId(produto.id) })));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  async function createProduto(input: NovoProdutoInput): Promise<ProdutoCatalogo> {
    const client = getDataClient();
    const { estoqueDisplay, ...rest } = input;
    const estabelecimentoId = estabelecimentoIdRef.current ?? (await resolveEstabelecimentoId(client));
    if (!estabelecimentoId) {
      throw new Error(
        '[catalogo] Não foi possível identificar o estabelecimento do lojista autenticado para cadastrar o produto.',
      );
    }
    const produto = await client.product.create({ estabelecimento_id: estabelecimentoId, ...rest });
    const produtoComEstoque: ProdutoCatalogo = { ...produto, estoqueDisplay };
    setProdutos((previous) => [...previous, produtoComEstoque]);
    return produtoComEstoque;
  }

  async function updateProduto(id: string, input: EditarProdutoInput): Promise<void> {
    const client = getDataClient();
    const { estoqueDisplay, ...rest } = input;
    const atualizado = await client.product.update(id, rest);
    setProdutos((previous) =>
      previous.map((produto) =>
        produto.id === id
          ? { ...produto, ...atualizado, estoqueDisplay: estoqueDisplay ?? produto.estoqueDisplay }
          : produto,
      ),
    );
  }

  async function toggleAtivo(id: string, nextAtivo: boolean): Promise<void> {
    const client = getDataClient();
    // Pausar (product.port.pause()) ou reativar (update com ativo: true) —
    // ambos persistem no mock db real (Story 1.10, Task 5).
    const atualizado = nextAtivo ? await client.product.update(id, { ativo: true }) : await client.product.pause(id);
    setProdutos((previous) =>
      previous.map((produto) => (produto.id === id ? { ...produto, ...atualizado } : produto)),
    );
  }

  async function deleteProduto(id: string): Promise<void> {
    const client = getDataClient();
    await client.product.delete(id);
    setProdutos((previous) => previous.filter((produto) => produto.id !== id));
  }

  const value = useMemo<ProductCatalogContextValue>(
    () => ({
      produtos,
      loading,
      error,
      reload: () => setReloadToken((token) => token + 1),
      getById: (id) => produtos.find((produto) => produto.id === id),
      createProduto,
      updateProduto,
      toggleAtivo,
      deleteProduto,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [produtos, loading, error],
  );

  return <ProductCatalogContext.Provider value={value}>{children}</ProductCatalogContext.Provider>;
}

export function useProductCatalog(): ProductCatalogContextValue {
  const context = useContext(ProductCatalogContext);
  if (!context) {
    throw new Error('useProductCatalog deve ser usado dentro de <ProductCatalogProvider>.');
  }
  return context;
}
