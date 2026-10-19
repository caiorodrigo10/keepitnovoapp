-- =============================================================================
-- Épico 4 (Catálogo) — bucket de Storage `produtos` (PÚBLICO) + policies
-- Autor: @data-engineer (Dara). Data: 2026-08-12.
--
-- Fontes normativas:
--   docs/architecture/05-security.md §6.7  (buckets privados por padrão; público só
--                                           para asset visto por todo cliente; MIME +
--                                           tamanho max 5MB)
--   docs/architecture/03-data-models.md §3.1 (produtos.foto_url)
--
-- DECISÃO DE BUCKET — PÚBLICO (como `hubs`, ao contrário de `fachadas` privado):
--   A foto do produto aparece na VITRINE do cliente (leitura em massa, por muitos
--   clientes anônimos/autenticados, direto pela URL em produtos.foto_url). Servir por
--   URL assinada de expiração curta (padrão de `fachadas`) exigiria o backend assinar
--   cada thumbnail do catálogo a cada request — caro e sem ganho: a foto do produto
--   de uma loja ATIVA já é conteúdo destinado ao público. Logo `produtos` é PÚBLICO
--   de leitura, como `hubs` (§6.7 "bucket público para asset visto por todo cliente").
--
-- CONVENÇÃO DE PATH (escrita escopada ao dono) — decisão @data-engineer:
--   Objeto gravado sob a pasta do dono:  {auth.uid()}/<arquivo>
--   ex.: "6f1c...e2/prod-abc.jpg". A 1ª pasta do path DEVE ser o uid do lojista.
--   No piloto 1 conta = 1 estabelecimento (estabelecimentos.dono_user_id UNIQUE), então
--   o uid do dono identifica univocamente a loja — mesma convenção de `fachadas`
--   (migration 20260812123049). Assim NÃO é preciso resolver o estabelecimento_id
--   dentro da policy de storage (storage.objects não tem esse vínculo). O @dev DEVE
--   fazer upload usando exatamente esse prefixo; produtos.foto_url guarda o path do
--   objeto (leitura via URL pública /object/public/produtos/{uid}/<arquivo>).
--
-- ESCRITA: dono (pasta {uid}/) OU is_admin(). Leitura: pública (anon+authenticated).
--   Reutiliza public.is_admin() (migration 20260812132330).
--
-- ATOMICIDADE: bucket + policies em UMA transação. Idempotente (ON CONFLICT /
-- DROP POLICY IF EXISTS) para re-aplicação segura.
--
-- NOTA DE APLICAÇÃO: aplicável como migration normal (`apply_migration` / `db push`).
-- Alternativamente o `insert into storage.buckets` pode rodar isolado via MCP
-- `execute_sql` — o SQL é o mesmo abaixo.
--
-- ROLLBACK (forward-only):
--     DROP POLICY IF EXISTS produtos_leitura_publica   ON storage.objects;
--     DROP POLICY IF EXISTS produtos_dono_insere        ON storage.objects;
--     DROP POLICY IF EXISTS produtos_dono_atualiza      ON storage.objects;
--     DROP POLICY IF EXISTS produtos_dono_remove        ON storage.objects;
--     DELETE FROM storage.buckets WHERE id = 'produtos';   -- só se vazio
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Bucket PÚBLICO `produtos` com limite de 5MB e MIME de imagem (§6.7).
--    public = true → URL pública permanente; leitura da foto NÃO exige URL assinada.
--    Mesmos limites de fachadas/hubs: 5 MB e image/jpeg|png|webp (§6.7).
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'produtos',
  'produtos',
  true,
  5242880,                                           -- 5 MB (§6.7)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
-- ON CONFLICT DO UPDATE (e não DO NOTHING): se um bucket 'produtos' pré-existir com
-- public=false, esta migration CONVERGE para o estado desejado. Idempotente e auto-corretivo.

-- -----------------------------------------------------------------------------
-- 2) Policies em storage.objects (RLS já habilitada por padrão no Supabase).
--    Escopo restrito ao bucket 'produtos'. DROP IF EXISTS antes de CREATE → idempotente.
-- -----------------------------------------------------------------------------

-- SELECT: leitura pública do bucket (o caminho /object/public/... já dispensa RLS).
-- anon + authenticated: qualquer cliente vê a foto do produto na vitrine.
DROP POLICY IF EXISTS produtos_leitura_publica ON storage.objects;
CREATE POLICY produtos_leitura_publica ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'produtos');

-- INSERT: o lojista grava SÓ sob a própria pasta {uid}/..., OU o admin publica.
DROP POLICY IF EXISTS produtos_dono_insere ON storage.objects;
CREATE POLICY produtos_dono_insere ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'produtos'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR public.is_admin()
    )
  );

-- UPDATE: substituição/upsert do próprio arquivo (dono) OU admin. USING e CHECK iguais.
DROP POLICY IF EXISTS produtos_dono_atualiza ON storage.objects;
CREATE POLICY produtos_dono_atualiza ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'produtos'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR public.is_admin()
    )
  )
  WITH CHECK (
    bucket_id = 'produtos'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR public.is_admin()
    )
  );

-- DELETE: o dono remove o próprio arquivo (trocar foto) OU admin.
DROP POLICY IF EXISTS produtos_dono_remove ON storage.objects;
CREATE POLICY produtos_dono_remove ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'produtos'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR public.is_admin()
    )
  );
