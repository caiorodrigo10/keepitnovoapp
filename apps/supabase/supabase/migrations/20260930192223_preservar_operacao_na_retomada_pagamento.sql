BEGIN;
-- A operação pertence à própria tentativa. Expô-la ao dono permite recarregar
-- artefatos após uma nova tentativa sem reutilizar a operação anterior encerrada.
-- Mantém os controles de propriedade nas RPCs e não expõe claim/ID do gateway.
CREATE OR REPLACE FUNCTION private.projetar_tentativa(t public.tentativas_pagamento) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',t.id,'pedidoId',t.pedido_id,'operacaoId',t.operacao_id,'estado',t.estado) || CASE
  WHEN t.qr_code_pix IS NOT NULL AND t.pix_copia_e_cola IS NOT NULL THEN jsonb_build_object('pix',jsonb_build_object(
  'imagemBase64',t.qr_code_pix,'copiaCola',t.pix_copia_e_cola,'expiraEm',t.expira_em)) ELSE '{}'::jsonb END
$$;
COMMIT;
