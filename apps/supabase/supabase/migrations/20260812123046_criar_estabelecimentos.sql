-- =============================================================================
-- Story 3.5 — tabela `estabelecimentos` (schema ENXUTO do piloto), RLS e trigger
-- Épico 3 (Lojista / Aprovação). Autor: @data-engineer (Dara). Data: 2026-08-12.
--
-- Esta é a PRIMEIRA migration que cria `estabelecimentos` — sinalizada como
-- pendente desde a Story 3.2 (débito MNT-001 do QA Gate) e pré-condição
-- bloqueante da Story 3.5, a primeira que efetivamente ESCREVE na tabela.
--
-- Fontes normativas (seguidas à risca):
--   docs/architecture/03-data-models.md §1.4  (DDL enxuto do piloto + índices)
--   docs/architecture/03-data-models.md §"Trigger utilitário compartilhado"
--   docs/architecture/05-security.md   §3.4   (RLS + policies)
--   docs/stories/3.5.story.md          AC3/AC4; Dependencies itens 1 e 2
--
-- ESCOPO ENXUTO DO PILOTO (2026-08-12) — confirmado no §1.4 ATUAL:
--   * lat / lng / raio_atendimento_km  → NULLABLE (descoberta por lista, geo adiado)
--   * asaas_api_key_encrypted          → NÃO EXISTE (modelo-alvo pós-piloto, pgsodium)
--   * asaas_wallet_id                  → NULLABLE, sempre NULL no piloto (conta Asaas única)
--   * idx_estab_geo                    → NÃO criado (sem consulta geográfica no piloto)
--   As três colunas geo e o índice permanecem no modelo-alvo (§1.4) e NÃO são
--   apagados — voltam a NOT NULL / criados quando geo/Haversine for reativado.
--
-- -----------------------------------------------------------------------------
-- ATOMICIDADE (obrigatório): tabela + índices + trigger + RLS + policies vão
-- neste ÚNICO arquivo, aplicados em UMA transação. Estado parcial aqui é falha
-- de segurança: uma tabela sem RLS ativada fica exposta. `supabase db push` e o
-- `apply_migration` do MCP Supabase já envolvem o arquivo inteiro em transação.
-- Se aplicar manualmente via psql:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f <este arquivo>
-- BEGIN/COMMIT explícitos omitidos de propósito (não encerrar a transação externa).
--
-- -----------------------------------------------------------------------------
-- ROLLBACK (forward-only; se necessário reverter, nesta ordem):
--     DROP TABLE IF EXISTS public.estabelecimentos CASCADE;  -- policies/índices/trigger caem junto
--     -- NÃO dropar public.set_atualizado_em(): é utilitário compartilhado e será
--     -- reutilizado por outras tabelas mutáveis. Só remover se nenhuma outra o usar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Trigger utilitário compartilhado (03-data-models.md §"Trigger utilitário").
-- Criado aqui pela PRIMEIRA vez — nenhuma migration anterior o define
-- (verificado: `clientes` da Story 2.3 não tem `atualizado_em`, logo nunca criou
-- esta função). `CREATE OR REPLACE` torna a criação idempotente e reutilizável
-- por futuras tabelas mutáveis (produtos, pedidos, ...).
-- Hardening: `SET search_path = ''` fecha o lint 0011 (function_search_path_mutable);
-- NOW() resolve por pg_catalog (sempre implícito no path), sem depender de schema.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_atualizado_em()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Tabela `estabelecimentos` — schema ENXUTO do piloto (03-data-models.md §1.4)
-- -----------------------------------------------------------------------------
CREATE TABLE public.estabelecimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dono_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Dados básicos
  nome_fantasia text NOT NULL,
  cnpj text NOT NULL UNIQUE,
  responsavel_nome text NOT NULL,
  telefone text NOT NULL,
  categoria text NOT NULL,                           -- 'farmacia', 'alimentacao', 'vestuario', ...
  descricao text,
  foto_fachada_url text,
  dados_receita jsonb,                               -- cache do retorno BrasilAPI (NULL no piloto)

  -- Operacional
  endereco text NOT NULL,
  lat numeric(9,6),                                  -- NULLABLE no piloto (geo adiado, §1.4)
  lng numeric(9,6),                                  -- NULLABLE no piloto (geo adiado, §1.4)
  raio_atendimento_km numeric(4,1)
    CHECK (raio_atendimento_km IS NULL OR (raio_atendimento_km > 0 AND raio_atendimento_km <= 30)),  -- NULLABLE no piloto; CHECK só se preenchido
  tempo_medio_entrega_min int NOT NULL CHECK (tempo_medio_entrega_min BETWEEN 5 AND 240),
  taxa_deslocamento_reais numeric(6,2) NOT NULL DEFAULT 0 CHECK (taxa_deslocamento_reais >= 0),
  ticket_minimo_reais numeric(10,2),                 -- NULL = usa global R$ 20

  -- Financeiro
  chave_pix text NOT NULL,
  chave_pix_tipo text NOT NULL
    CHECK (chave_pix_tipo IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  asaas_wallet_id text,                              -- reservado; sempre NULL no piloto (conta Asaas única)
  -- asaas_api_key_encrypted bytea NÃO ENTRA NO PILOTO (modelo-alvo pós-piloto, pgsodium) — §1.4

  -- Estado
  status text NOT NULL DEFAULT 'em_analise'
    CHECK (status IN ('em_analise', 'ativo', 'rejeitado', 'suspenso')),
  motivo_rejeicao text,
  motivo_suspensao text,
  pausado_manualmente boolean NOT NULL DEFAULT false,

  aprovado_em timestamptz,
  aprovado_por uuid REFERENCES auth.users(id),
  suspenso_em timestamptz,

  criado_em timestamptz NOT NULL DEFAULT NOW(),
  atualizado_em timestamptz NOT NULL DEFAULT NOW(),
  excluido_em timestamptz
);

