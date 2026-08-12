-- =============================================================================
-- Story 3.5 — bucket de Storage `fachadas` (PRIVADO) + policies em storage.objects
-- Épico 3 (Lojista / Aprovação). Autor: @data-engineer (Dara). Data: 2026-08-12.
--
-- Fontes normativas:
--   docs/architecture/05-security.md §6.7  (Buckets privados por padrão; URLs
--                                           assinadas de expiração curta 5-60 min;
--                                           validar MIME e tamanho max 5MB)
--   docs/stories/3.5.story.md        AC2; Dependencies item 4
--
-- CONTRASTE COM `hubs`: `hubs` é o ÚNICO bucket público (fotos institucionais).
-- A foto de fachada de UMA loja não é asset institucional — segue a regra geral
-- do §6.7: PRIVADO, lido só por URL assinada gerada no backend.
--
-- CONVENÇÃO DE PATH (decisão @data-engineer, exigida para a policy funcionar):
--   O objeto é gravado sob a pasta do dono:  {auth.uid()}/<arquivo>
--   ex.: "6f1c...e2/fachada.jpg". A primeira pasta do path DEVE ser o uid do
--   lojista. `storage.foldername(name)` devolve o array de pastas; [1] é a raiz.
--   O @dev DEVE fazer upload usando exatamente esse prefixo; a URL final vai em
--   estabelecimentos.foto_fachada_url (path do objeto, não URL pública).
--
-- ATOMICIDADE: bucket + policies em UMA transação. Idempotente (ON CONFLICT /
-- DROP POLICY IF EXISTS) para re-aplicação segura.
--
-- NOTA DE APLICAÇÃO: este arquivo pode ser aplicado como migration normal
-- (`apply_migration`/`db push`). Alternativamente, o `insert into storage.buckets`
-- pode ser executado isoladamente via MCP `execute_sql` — o SQL é o mesmo abaixo.
--
-- ROLLBACK (forward-only):
--     DROP POLICY IF EXISTS fachadas_lojista_le_propria      ON storage.objects;
--     DROP POLICY IF EXISTS fachadas_lojista_insere_propria  ON storage.objects;
--     DROP POLICY IF EXISTS fachadas_lojista_atualiza_propria ON storage.objects;
--     DROP POLICY IF EXISTS fachadas_lojista_remove_propria  ON storage.objects;
--     DELETE FROM storage.buckets WHERE id = 'fachadas';   -- só se vazio
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Bucket PRIVADO `fachadas` com limite de 5MB e MIME de imagem (§6.7).
--    public = false → sem URL pública permanente; acesso só por URL assinada.
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fachadas',
  'fachadas',
  false,
  5242880,                                           -- 5 MB (§6.7)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2) Policies em storage.objects (RLS já vem habilitada por padrão no Supabase).
--    Escopo restrito ao bucket 'fachadas' e à pasta do próprio dono (uid).
--    DROP IF EXISTS antes de CREATE → re-aplicação idempotente.
-- -----------------------------------------------------------------------------

-- SELECT: o dono lê os próprios objetos (ex.: para gerar URL assinada com a
-- chave authenticated). Leitura por terceiros acontece só via URL assinada
-- gerada no backend (service_role), que dispensa policy de SELECT.
DROP POLICY IF EXISTS fachadas_lojista_le_propria ON storage.objects;
CREATE POLICY fachadas_lojista_le_propria ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'fachadas'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- INSERT: o lojista só grava sob a própria pasta {uid}/...
DROP POLICY IF EXISTS fachadas_lojista_insere_propria ON storage.objects;
CREATE POLICY fachadas_lojista_insere_propria ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fachadas'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- UPDATE: substituição/upsert do próprio arquivo (mesma restrição em USING e CHECK).
DROP POLICY IF EXISTS fachadas_lojista_atualiza_propria ON storage.objects;
CREATE POLICY fachadas_lojista_atualiza_propria ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'fachadas'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'fachadas'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- DELETE: o dono remove o próprio arquivo (ex.: trocar a foto de fachada).
DROP POLICY IF EXISTS fachadas_lojista_remove_propria ON storage.objects;
CREATE POLICY fachadas_lojista_remove_propria ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'fachadas'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- -----------------------------------------------------------------------------
-- TODO STORY 3.7 (admin): quando is_admin() existir, adicionar `OR is_admin()`
-- em fachadas_lojista_le_propria (para o Admin ver a fachada no fluxo de
-- aprovação) — ou gerar a URL assinada server-side com service_role no painel.
-- NÃO criar admin_users/is_admin() aqui.
-- -----------------------------------------------------------------------------
