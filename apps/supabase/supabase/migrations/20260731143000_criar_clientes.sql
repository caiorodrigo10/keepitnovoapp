-- =============================================================================
-- Story 2.3 — tabela `clientes`, RLS e trigger de sincronização com auth.users
-- Épico 2 (Auth Cliente). Autor: @data-engineer (Dara). Data: 2026-07-31.
--
-- Fontes normativas:
--   docs/architecture/03-data-models.md §1.1  (DDL + trigger)
--   docs/architecture/05-security.md   §3.1  (RLS + policies)
--   docs/prd/epics/2-auth-cliente.md    Story 2.3, ACs 1-3
--   docs/stories/2.3.story.md           Tasks 1, 2, 3 (delta de 5 colunas)
--
-- ESCOPO (delta desta story — NÃO antecipar colunas de épicos futuros):
--   id, nome, telefone (nullable), cpf (nullable), criado_em.
--   Ficam FORA: expo_push_token, notificacoes_ativas, bloqueado, motivo_bloqueio,
--   hub_padrao_id, atualizado_em, excluido_em e os índices idx_clientes_*.
--   Decisão 10.4: NÃO existe `telefone_confirmado` nem a tabela
--   `clientes_confirmacao_telefone` (SMS fora do MVP).
--
-- -----------------------------------------------------------------------------
-- ATOMICIDADE (obrigatório — ver Story 2.3, Task 1, item [PO])
-- Tabela + RLS + policies + trigger vão neste ÚNICO arquivo e devem ser
-- aplicados em UMA ÚNICA TRANSAÇÃO. Estado parcial aqui é falha de segurança:
-- uma tabela `clientes` criada sem RLS, com um trigger SECURITY DEFINER
-- inserindo nela, fica exposta.
--   * `supabase db push` e o `apply_migration` do MCP Supabase já envolvem o
--     arquivo inteiro em uma transação — nada a fazer.
--   * Se aplicar manualmente via psql, use OBRIGATORIAMENTE:
--         psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f <este arquivo>
--   * BEGIN/COMMIT explícitos foram omitidos de propósito, para não encerrar
--     precocemente a transação externa dos appliers acima.
--
-- -----------------------------------------------------------------------------
-- ROLLBACK (executar nesta ordem exata — há dependências):
--     DROP TRIGGER IF EXISTS trg_criar_cliente_signup ON auth.users;
--     DROP FUNCTION IF EXISTS public.criar_cliente_apos_signup();
--     DROP TABLE IF EXISTS public.clientes;   -- as policies caem junto
--
-- -----------------------------------------------------------------------------
-- CONFIGURAÇÃO DE PROJETO FORA DO GIT (Story 2.3, Task 4 / decisão 10.5)
-- Registro durável, porque isto NÃO é migration e não aparece em `git diff`:
--     Projeto ......: keepit-dev (ref jhhbewnmnorhmsdvfppo)
--     Caminho ......: Painel Supabase → Authentication → Providers → Email
--     Valor esperado: "Confirm email" = OFF  (API: mailer_autoconfirm = true)
--     Estado em 2026-07-31 (lido via GET /auth/v1/settings): mailer_autoconfirm
--                     = false, ou seja, "Confirm email" está ON — PENDENTE.
--     Dono .........: @data-engineer (Dara) executa e registra a data.
--     ATENÇÃO: um projeto Supabase NOVO (produção) nasce com "Confirm email" ON
--     e não herda nada do keepit-dev. Desligar é passo obrigatório de setup.
--
-- -----------------------------------------------------------------------------
-- PRÉ-CONDIÇÃO DE AMBIENTE (verificar antes de aplicar):
--   O trigger abaixo é SECURITY DEFINER e insere em `public.clientes`, que tem
--   FORCE ROW LEVEL SECURITY e uma policy de INSERT `WITH CHECK (false)`.
--   FORCE RLS aplica RLS até ao dono da tabela; só o atributo de role
--   BYPASSRLS (ou superuser) escapa. No Supabase o role `postgres` — que é o
--   que aplica migrations — tem BYPASSRLS, então o INSERT do trigger passa.
--   Confirme antes de aplicar:
--     SELECT current_user, rolbypassrls FROM pg_roles WHERE rolname = current_user;
--   Se `rolbypassrls` for false, NÃO aplique: o signup falharia inteiro
--   (falha ruidosa, não silenciosa) — escale a @architect.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Task 1 — Tabela (AC1)
-- -----------------------------------------------------------------------------
CREATE TABLE public.clientes (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome       text NOT NULL,
  telefone   text,                                    -- opcional e NÃO verificado (decisão 10.4)
  cpf        text,                                    -- preenchido só no primeiro checkout
  criado_em  timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.clientes IS
  'Perfil do cliente, espelha auth.users. Story 2.3 cria o subconjunto mínimo '
  '(id, nome, telefone, cpf, criado_em). Demais colunas de 03-data-models.md §1.1 '
  'entram por migrations incrementais em épicos posteriores.';

-- -----------------------------------------------------------------------------
-- Task 2 — RLS (AC2)
-- -----------------------------------------------------------------------------
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes FORCE ROW LEVEL SECURITY;  -- vale até para o owner

-- SELECT: cliente vê apenas o próprio perfil.
-- DÉBITO (débito de sequenciamento, falha FECHADA — restringe acesso):
--   05-security.md §3.1 tem `USING (id = auth.uid() OR is_admin())`. A função
--   is_admin() depende da tabela `admin_users`, que é do Épico 3 e NÃO existe
--   no keepit-dev (confirmado por consulta real em 2026-07-31: PGRST205,
--   "Could not find the table 'public.admin_users'"). Omitir `OR is_admin()`
--   só restringe — nenhum admin lê `clientes` até o Épico 3, que é o estado
--   correto enquanto admin não existe. Quem criar `admin_users` deve, na mesma
--   migration, recriar esta policy com `OR is_admin()` e criar também a policy
--   `admin_gerencia_clientes` (FOR ALL USING (is_admin()) WITH CHECK (is_admin())).
CREATE POLICY cliente_le_proprio ON public.clientes
  FOR SELECT
  USING (id = (SELECT auth.uid()));

-- ATENÇÃO: WITH CHECK incompleto vs. docs/architecture/05-security.md §3.1.
-- Falta 'AND bloqueado = (SELECT bloqueado FROM clientes WHERE id = auth.uid())'
-- porque a coluna 'bloqueado' não existe nesta migration (Story 2.3).
-- QUEM ADICIONAR A COLUNA 'bloqueado' DEVE, NA MESMA MIGRATION, FAZER
-- DROP POLICY cliente_atualiza_proprio ON clientes; e recriá-la COM a cláusula.
-- Sem isso, cliente bloqueado se auto-desbloqueia.
CREATE POLICY cliente_atualiza_proprio ON public.clientes
  FOR UPDATE
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- INSERT só acontece via trigger SECURITY DEFINER (Task 3). Ninguém insere direto.
CREATE POLICY sem_insert_direto_clientes ON public.clientes
  FOR INSERT
  WITH CHECK (false);

-- Sem policy de DELETE: nenhum role autenticado apaga linhas de `clientes`.
-- A remoção acontece por ON DELETE CASCADE quando o auth.users correspondente
-- é apagado. Exclusão de conta (soft delete / excluido_em) é da Story 2.9.

-- -----------------------------------------------------------------------------
-- Task 3 — Trigger de sincronização auth.users → clientes (AC3)
--
-- Contrato normativo de raw_user_meta_data (Story 2.3, Dev Notes — FIXADO):
--   'nome'     : string não vazia  → clientes.nome
--   'telefone' : string ou ausente → clientes.telefone (vazio vira NULL)
-- Chaves em minúsculas, sem acento, sem camelCase. Nenhuma outra chave.
-- NOTA: COALESCE(..., '') NÃO viola o NOT NULL — se a chave divergir, grava
-- nome = '' silenciosamente. Por isso a verificação da Task 4b assere o valor
-- de `nome` por SELECT real, não por leitura do SQL.
-- `SET search_path` é obrigatório em SECURITY DEFINER (hardening; evita
-- sequestro de resolução de nomes por search_path do chamador).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_cliente_apos_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.clientes (id, nome, telefone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', ''),
    NULLIF(NEW.raw_user_meta_data->>'telefone', '')  -- ausente/vazio vira NULL
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_criar_cliente_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.criar_cliente_apos_signup();