COMMENT ON TABLE public.estabelecimentos IS
  'Loja do lojista (1 conta = 1 estabelecimento). Story 3.5 cria o schema enxuto '
  'do piloto (03-data-models.md §1.4): geo NULLABLE, sem asaas_api_key_encrypted, '
  'asaas_wallet_id sempre NULL. Colunas geo/wallet voltam ao modelo-alvo por '
  'migration incremental quando geo/subconta Asaas forem reativados.';

-- Índices do §1.4 — MENOS idx_estab_geo (adiado: sem consulta geográfica no piloto).
CREATE INDEX idx_estab_status ON public.estabelecimentos(status);
CREATE INDEX idx_estab_categoria ON public.estabelecimentos(categoria) WHERE status = 'ativo';
CREATE INDEX idx_estab_cnpj ON public.estabelecimentos(cnpj);
-- idx_estab_geo NÃO criado — ver nota "Geo adiado" no §1.4. Reversão do modelo-alvo:
-- CREATE INDEX idx_estab_geo ON estabelecimentos(lat, lng) WHERE status='ativo' AND pausado_manualmente=false;

-- Trigger de atualização automática de `atualizado_em`.
CREATE TRIGGER trg_estabelecimentos_atualizado
  BEFORE UPDATE ON public.estabelecimentos
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

-- -----------------------------------------------------------------------------
-- Imutabilidade de colunas sensíveis pelo caminho do app do lojista.
-- POR QUE UM TRIGGER (e não WITH CHECK na policy de UPDATE): o §3.4 tenta impedir
-- a mudança de status/cnpj/asaas_wallet_id com uma subconsulta na PRÓPRIA tabela
-- dentro do WITH CHECK. Isso é INEXEQUÍVEL no Postgres: uma policy que consulta a
-- própria tabela dispara "infinite recursion detected in policy" (verificado em PG
-- 15). Além disso a forma literal do §3.4 tem bug de shadowing (`id = id` sempre
-- verdadeiro). Movemos a imutabilidade para um BEFORE UPDATE trigger — mesmo
-- INTENTO do §3.4, agora enforceável. RECOMENDA-SE atualizar o §3.4 com esta forma.
--
-- Só restringe os roles do app (authenticated/anon). Caminhos privilegiados —
-- a RPC SECURITY DEFINER (roda como owner), service_role e o fluxo admin da
-- Story 3.7 (SECURITY DEFINER/service_role) — NÃO são afetados: eles precisam
-- legitimamente mudar `status` (aprovar/suspender). `current_user` reflete o role
-- efetivo (dentro de uma função SECURITY DEFINER, é o owner).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.estabelecimentos_bloqueia_imutaveis()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.dono_user_id IS DISTINCT FROM OLD.dono_user_id THEN
      RAISE EXCEPTION 'COLUNA_IMUTAVEL: dono_user_id nao pode ser alterado';
    END IF;
    IF NEW.cnpj IS DISTINCT FROM OLD.cnpj THEN
      RAISE EXCEPTION 'COLUNA_IMUTAVEL: cnpj nao pode ser alterado';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'COLUNA_IMUTAVEL: status so pode ser alterado por admin';
    END IF;
    IF NEW.asaas_wallet_id IS DISTINCT FROM OLD.asaas_wallet_id THEN
      RAISE EXCEPTION 'COLUNA_IMUTAVEL: asaas_wallet_id nao pode ser alterado pelo lojista';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_estabelecimentos_imutaveis
  BEFORE UPDATE ON public.estabelecimentos
  FOR EACH ROW EXECUTE FUNCTION public.estabelecimentos_bloqueia_imutaveis();

