-- =============================================================================
-- Épico 4 (Catálogo) — tabela `produtos` + índices + trigger + RLS + policies
-- Autor: @data-engineer (Dara). Data: 2026-08-12.
--
-- Fontes normativas (seguidas à risca):
--   docs/architecture/03-data-models.md §3.1  (DDL produtos + índices idx_produtos_estab/idx_produtos_categoria)
--   docs/architecture/03-data-models.md §"Trigger utilitário compartilhado"
--   docs/architecture/05-security.md   §3.9   (RLS publico_ve_produtos / lojista_gerencia / admin)
--   docs/architecture/05-security.md   §3.4   (publico_ve_ativos — padrão de visibilidade de loja)
--   docs/architecture/03-data-models.md §8 item 8 (ordem: produtos após estabelecimentos)
--
-- PRIMEIRA migration que cria `produtos`. Reutiliza a infraestrutura JÁ EXISTENTE
-- do piloto (NÃO recriada aqui):
--   * public.set_atualizado_em()  — trigger utilitário (migration 20260812123046).
--     Só ligamos o trigger; a função já está no banco.
--   * public.is_admin()           — SECURITY DEFINER (migration 20260812132330).
--     REUSADA nas policies. Por ser SECURITY DEFINER consulta admin_users (tabela
--     distinta de produtos) → sem recursão de RLS.
--   * public.estabelecimentos     — FK pai + fonte da visibilidade derivada.
--
-- ÍNDICE TRIGRAM SEPARADO (não bloqueante): idx_produtos_nome_trgm + a extensão
-- pg_trgm ficam na migration seguinte 20260812190001_produtos_indice_trgm.sql.
-- Motivo: a busca do piloto é ILIKE simples (SIMPLE) — o trigram é OTIMIZAÇÃO, não
-- pré-condição; isolá-lo garante que a criação da tabela nunca falhe por causa de
-- uma extensão. Ver §3.1 (o DDL do doc agrupa os três índices; aqui separamos o
-- terceiro por segurança de aplicação).
--
-- ATOMICIDADE (obrigatório): tabela + índices + trigger + RLS + policies neste ÚNICO
-- arquivo, aplicados em UMA transação (regra §2 de 05-security.md — tabela sem RLS
-- ativada é falha de segurança). `apply_migration` (MCP) e `supabase db push`
-- envolvem o arquivo inteiro em transação. BEGIN/COMMIT explícitos omitidos de
-- propósito (não encerrar a transação externa do applier).
--
-- ROLLBACK (forward-only; se necessário reverter):
--     DROP TABLE IF EXISTS public.produtos CASCADE;  -- índices/trigger/policies caem junto
--     -- NÃO dropar public.set_atualizado_em() nem public.is_admin(): utilitários
--     -- compartilhados por outras tabelas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabela `produtos` (03-data-models.md §3.1) — colunas exatamente como o §3.1.
-- Sem tabela de estoque por decisão de negócio (§3.1): estoque é gerido fora do app.
-- -----------------------------------------------------------------------------
CREATE TABLE public.produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estabelecimento_id uuid NOT NULL
    REFERENCES public.estabelecimentos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  preco_reais numeric(10,2) NOT NULL CHECK (preco_reais > 0),
  categoria_produto text NOT NULL,                   -- 'cuidados', 'higiene', 'alimentos', etc.
  foto_url text,                                     -- path/URL do bucket público `produtos` (migration 20260812190002)
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT NOW(),
  atualizado_em timestamptz NOT NULL DEFAULT NOW(),
  excluido_em timestamptz
);

COMMENT ON TABLE public.produtos IS
  'Catálogo de produtos por estabelecimento. Épico 4 (03-data-models.md §3.1). '
  'Soft delete via excluido_em; "inativar" no app do lojista = ativo=false. '
  'Sem estoque no banco (lojista administra fora do app).';

-- Índices do §3.1 que NÃO dependem de extensão (idx_produtos_nome_trgm fica na
-- migration 20260812190001, junto com CREATE EXTENSION pg_trgm).
--   idx_produtos_estab: lista do catálogo do lojista / join com carrinho e pedidos.
CREATE INDEX idx_produtos_estab ON public.produtos(estabelecimento_id)
  WHERE excluido_em IS NULL;
