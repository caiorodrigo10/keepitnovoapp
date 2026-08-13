-- =============================================================================
-- Bloco 09 (Operação Admin — Épico 8) — tabela `estabelecimentos_falhas` (Story 8.8).
-- Autor: @data-engineer (Dara). Data: 2026-08-13.
--
-- Registro de falhas de qualidade do lojista (no-show, atraso grave, chargeback,
-- reclamação). Base da aba "Qualidade do lojista" (leitura admin + alerta >3/30d).
--
-- Fontes normativas (seguidas à risca):
--   docs/architecture/03-data-models.md §1.6 (DDL exato + índice idx_falhas_estab_data).
--   docs/architecture/05-security.md   §3.6 (RLS: SÓ admin lê e escreve).
--   docs/stories/8.8.story.md (tabela NOVA — confirmado que não existe no keepit-dev).
--
-- ============================ DIVERGÊNCIA vs. MISSÃO (LER — decisão) ==========
-- A missão sugeriu: "RLS: lojista dono vê as próprias; admin vê tudo" e `tipo text`
-- com exemplos 'atraso'/'recusa'. SIGO o NORMATIVO em vez da sugestão, em 2 pontos:
--
-- (1) RLS = SÓ ADMIN (não o lojista). §3.6 é EXPLÍCITO: "Só admin lê e escreve. Lojista
--     NÃO vê seu próprio histórico (POR DESIGN — reduz atrito)." A Story 8.8 é uma
--     capacidade puramente ADMIN (aba de qualidade no painel admin); não há UI do
--     lojista que leia falhas no piloto. A própria 8.8 deixa a RLS-do-lojista como
--     decisão de @architect, e o doc normativo já a decidiu: admin-only. Princípio
--     "No Invention" (Constitution Art. IV) → sigo o doc. **Se o stakeholder quiser
--     que o lojista veja as próprias falhas, é uma policy adicional (FOR SELECT USING
--     estabelecimento_id = meu_estabelecimento_id()) — sinalizado ao orquestrador.**
--
-- (2) CHECK de `tipo` = os 4 valores do §1.6 ('lojista_nao_apareceu','atraso_grave',
--     'chargeback','reclamacao_admin'), não os exemplos ilustrativos da missão
--     ('atraso'/'recusa', prefixados por "ex.:"). O §1.6 é o schema normativo que a
--     Story 8.8 cita. Se um produtor do Bloco 10 precisar de outro valor, estende-se o
--     CHECK (migration localizada). CHECK é fail-closed (integridade de dados).
--
-- Também sigo §1.6 em: `estabelecimento_id ON DELETE CASCADE`, `pedido_id ON DELETE SET
-- NULL` (falha sobrevive à remoção do pedido, sem violar FK) e coluna `detalhes`
-- (plural, como no doc — a missão escreveu `detalhe`).
--
-- ============================ PRODUTORES (fora do Bloco 09) ===================
-- NENHUM produtor de falha existe neste bloco (forcar_cancelamento_pedido NÃO grava
-- falha — ver 20260813070001). Os produtores (no-show/atraso do cliente/lojista) são do
-- Bloco 10. `admin_gerencia_falhas` (FOR ALL) permite ao admin inserir manualmente
-- (ex.: 'reclamacao_admin') e serve de seed para verificação. Falhas disparadas por
-- cliente/lojista (não-admin) exigirão RPC SECURITY DEFINER no Bloco 10 (escrita
-- definer), pois não-admin não casa a policy.
--
-- ATOMICIDADE: tabela + índice + RLS + policy numa transação (o applier envolve o
-- arquivo). Estado parcial (tabela sem RLS) é falha de segurança (§2). BEGIN/COMMIT
-- omitidos de propósito.
--
-- ROLLBACK (forward-only):
--     DROP TABLE IF EXISTS public.estabelecimentos_falhas CASCADE;  -- índice/policy caem junto
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabela (03-data-models.md §1.6).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.estabelecimentos_falhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estabelecimento_id uuid NOT NULL REFERENCES public.estabelecimentos(id) ON DELETE CASCADE,
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,   -- falha sobrevive à remoção do pedido
  tipo text NOT NULL CHECK (tipo IN ('lojista_nao_apareceu', 'atraso_grave', 'chargeback', 'reclamacao_admin')),
  detalhes text,
  criado_em timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.estabelecimentos_falhas IS
  'Story 8.8 (03-data-models.md §1.6). Falhas de qualidade do lojista (no-show, atraso '
  'grave, chargeback, reclamação). RLS §3.6: SÓ admin lê/escreve (lojista NÃO vê as '
  'próprias — por design, reduz atrito). Produtores (no-show/atraso) são do Bloco 10 '
  '(fila vazia até lá; admin pode inserir reclamacao_admin manualmente).';

-- Índice do §1.6: consulta por estabelecimento, mais recentes primeiro (aba de qualidade).
CREATE INDEX IF NOT EXISTS idx_falhas_estab_data
  ON public.estabelecimentos_falhas(estabelecimento_id, criado_em DESC);

-- -----------------------------------------------------------------------------
-- RLS (05-security.md §3.6). ENABLE + FORCE (§2). Só admin — não-admin cai fechado
-- (FORCE RLS + nenhuma policy permissiva o cobre → 0 linhas no SELECT, escrita negada).
-- -----------------------------------------------------------------------------
ALTER TABLE public.estabelecimentos_falhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estabelecimentos_falhas FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_gerencia_falhas ON public.estabelecimentos_falhas;
CREATE POLICY admin_gerencia_falhas ON public.estabelecimentos_falhas
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