-- -----------------------------------------------------------------------------
-- RLS (05-security.md §3.4). Regra absoluta do §2: ENABLE + FORCE logo após criar.
-- -----------------------------------------------------------------------------
ALTER TABLE public.estabelecimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estabelecimentos FORCE ROW LEVEL SECURITY;  -- vale até para o owner

-- SELECT: público vê só estabelecimentos ativos; dono vê o próprio.
-- DÉBITO DE SEQUENCIAMENTO (falha FECHADA — só restringe): o §3.4 tem
-- `OR is_admin()`. A função is_admin() depende da tabela `admin_users`, que é da
-- Story 3.7 e NÃO existe no keepit-dev (mesma situação registrada na Story 2.3,
-- migration 20260731143000). Omitir `OR is_admin()` apenas restringe — nenhum
-- admin lê estabelecimentos até a 3.7. QUEM CRIAR `admin_users`/`is_admin()` NA
-- STORY 3.7 DEVE, NA MESMA MIGRATION: (1) DROP+CREATE desta policy adicionando
-- `OR is_admin()`; (2) criar a policy `admin_gerencia_estab`
-- (FOR ALL USING (is_admin()) WITH CHECK (is_admin())) — ver §3.4.
CREATE POLICY publico_ve_ativos ON public.estabelecimentos
  FOR SELECT
  USING (
    (status = 'ativo' AND pausado_manualmente = false AND excluido_em IS NULL)
    OR dono_user_id = (SELECT auth.uid())
  );

-- UPDATE: lojista atualiza dados operacionais do próprio estabelecimento.
-- A restrição de OWNERSHIP fica aqui (USING + WITH CHECK dono_user_id = auth.uid()).
-- A IMUTABILIDADE de status/cnpj/asaas_wallet_id/dono_user_id fica no trigger
-- `trg_estabelecimentos_imutaveis` (ver acima) — a forma do §3.4 com subconsulta
-- na própria tabela é inexequível no Postgres (recursão infinita de policy) e tem
-- bug de shadowing. Ownership-only na policy + trigger = mesmo intento do §3.4,
-- enforceável e testado (sem recursão).
CREATE POLICY lojista_atualiza_proprio ON public.estabelecimentos
  FOR UPDATE
  USING (dono_user_id = (SELECT auth.uid()))
  WITH CHECK (dono_user_id = (SELECT auth.uid()));

-- INSERT: lojista cria o próprio estabelecimento em `em_analise`, sem wallet.
-- Esta é a policy que a Story 3.5 exercita no submit. Na prática o INSERT real
-- passa pela RPC `criar_estabelecimento_completo` (SECURITY DEFINER, migration
-- 20260812123048) que roda como owner e não depende desta policy; mantemo-la
-- como defesa em profundidade para qualquer INSERT direto com a chave anon/
-- authenticated do app.
CREATE POLICY lojista_cria_proprio ON public.estabelecimentos
  FOR INSERT
  WITH CHECK (
    dono_user_id = (SELECT auth.uid())
    AND status = 'em_analise'
    AND asaas_wallet_id IS NULL
  );

-- Sem policy de DELETE: nenhum role autenticado apaga linhas de `estabelecimentos`.
-- A remoção ocorre por ON DELETE CASCADE quando o auth.users correspondente é
-- apagado. Soft delete (excluido_em) e suspensão são caminhos administrativos
-- (Stories 3.7-3.9), fora do escopo desta migration.

-- -----------------------------------------------------------------------------
-- TODO STORY 3.7 (admin) — NÃO criar aqui (admin_users/is_admin() são da 3.7):
--   1. DROP POLICY publico_ve_ativos; recriar com `OR is_admin()`.
--   2. CREATE POLICY admin_gerencia_estab ON estabelecimentos
--        FOR ALL USING (is_admin()) WITH CHECK (is_admin());
--   (Ver §3.4.)
-- -----------------------------------------------------------------------------
