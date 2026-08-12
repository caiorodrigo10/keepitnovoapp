-- =============================================================================
-- Story 3.2 — Desambiguação de signup cliente × lojista no trigger de `clientes`
-- Épico 3 (Lojista / Aprovação). Autor: @data-engineer (Dara). Data: 2026-08-12.
--
-- PROBLEMA
--   A migration 20260731143000_criar_clientes.sql (Story 2.3) instala o trigger
--   trg_criar_cliente_signup (AFTER INSERT ON auth.users) que executa
--   public.criar_cliente_apos_signup() e SEMPRE insere uma linha em
--   public.clientes. Com o Épico 3, o LOJISTA passa a criar conta no MESMO
--   Supabase Auth (e-mail + senha, mesma tabela auth.users). Sem correção, o
--   signup de um lojista dispararia o trigger e criaria uma linha ÓRFÃ/incorreta
--   em `clientes` (nome = '' e telefone possivelmente nulo), vazando identidade
--   entre domínios. AC7 da Story 3.2 exige que isso nunca aconteça.
--
-- Fontes normativas:
--   docs/stories/3.2.story.md            AC7; Dependencies item 1; Tasks (@data-engineer)
--   docs/architecture/03-data-models.md  §1.1 (trigger criar_cliente_apos_signup)
--   20260731143000_criar_clientes.sql    função + hardening REVOKE EXECUTE
--
-- DECISÃO DE DISCRIMINAÇÃO (compatibilidade é ESSENCIAL)
--   Discriminamos por NEW.raw_user_meta_data->>'role'.
--   * role = 'lojista'  → PULA a criação de `clientes` (retorna sem inserir).
--   * role AUSENTE      → cria `clientes` normalmente (comportamento default).
--   * role qualquer outro valor → cria `clientes` (fail-open só para o default
--     do cliente; nenhum outro role existe no piloto).
--   RAZÃO da compatibilidade: os signups de CLIENTE atuais (Stories 2.3/2.6)
--   NÃO enviam a chave 'role' em raw_user_meta_data. Portanto o caminho default
--   (role ausente) DEVE continuar criando `clientes`, senão quebraria o cliente
--   em produção. Só PULAMOS quando 'role' = 'lojista' EXPLICITAMENTE.
--   Semântica SQL: quando 'role' está ausente, ->>'role' devolve NULL e
--   (NULL = 'lojista') avalia para NULL, que o IF trata como FALSE → cai no
--   INSERT. Comportamento default preservado sem depender de COALESCE.
--
-- POR QUE ESTA STORY NÃO CRIA `estabelecimentos`
--   O recorte do @sm (Story 3.2, "Recorte de escopo do piloto", opção B) cria
--   SOMENTE a conta Supabase Auth do lojista; nenhuma linha em
--   `estabelecimentos` é escrita por esta Story (isso é da Story 3.5, AC3).
--   Logo, a ÚNICA mudança de banco necessária para a 3.2 é a correção do
--   trigger abaixo. A migration de `estabelecimentos` (schema enxuto do piloto,
--   §1.4) + sua RLS por ownership são preparo das Stories 3.4/3.5 e ficam FORA
--   deste arquivo, deliberadamente, para não antecipar schema não usado por 3.2.
--
-- FORWARD-ONLY / NÃO DESTRUTIVA / IDEMPOTENTE
--   Usamos CREATE OR REPLACE FUNCTION — NÃO dropamos o trigger nem a função.
--   O trigger trg_criar_cliente_signup continua apontando para a mesma função;
--   substituir o corpo é transparente para ele.
--
-- HARDENING (preservar — ver 20260731143000_criar_clientes.sql, bloco final)
--   CREATE OR REPLACE FUNCTION NÃO restaura grants: os REVOKE EXECUTE aplicados
--   na Story 2.3 permanecem em vigor após este REPLACE. Ainda assim, reaplicamos
--   os REVOKE ao final por defesa em profundidade e para deixar a migration
--   auto-suficiente e auditável. REVOKE é idempotente. SECURITY DEFINER e
--   SET search_path = public, pg_temp são mantidos.
--
-- ATOMICIDADE
--   Arquivo único, uma transação. `supabase db push` e o `apply_migration` do
--   MCP Supabase já envolvem o arquivo inteiro em transação — BEGIN/COMMIT
--   explícitos omitidos de propósito (não encerrar a transação externa).
--
-- ROLLBACK (forward-only; se necessário reverter, restaurar o corpo da 2.3):
--   Reaplicar o corpo original de criar_cliente_apos_signup() (sem o guard de
--   role) via novo CREATE OR REPLACE. NÃO dropar trigger/função — o cliente
--   depende deles. Ver 20260731143000_criar_clientes.sql linhas 131-168.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Substitui o corpo do trigger: cria `clientes` só quando o signup NÃO é lojista.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_cliente_apos_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Signup de lojista (Épico 3): não espelhar em `clientes`. A identidade do
  -- lojista vive só em auth.users nesta fatia; seu domínio (`estabelecimentos`)
  -- é escrito pelas Stories 3.4/3.5, não por trigger.
  IF NEW.raw_user_meta_data->>'role' = 'lojista' THEN
    RETURN NEW;
  END IF;

  -- Signup de cliente (Stories 2.3/2.6) — 'role' ausente cai aqui (default).
  -- Contrato normativo de raw_user_meta_data (Story 2.3, FIXADO):
  --   'nome'     : string não vazia  → clientes.nome
  --   'telefone' : string ou ausente → clientes.telefone (vazio vira NULL)
  INSERT INTO public.clientes (id, nome, telefone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', ''),
    NULLIF(NEW.raw_user_meta_data->>'telefone', '')  -- ausente/vazio vira NULL
  );
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Hardening — reaplicado por defesa em profundidade (idempotente).
-- Ver bloco "Hardening" no cabeçalho e a migration da Story 2.3.
-- NÃO REMOVER. Verificar com get_advisors(type='security') após aplicar.
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.criar_cliente_apos_signup() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.criar_cliente_apos_signup() FROM anon;
REVOKE EXECUTE ON FUNCTION public.criar_cliente_apos_signup() FROM authenticated;
