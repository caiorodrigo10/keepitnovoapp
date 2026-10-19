-- =============================================================================
-- Bug I — cliente autenticado assina a fachada de lojas ativas no bucket privado.
--
-- `estabelecimentos.foto_fachada_url` guarda somente o path do objeto em
-- `fachadas`. Como o bucket permanece privado, o app cliente precisa de SELECT
-- escopado para gerar URL assinada curta (300s), sem tornar o objeto público.
-- A policy libera apenas fachadas vinculadas a lojas ativas e não excluídas.
--
-- ROLLBACK (forward-only):
--   DROP POLICY IF EXISTS fachadas_cliente_le_loja_ativa ON storage.objects;
-- =============================================================================

DROP POLICY IF EXISTS fachadas_cliente_le_loja_ativa ON storage.objects;
CREATE POLICY fachadas_cliente_le_loja_ativa ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'fachadas'
    AND EXISTS (
      SELECT 1
      FROM public.estabelecimentos e
      WHERE e.foto_fachada_url = name
        AND e.status = 'ativo'
        AND e.excluido_em IS NULL
    )
  );
