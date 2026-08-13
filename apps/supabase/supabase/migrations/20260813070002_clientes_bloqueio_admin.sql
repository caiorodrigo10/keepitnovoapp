-- =============================================================================
-- Bloco 09 (Operação Admin — Épico 8) — bloqueio de cliente (Story 8.5), parte A:
--   colunas `bloqueado`/`motivo_bloqueio`/`bloqueado_em` + trigger anti-self-unblock
--   + policy admin de leitura/gestão + RPCs `bloquear_cliente`/`desbloquear_cliente`.
-- Autor: @data-engineer (Dara). Data: 2026-08-13.
--
-- Fontes normativas:
--   docs/stories/8.5.story.md AC3/AC5 (bloquear/desbloquear; motivo obrigatório).
--   docs/architecture/03-data-models.md §1.1 (colunas bloqueado/motivo_bloqueio).
--   docs/architecture/05-security.md §3.1 (admin_gerencia_clientes; cliente não pode
--       auto-(des)bloquear).
--   Nota crítica da migration 20260731143000_criar_clientes.sql (linhas 98-103):
--       "QUEM ADICIONAR A COLUNA 'bloqueado' DEVE ... impedir que cliente bloqueado se
--       auto-desbloqueie." — este arquivo cumpre esse débito.
--
-- ============================ CORREÇÃO DE FATO (importante) ===================
-- As Stories 8.5 e 8.9 afirmam que `clientes.bloqueado`/`motivo_bloqueio` "já existem
-- (Bloco 02)". FALSO: a migration real 20260731143000_criar_clientes.sql lista essas
-- colunas EXPLICITAMENTE em "FICA FORA" (linhas 12-14) — elas NUNCA foram aplicadas.
-- A afirmação das stories veio de §1.1 (modelo-alvo), não do schema aplicado. Este
-- arquivo cria as colunas de fato (confirmado pelo orquestrador via MCP).
--
-- ============================ ANTI-SELF-UNBLOCK (padrão do repo) ==============
-- O §3.1 tenta impedir o auto-(des)bloqueio com um WITH CHECK que faz subconsulta na
-- PRÓPRIA tabela clientes — INEXEQUÍVEL no Postgres ("infinite recursion detected in
-- policy", PG15), EXATAMENTE o mesmo problema já resolvido em estabelecimentos
-- (20260812123046, nota do trigger). Replico a solução PROVADA do repo: um BEFORE
-- UPDATE trigger `clientes_bloqueia_imutaveis` que bloqueia mudança de
-- bloqueado/motivo_bloqueio/bloqueado_em quando current_user IN ('authenticated','anon')
-- — ou seja, por QUALQUER caminho do app (incl. admin logado, que também é
-- 'authenticated'). Assim (des)bloqueio é RPC-ONLY (SECURITY DEFINER roda como owner →
-- current_user = owner → trigger libera), igual ao status de estabelecimentos (mudança
-- via aprovar/suspender RPC, nunca UPDATE direto). Cliente NUNCA se auto-desbloqueia.
--   A policy `cliente_atualiza_proprio` (ownership) fica INTOCADA (sem recursão).
--
-- ============================ LEITURA ADMIN (por que só admin_gerencia_clientes) =
-- Sigo o precedente de 20260812132331 (admin_gerencia_estab): a policy admin FOR ALL
-- USING(is_admin()) já concede ao admin SELECT de TODAS as linhas (FOR ALL cobre SELECT,
-- OR'd com cliente_le_proprio). Logo NÃO recrio `cliente_le_proprio` com `OR is_admin()`
-- (seria SELECT redundante — a nota da 20260731143000 pedia isso, mas o precedente mais
-- recente de estabelecimentos mostrou que é desnecessário com a policy FOR ALL). As
-- policies de cliente (cliente_le_proprio/cliente_atualiza_proprio/sem_insert_direto)
-- ficam INTOCADAS. O admin passa a poder LISTAR clientes (Story 8.5 AC1/AC2).
--   Combinada com o trigger: no nível RLS o admin pode UPDATE, MAS o trigger barra a
--   mudança dos campos de bloqueio por 'authenticated' → (des)bloqueio via RPC. Mesma
--   defesa-em-profundidade de estabelecimentos.
--
-- ATOMICIDADE: colunas + trigger + policy + RPCs numa transação (o applier envolve o
-- arquivo). BEGIN/COMMIT omitidos de propósito.
--
-- ROLLBACK (forward-only, nesta ordem):
--     DROP FUNCTION IF EXISTS public.desbloquear_cliente(uuid);
--     DROP FUNCTION IF EXISTS public.bloquear_cliente(uuid, text);
--     DROP POLICY   IF EXISTS admin_gerencia_clientes ON public.clientes;
--     DROP TRIGGER  IF EXISTS trg_clientes_imutaveis ON public.clientes;
--     DROP FUNCTION IF EXISTS public.clientes_bloqueia_imutaveis();
--     ALTER TABLE public.clientes DROP COLUMN IF EXISTS bloqueado_em,
--       DROP COLUMN IF EXISTS motivo_bloqueio, DROP COLUMN IF EXISTS bloqueado;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Colunas de bloqueio (idempotente).
-- -----------------------------------------------------------------------------
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS bloqueado       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_bloqueio text,
  ADD COLUMN IF NOT EXISTS bloqueado_em    timestamptz;

COMMENT ON COLUMN public.clientes.bloqueado IS
  'Story 8.5. Cliente bloqueado pelo admin (fraude/abuso) não cria novos pedidos '
  '(criar_pedido rejeita com CLIENTE_BLOQUEADO). (Des)bloqueio SÓ via RPC admin '
  '(bloquear_cliente/desbloquear_cliente) — trigger impede mudança pelo app.';

-- -----------------------------------------------------------------------------
-- 2) Trigger anti-self-unblock (espelha estabelecimentos_bloqueia_imutaveis).
--    Bloqueia mudança dos campos de bloqueio por 'authenticated'/'anon' — inclusive
--    o próprio cliente (ownership) e o admin logado (que também é authenticated).
--    Só o caminho SECURITY DEFINER (owner) muda esses campos → RPC-only.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clientes_bloqueia_imutaveis()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.bloqueado       IS DISTINCT FROM OLD.bloqueado
       OR NEW.motivo_bloqueio IS DISTINCT FROM OLD.motivo_bloqueio
       OR NEW.bloqueado_em  IS DISTINCT FROM OLD.bloqueado_em THEN
      RAISE EXCEPTION 'COLUNA_IMUTAVEL: bloqueado/motivo_bloqueio/bloqueado_em só mudam por RPC admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.clientes_bloqueia_imutaveis() IS
  'Story 8.5. Trigger: bloqueia mudança de bloqueado/motivo_bloqueio/bloqueado_em por '
  'authenticated/anon (impede cliente auto-desbloquear e força (des)bloqueio via RPC '
  'SECURITY DEFINER). Mesmo padrão de estabelecimentos_bloqueia_imutaveis.';

DROP TRIGGER IF EXISTS trg_clientes_imutaveis ON public.clientes;
CREATE TRIGGER trg_clientes_imutaveis
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.clientes_bloqueia_imutaveis();

-- -----------------------------------------------------------------------------
-- 3) Policy admin (05-security.md §3.1). FOR ALL is_admin() — dá ao admin SELECT de
--    todos os clientes (lista da Story 8.5) + demais operações no nível RLS. OR'd com
--    as policies de cliente (não removidas). Idempotente (DROP IF EXISTS + CREATE).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS admin_gerencia_clientes ON public.clientes;
CREATE POLICY admin_gerencia_clientes ON public.clientes
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4) RPC bloquear_cliente — admin bloqueia; grava motivo + timestamp.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bloquear_cliente(
  p_cliente_id uuid,
  p_motivo     text
)
RETURNS TABLE (cliente_id uuid, bloqueado boolean, bloqueado_em timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA' USING HINT = 'Sessão ausente';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING HINT = 'Apenas administradores bloqueiam clientes';
  END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'MOTIVO_OBRIGATORIO' USING HINT = 'Informe o motivo do bloqueio';
  END IF;

  UPDATE public.clientes c
     SET bloqueado       = true,
         motivo_bloqueio = p_motivo,
         bloqueado_em    = NOW()
   WHERE c.id = p_cliente_id
  RETURNING c.id, c.bloqueado, c.bloqueado_em
       INTO cliente_id, bloqueado, bloqueado_em;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLIENTE_NAO_ENCONTRADO' USING HINT = 'Nenhum cliente com o id informado';
  END IF;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.bloquear_cliente(uuid, text) IS
  'Story 8.5. Admin bloqueia um cliente (bloqueado=true, motivo_bloqueio, bloqueado_em=NOW). '
  'SECURITY DEFINER + search_path='''' + guard is_admin(). Erros: AUTENTICACAO_NECESSARIA, '
  'NAO_AUTORIZADO, MOTIVO_OBRIGATORIO, CLIENTE_NAO_ENCONTRADO.';

REVOKE ALL ON FUNCTION public.bloquear_cliente(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bloquear_cliente(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.bloquear_cliente(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5) RPC desbloquear_cliente — admin desbloqueia; limpa motivo + timestamp.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.desbloquear_cliente(
  p_cliente_id uuid
)
RETURNS TABLE (cliente_id uuid, bloqueado boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA' USING HINT = 'Sessão ausente';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING HINT = 'Apenas administradores desbloqueiam clientes';
  END IF;

  UPDATE public.clientes c
     SET bloqueado       = false,
         motivo_bloqueio = NULL,
         bloqueado_em    = NULL
   WHERE c.id = p_cliente_id
  RETURNING c.id, c.bloqueado
       INTO cliente_id, bloqueado;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLIENTE_NAO_ENCONTRADO' USING HINT = 'Nenhum cliente com o id informado';
  END IF;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.desbloquear_cliente(uuid) IS
  'Story 8.5. Admin desbloqueia um cliente (bloqueado=false, limpa motivo/timestamp). '
  'SECURITY DEFINER + search_path='''' + guard is_admin(). Erros: AUTENTICACAO_NECESSARIA, '
  'NAO_AUTORIZADO, CLIENTE_NAO_ENCONTRADO.';

REVOKE ALL ON FUNCTION public.desbloquear_cliente(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.desbloquear_cliente(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.desbloquear_cliente(uuid) TO authenticated;
