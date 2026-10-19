-- =============================================================================
-- Épico 4 (Catálogo) — índice trigram OPCIONAL para busca por nome de produto
-- Autor: @data-engineer (Dara). Data: 2026-08-12.
--
-- Fontes normativas:
--   docs/architecture/03-data-models.md §3.1  (idx_produtos_nome_trgm + pg_trgm)
--   docs/architecture/03-data-models.md §"Extensões PostgreSQL utilizadas"
--
-- NÃO BLOQUEANTE — SEPARADO DE PROPÓSITO DA TABELA (20260812190000):
--   A busca de produto no piloto é ILIKE simples (classe SIMPLE). O índice trigram
--   é OTIMIZAÇÃO de performance da busca por nome, não pré-condição do catálogo.
--   Por isso a extensão + índice vivem AQUI, isolados: se a extensão não puder ser
--   habilitada em algum ambiente, a tabela `produtos` e suas RLS (migration anterior)
--   continuam íntegras e funcionais. Aplicar esta migration é RECOMENDADO mas OPCIONAL.
--
-- SUPABASE: pg_trgm é uma extensão suportada. Convenção Supabase: instalar no schema
--   dedicado `extensions` (não em `public`), e referenciar a operator class de forma
--   QUALIFICADA (`extensions.gin_trgm_ops`) para não depender do search_path do papel.
--
-- ATOMICIDADE: extensão + índice numa transação. Idempotente:
--   CREATE EXTENSION IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
--
-- ROLLBACK (forward-only):
--     DROP INDEX IF EXISTS public.idx_produtos_nome_trgm;
--     -- NÃO dropar a extensão pg_trgm: pode ser usada por outros objetos.
-- =============================================================================

-- Extensão de busca por similaridade (trigram). Schema `extensions` (norma Supabase).
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Índice GIN trigram para busca ILIKE '%termo%' por nome de produto, restrito a
-- produtos visíveis (ativo + não-excluído) — mesmo predicado parcial do §3.1.
-- Operator class qualificada com o schema da extensão (robusto a search_path).
CREATE INDEX IF NOT EXISTS idx_produtos_nome_trgm
  ON public.produtos
  USING gin (nome extensions.gin_trgm_ops)
  WHERE ativo = true AND excluido_em IS NULL;
