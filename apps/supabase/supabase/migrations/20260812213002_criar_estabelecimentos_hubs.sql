-- =============================================================================
-- Bloco 04 (Descoberta) — tabela de junção `estabelecimentos_hubs` (loja↔hub) + RLS
-- Autor: @data-engineer (Dara). Data: 2026-08-12.
--
-- Fontes normativas (seguidas à risca):
--   docs/architecture/03-data-models.md §2.3  (DDL junção pura: PK composta
--                                               (estabelecimento_id, hub_id), FKs
--                                               ON DELETE CASCADE, idx_estab_hubs_hub)
--   docs/architecture/03-data-models.md §8 item 7 (ordem: após estabelecimentos e hubs)
--   docs/architecture/05-security.md   §3.4   (publico_ve_ativos — padrão de
--                                               visibilidade da loja: status='ativo'
--                                               AND pausado_manualmente=false AND
--                                               excluido_em IS NULL)
--   docs/architecture/05-security.md   §3.8   (padrão admin_gerencia_* / is_admin())
--
-- É a BASE DA DESCOBERTA POR LISTA do piloto (§2.3): o cliente escolhe um hub numa
-- lista e vê as lojas relacionadas — SEM GPS/Haversine/mapa/geocoding/ranking.
-- Substitui, no piloto, o matching geográfico por coordenadas/raio.
--
-- PRIMEIRA migration que cria `estabelecimentos_hubs`. Reutiliza infraestrutura JÁ
-- EXISTENTE do piloto (NÃO recriada aqui):
--   * public.estabelecimentos  — FK pai (migration 20260812123046) + fonte da
--     visibilidade derivada na policy de SELECT.
--   * public.hubs              — FK pai (migration 20260812164000) + fonte da
--     visibilidade derivada (hub ativo) na policy de SELECT.
--   * public.is_admin()        — SECURITY DEFINER (migration 20260812132330).
--     REUSADA na policy de escrita. Por consultar admin_users (tabela distinta desta)
--     → sem recursão de RLS.
--
-- Junção PURA (§2.3): chave composta, sem `id` próprio, sem atualizado_em/trigger
-- (a relação é criada/removida inteira, nunca "editada"). Só `criado_em` para auditar
-- quando o vínculo foi feito. Mesmo espírito de estabelecimentos_horarios/hubs_horarios.
--
-- ATOMICIDADE (obrigatório): tabela + índice + RLS + policies neste ÚNICO arquivo,
-- aplicados em UMA transação (regra §2 de 05-security.md — tabela sem RLS ativada é
-- falha de segurança). `apply_migration` (MCP) e `supabase db push` envolvem o arquivo
-- inteiro em transação. BEGIN/COMMIT explícitos omitidos de propósito (não encerrar a
-- transação externa do applier).
--
-- ROLLBACK (forward-only; se necessário reverter):
--     DROP TABLE IF EXISTS public.estabelecimentos_hubs CASCADE;  -- índice/policies caem junto
--     -- NÃO dropar public.is_admin(): utilitário compartilhado por outras tabelas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabela `estabelecimentos_hubs` (03-data-models.md §2.3) — junção pura loja↔hub.
-- Ambas as FKs ON DELETE CASCADE: se a loja OU o hub for apagado FISICAMENTE, o
-- vínculo cai junto (verbatim §2.3). Na prática, "excluir" loja/hub no piloto é
-- soft (excluido_em / ativo=false) porque pedidos.* é ON DELETE RESTRICT — o CASCADE
-- aqui é a semântica correta do modelo, não o caminho operacional usual.
-- -----------------------------------------------------------------------------
CREATE TABLE public.estabelecimentos_hubs (
  estabelecimento_id uuid NOT NULL
    REFERENCES public.estabelecimentos(id) ON DELETE CASCADE,
  hub_id uuid NOT NULL
    REFERENCES public.hubs(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (estabelecimento_id, hub_id)
);

COMMENT ON TABLE public.estabelecimentos_hubs IS
  'Junção pura loja<->hub — base da descoberta por lista do piloto (03-data-models.md '
  '§2.3): "quais hubs esta loja atende" / "quais lojas atendem este hub". Sem geo. '
  'Populada por operacao EXPLICITA (aprovacao do lojista ou gestao no Admin) — a REGRA '
  'de negocio de COMO/QUANDO vincular (auto na aprovacao? Admin? lojista escolhe?) NAO '
  'esta decidida (BR-HUB, pendente Caio) e NAO e presumida aqui. Integridade do pedido: '
  'um pedido so deve referenciar um hub_id que a loja atende — validacao SERVER-SIDE na '
  'criacao do pedido (Epico 6), pela existencia do par aqui; NAO ha FK composta em '
  'pedidos (evita bloquear desvinculo com pedidos historicos — §2.3 trade-off).';

-- Direções de consulta (§2.3):
--   • "quais hubs esta loja atende"  → coberta pela PK (estabelecimento_id, hub_id).
--   • "quais lojas atendem este hub" → índice dedicado abaixo (leitura CENTRAL da
--     descoberta por lista — query 5.2 do cliente: escolhe hub → lista lojas).
CREATE INDEX idx_estab_hubs_hub ON public.estabelecimentos_hubs(hub_id);

-- -----------------------------------------------------------------------------
-- RLS (05-security.md §2 + §3). Regra absoluta do §2: ENABLE + FORCE logo após criar.
-- FORCE vale até para o owner — protege contra bugs em caminhos privilegiados.
--
-- Sem recursão de RLS: as policies consultam `estabelecimentos` e `hubs` (tabelas
-- distintas) e `public.is_admin()` (SECURITY DEFINER, consulta admin_users). Nenhuma
-- policy consulta `estabelecimentos_hubs` a si mesma.
-- -----------------------------------------------------------------------------
ALTER TABLE public.estabelecimentos_hubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estabelecimentos_hubs FORCE ROW LEVEL SECURITY;

-- SELECT público (descoberta): expõe o par (loja, hub) SOMENTE se o hub está ATIVO
-- E o estabelecimento está ATIVO / não-pausado / não-excluído. Visibilidade DERIVADA
-- dos dois pais, via EXISTS — mesmo padrão de publico_ve_produtos (visibilidade
-- segue o pai) e coerente com:
--   • publico_ve_hubs (§3.8 / migration 20260812164000): hub inativo some do público.
--   • publico_ve_ativos de estabelecimentos (§3.4 / migration 20260812132331):
--     status='ativo' AND pausado_manualmente=false AND excluido_em IS NULL.
--
-- FALHA FECHADA: um vínculo de loja inativa/pausada/excluída, ou de hub inativo, NÃO
-- é exposto ao público — o cliente não deve ver na descoberta uma loja indisponível.
-- O admin vê QUALQUER par pela policy admin_gerencia_estab_hubs abaixo (permissiva,
-- OR'd com esta), necessário para o CRUD/gestão de vínculos.
--
-- Sem `TO` explícito (aplica a todos os roles, inclusive anon), consistente com
-- publico_ve_hubs / publico_ve_ativos / publico_ve_produtos. is_admin() não é chamado
-- aqui (não precisa: o acesso admin vem da policy FOR ALL, OR'd) — evita custo extra
-- na leitura pública de descoberta (a query 5.2 é o hot path).
CREATE POLICY publico_ve_estab_hubs ON public.estabelecimentos_hubs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.hubs h
      WHERE h.id = hub_id
        AND h.ativo = true
    )
    AND EXISTS (
      SELECT 1 FROM public.estabelecimentos e
      WHERE e.id = estabelecimento_id
        AND e.status = 'ativo'
        AND e.pausado_manualmente = false
        AND e.excluido_em IS NULL
    )
  );

-- ALL: escrita (INSERT/UPDATE/DELETE) e leitura irrestrita SOMENTE para admin.
-- Base SEGURA (fail-closed): quem POPULA o vínculo é decisão de negócio BR-HUB (auto
-- na aprovação? Admin? lojista escolhe seus hubs?) AINDA NÃO DECIDIDA (pendente Caio /
-- overlay 07 §"Descoberta"). NÃO inventamos a regra aqui: começamos só-admin. Se o
-- Caio decidir "lojista escolhe/vincula", entra DEPOIS uma policy ADICIONAL (ex.
-- lojista_gerencia_estab_hubs FOR INSERT/DELETE com WITH CHECK
-- `EXISTS(... estabelecimentos WHERE id = estabelecimento_id AND dono_user_id =
-- (SELECT auth.uid()))`), permissiva e OR'd — sem tocar nesta policy nem relaxar o
-- SELECT público. Sendo permissiva, esta policy também dá ao admin leitura de
-- QUALQUER par (defesa em profundidade além do SELECT público). is_admin() é SECURITY
-- DEFINER com EXECUTE para authenticated/anon (migration 20260812132330) → avaliável.
CREATE POLICY admin_gerencia_estab_hubs ON public.estabelecimentos_hubs
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
