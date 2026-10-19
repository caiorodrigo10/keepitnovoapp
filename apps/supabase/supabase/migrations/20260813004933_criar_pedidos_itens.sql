-- =============================================================================
-- Bloco 06 (Pedido — fundação) — tabela `pedidos_itens` (snapshot) + RLS
-- Autor: @data-engineer (Dara). Data: 2026-08-13.
--
-- Fontes normativas (seguidas à risca):
--   docs/architecture/03-data-models.md §5.2  (DDL pedidos_itens + idx_pedidos_itens_pedido)
--   docs/architecture/05-security.md   §3.11  (RLS de pedidos_itens: visibilidade
--                                              DERIVADA do pedido pai)
--   docs/architecture/03-data-models.md §8 item 10 (ordem: itens junto de pedidos)
--
-- Snapshot dos itens no momento do checkout: NÃO é FK "dura" ao catálogo para
-- preservar o histórico se o produto for editado/excluído (§5.2). Por isso
-- `nome_snapshot` e `preco_unitario_reais` CONGELAM os valores; `produto_id` é
-- ON DELETE SET NULL (vira NULL se o produto for apagado, sem perder a linha).
--
-- Depende de: 20260813004932 (pedidos + helper public.pode_ver_pedido).
--   Reutiliza public.pode_ver_pedido(public.pedidos) para a visibilidade derivada.
--
-- ATOMICIDADE: tabela + índice + RLS + policies numa transação (regra §2 de
-- 05-security.md). BEGIN/COMMIT omitidos de propósito (transação do applier).
--
-- ROLLBACK (forward-only):
--     DROP TABLE IF EXISTS public.pedidos_itens CASCADE;  -- índice/policies caem junto
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabela `pedidos_itens` (03-data-models.md §5.2). Colunas exatamente como o §5.2.
--   pedido_id  → ON DELETE CASCADE (item pertence ao pedido; se o pedido sumir
--                fisicamente, o item vai junto — mas pedidos.* é RESTRICT e não há
--                DELETE do app, então o CASCADE é a semântica correta, não o caminho
--                operacional usual).
--   produto_id → ON DELETE SET NULL (preserva o histórico do item se o produto for
--                apagado — snapshot já congelou nome/preço).
-- -----------------------------------------------------------------------------
CREATE TABLE public.pedidos_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  nome_snapshot text NOT NULL,                       -- congela o nome no checkout
  preco_unitario_reais numeric(10,2) NOT NULL CHECK (preco_unitario_reais >= 0),
  quantidade int NOT NULL CHECK (quantidade > 0),
  subtotal_reais numeric(10,2) NOT NULL CHECK (subtotal_reais >= 0)  -- preco_unitario * quantidade
);

COMMENT ON TABLE public.pedidos_itens IS
  'Snapshot dos itens do pedido no checkout (03-data-models.md §5.2). nome_snapshot/'
  'preco_unitario_reais CONGELAM os valores (nao FK dura ao catalogo). produto_id '
  'ON DELETE SET NULL preserva o historico. Inserido SOMENTE pela RPC criar_pedido; '
  'imutavel (sem UPDATE/DELETE direto do app). Visibilidade derivada do pedido pai.';

-- Índice por pedido (§5.2): carregar todos os itens de um pedido.
CREATE INDEX idx_pedidos_itens_pedido ON public.pedidos_itens(pedido_id);

-- -----------------------------------------------------------------------------
-- RLS (05-security.md §2 + §3.11). ENABLE + FORCE. Visibilidade DERIVADA do pai:
-- vê o item quem pode ver o pedido (pode_ver_pedido). Escrita SÓ via RPC
-- criar_pedido (SECURITY DEFINER / BYPASSRLS) — app não insere/edita/apaga direto.
--
-- Sem recursão: a policy consulta `pedidos` (tabela distinta) via helper SECURITY
-- DEFINER; nenhuma policy consulta `pedidos_itens` a si mesma.
-- -----------------------------------------------------------------------------
ALTER TABLE public.pedidos_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_itens FORCE ROW LEVEL SECURITY;

-- SELECT: derivado do pedido pai (§3.11 ve_itens_relacionados).
CREATE POLICY ve_itens_relacionados ON public.pedidos_itens
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pedidos p
      WHERE p.id = pedido_id
        AND public.pode_ver_pedido(p.*)
    )
  );

-- INSERT direto do app: NEGADO. Itens são inseridos SOMENTE pela RPC criar_pedido,
-- na mesma transação do pedido (snapshot atômico).
CREATE POLICY sem_insert_direto_itens ON public.pedidos_itens
  FOR INSERT
  WITH CHECK (false);

-- UPDATE direto do app: NEGADO. O snapshot é IMUTÁVEL (nunca é editado).
CREATE POLICY sem_update_direto_itens ON public.pedidos_itens
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

-- DELETE direto do app: NEGADO (§3.11 sem_delete_pedidos_itens). O CASCADE de
-- pedidos.id é ação referencial interna, não sujeita a esta policy.
CREATE POLICY sem_delete_pedidos_itens ON public.pedidos_itens
  FOR DELETE
  USING (false);
