-- Story 3.7 (fix SEC-001) — Admin lê fotos de fachada de qualquer lojista.
-- O bucket privado `fachadas` só tinha SELECT para o dono (foldername[1]=auth.uid()).
-- Admin (uid != dono) precisa gerar URL assinada no detalhe do lojista pendente;
-- assinatura de bucket privado NÃO dispensa RLS. Satisfaz o TODO STORY 3.7 da
-- migration 20260812123049. Forward-only, aditiva.
DROP POLICY IF EXISTS fachadas_admin_le ON storage.objects;
CREATE POLICY fachadas_admin_le ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'fachadas' AND public.is_admin());
