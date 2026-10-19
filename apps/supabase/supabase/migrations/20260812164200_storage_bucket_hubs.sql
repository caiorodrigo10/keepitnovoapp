-- =============================================================================
-- Story 4.1 — bucket de Storage `hubs` (PÚBLICO) + policies em storage.objects
-- Épico 4 (Cadastros base / Hubs). Autor: @data-engineer (Dara). Data: 2026-08-12.
--
-- Fontes normativas:
--   docs/architecture/05-security.md §6.7  ("Bucket público único: `hubs` — fotos
--                                            institucionais aparecem para todo
--                                            cliente"; validar MIME + tamanho max 5MB)
--   docs/stories/4.1.story.md        AC2, AC6; Dependencies item 4
--
-- CONTRASTE COM `fachadas` (migration 20260812123049, PRIVADO): `hubs` é o ÚNICO
-- bucket PÚBLICO do projeto — a foto institucional do hub é lida por qualquer
-- cliente pela URL pública direta, SEM URL assinada nem sessão. Diferente de
-- `fachadas`, a leitura NÃO é escopada por pasta do dono. Mas a ESCRITA
-- (INSERT/UPDATE/DELETE) continua restrita a is_admin() — só o admin publica/troca
-- foto de hub (AC6). Reutiliza public.is_admin() (migration 20260812132330).
--
-- POR QUE `public = true` E AINDA ASSIM policy de leitura: com o bucket público, o
-- endpoint /storage/v1/object/public/hubs/... serve o objeto sem checar RLS (é o
-- caminho que o app do cliente usa via foto_url). A policy hubs_leitura_publica
-- abaixo cobre o caminho de API (list/download autenticado) por completude e para
-- tornar a intenção explícita/auditável — não relaxa nada (o bucket já é público).
--
-- ATOMICIDADE: bucket + policies em UMA transação. Idempotente (ON CONFLICT /
-- DROP POLICY IF EXISTS) para re-aplicação segura.
--
-- NOTA DE APLICAÇÃO: aplicável como migration normal (`apply_migration` / `db push`).
-- Alternativamente o `insert into storage.buckets` pode rodar isolado via MCP
-- `execute_sql` — o SQL é o mesmo abaixo.
--
-- ROLLBACK (forward-only):
--     DROP POLICY IF EXISTS hubs_leitura_publica  ON storage.objects;
--     DROP POLICY IF EXISTS hubs_admin_insere      ON storage.objects;
--     DROP POLICY IF EXISTS hubs_admin_atualiza    ON storage.objects;
--     DROP POLICY IF EXISTS hubs_admin_remove      ON storage.objects;
--     DELETE FROM storage.buckets WHERE id = 'hubs';   -- só se vazio
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Bucket PÚBLICO `hubs` com limite de 5MB e MIME de imagem (§6.7).
--    public = true → URL pública permanente; leitura da foto NÃO exige URL assinada.
--    Mesmos limites de fachadas: 5 MB e image/jpeg|png|webp (§6.7).
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hubs',
  'hubs',
  true,
  5242880,                                           -- 5 MB (§6.7)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
-- ON CONFLICT DO UPDATE (e não DO NOTHING): se um bucket 'hubs' pré-existir com
-- public=false, esta migration CONVERGE para o estado desejado (public=true + limites).
-- Idempotente e auto-corretivo.

-- -----------------------------------------------------------------------------
-- 2) Policies em storage.objects (RLS já habilitada por padrão no Supabase).
--    Escopo restrito ao bucket 'hubs'. DROP IF EXISTS antes de CREATE → idempotente.
-- -----------------------------------------------------------------------------

-- SELECT: leitura pública do bucket via API (o caminho /object/public/... já
-- dispensa RLS). anon + authenticated: qualquer cliente vê a foto institucional.
DROP POLICY IF EXISTS hubs_leitura_publica ON storage.objects;
CREATE POLICY hubs_leitura_publica ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'hubs');

-- INSERT: só admin publica foto de hub.
DROP POLICY IF EXISTS hubs_admin_insere ON storage.objects;
CREATE POLICY hubs_admin_insere ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'hubs' AND public.is_admin());

-- UPDATE: só admin substitui/upserta foto de hub (mesma restrição em USING e CHECK).
DROP POLICY IF EXISTS hubs_admin_atualiza ON storage.objects;
CREATE POLICY hubs_admin_atualiza ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'hubs' AND public.is_admin())
  WITH CHECK (bucket_id = 'hubs' AND public.is_admin());

-- DELETE: só admin remove foto de hub.
DROP POLICY IF EXISTS hubs_admin_remove ON storage.objects;
CREATE POLICY hubs_admin_remove ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'hubs' AND public.is_admin());