--   idx_produtos_categoria: filtro por categoria na vitrine do cliente.
CREATE INDEX idx_produtos_categoria ON public.produtos(categoria_produto)
  WHERE ativo = true AND excluido_em IS NULL;

-- Trigger de atualização automática de `atualizado_em` (reutiliza o utilitário
-- compartilhado public.set_atualizado_em(), já existente — NÃO recriado aqui).
CREATE TRIGGER trg_produtos_atualizado
  BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

-- -----------------------------------------------------------------------------
-- RLS (05-security.md §3.9). Regra absoluta do §2: ENABLE + FORCE logo após criar.
-- FORCE vale até para o owner — protege contra bugs em caminhos privilegiados.
--
-- Sem recursão de RLS: as policies de `produtos` consultam `estabelecimentos` (tabela
-- distinta) e `public.is_admin()` (SECURITY DEFINER, consulta admin_users). Nenhuma
-- policy consulta `produtos` a si mesma.
-- -----------------------------------------------------------------------------
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos FORCE ROW LEVEL SECURITY;

-- SELECT público: cliente/anon vê SÓ produto ATIVO e não-excluído de loja ATIVA,
-- NÃO PAUSADA e não-excluída — visibilidade derivada do pai, como em
-- estabelecimentos_horarios (§3.5) e alinhada ao publico_ve_ativos de
-- estabelecimentos (§3.4: status='ativo' AND pausado_manualmente=false AND
-- excluido_em IS NULL).
--
-- ENDURECIMENTO INTENCIONAL vs. §3.9: o texto do §3.9 checa no pai apenas
-- `e.status='ativo'`. Aqui adicionamos `pausado_manualmente=false AND
-- excluido_em IS NULL` para NÃO expor o catálogo de uma loja pausada/excluída —
-- é uma restrição a MAIS (falha FECHADA), coerente com a própria policy de
-- visibilidade da loja (§3.4). Ver observação para o Caio ao fim.
--
-- Sem `TO` explícito (aplica a todos os roles, inclusive anon), consistente com
-- publico_ve_ativos (§3.4) e publico_ve_hubs. O acesso do DONO e do ADMIN aos
-- próprios/todos produtos (inclusive inativos) NÃO vive aqui: é coberto pelas
-- policies FOR ALL abaixo, que são OR'd (permissivas) com esta — mesma decisão de
-- desenho da migration 20260812132331 ("FOR ALL cobre SELECT e é OR'd").
CREATE POLICY publico_ve_produtos ON public.produtos
  FOR SELECT
  USING (
    ativo = true
    AND excluido_em IS NULL
    AND EXISTS (
      SELECT 1 FROM public.estabelecimentos e
      WHERE e.id = estabelecimento_id
        AND e.status = 'ativo'
        AND e.pausado_manualmente = false
        AND e.excluido_em IS NULL
    )
  );

-- ALL: o lojista DONO do estabelecimento pai gerencia (SELECT/INSERT/UPDATE/DELETE)
-- os próprios produtos — inclusive inativos/excluídos (para reativar/editar). USING
-- e WITH CHECK idênticos: o WITH CHECK impede criar/mover produto para um
-- estabelecimento que não é do usuário. Verbatim do padrão §3.9 (parte do lojista).
CREATE POLICY lojista_gerencia_produtos ON public.produtos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.estabelecimentos
      WHERE id = estabelecimento_id AND dono_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.estabelecimentos
      WHERE id = estabelecimento_id AND dono_user_id = (SELECT auth.uid())
    )
  );

-- ALL: admin faz tudo (§3.9 folda `OR is_admin()` nas cláusulas do lojista; aqui,
-- seguindo a decomposição da 20260812132331, isolamos numa policy própria —
-- permissiva, OR'd com as demais). is_admin() é SECURITY DEFINER com EXECUTE para
-- authenticated/anon (migration 20260812132330) → avaliável na policy.
CREATE POLICY admin_gerencia_produtos ON public.produtos
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
