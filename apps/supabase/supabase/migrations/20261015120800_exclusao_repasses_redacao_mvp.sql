-- Account deletion has to retain the payout snapshot while removing recipient
-- PII.  NULL is the smallest safe MVP representation: it cannot be mistaken
-- for a real payout identity, and the check below rejects partial redaction.
ALTER TABLE public.repasses
  ALTER COLUMN destinatario_nome DROP NOT NULL,
  ALTER COLUMN destinatario_responsavel DROP NOT NULL,
  ALTER COLUMN chave_pix DROP NOT NULL,
  ALTER COLUMN chave_pix_tipo DROP NOT NULL;

ALTER TABLE public.repasses
  ADD CONSTRAINT repasses_destinatario_anonimizado CHECK (
    (destinatario_nome IS NULL
      AND destinatario_responsavel IS NULL
      AND chave_pix IS NULL
      AND chave_pix_tipo IS NULL)
    OR
    (destinatario_nome IS NOT NULL
      AND destinatario_responsavel IS NOT NULL
      AND chave_pix IS NOT NULL
      AND chave_pix_tipo IS NOT NULL)
  );

-- Keep the pre-existing snapshot guard enabled.  Its deletion exception is an
-- exact allowlist: a valid, in-flight account-deletion checkpoint may change
-- only the recipient PII, the excluded account's actor FKs, and the two public
-- free-text fields that must be redacted.  Arbitrary GUC values do not satisfy
-- private.redacao_exclusao_ativa().
CREATE OR REPLACE FUNCTION private.proteger_snapshot_repasse()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_target uuid := private.redacao_exclusao_ativa();
BEGIN
  IF v_target IS NOT NULL AND OLD.estabelecimento_id IN (
    SELECT (jsonb_array_elements_text(e.scope -> 'estabelecimentoIds'))::uuid
    FROM private.account_deletion_executions e
    WHERE e.request_id = nullif(current_setting('keepit.account_deletion_request', true), '')::uuid
  )
    AND NEW.id IS NOT DISTINCT FROM OLD.id
    AND NEW.estabelecimento_id IS NOT DISTINCT FROM OLD.estabelecimento_id
    AND NEW.semana_inicio IS NOT DISTINCT FROM OLD.semana_inicio
    AND NEW.previsto_para IS NOT DISTINCT FROM OLD.previsto_para
    AND NEW.valor_centavos IS NOT DISTINCT FROM OLD.valor_centavos
    AND NEW.estado IS NOT DISTINCT FROM OLD.estado
    AND NEW.preparado_em IS NOT DISTINCT FROM OLD.preparado_em
    AND NEW.confirmado_em IS NOT DISTINCT FROM OLD.confirmado_em
    AND NEW.confirmacao_operacao_id IS NOT DISTINCT FROM OLD.confirmacao_operacao_id
    AND NEW.invalidado_em IS NOT DISTINCT FROM OLD.invalidado_em
    AND NEW.invalidacao_operacao_id IS NOT DISTINCT FROM OLD.invalidacao_operacao_id
    AND NEW.destinatario_nome IS NULL
    AND NEW.destinatario_responsavel IS NULL
    AND NEW.chave_pix IS NULL
    AND NEW.chave_pix_tipo IS NULL
    AND (NEW.preparado_por IS NOT DISTINCT FROM OLD.preparado_por OR OLD.preparado_por = v_target)
    AND (NEW.confirmado_por IS NOT DISTINCT FROM OLD.confirmado_por OR OLD.confirmado_por = v_target)
    AND (NEW.invalidado_por IS NOT DISTINCT FROM OLD.invalidado_por OR OLD.invalidado_por = v_target)
  THEN
    NEW.motivo_invalidacao := NULL;
    NEW.referencia := NULL;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.estabelecimento_id IS DISTINCT FROM OLD.estabelecimento_id
    OR NEW.semana_inicio IS DISTINCT FROM OLD.semana_inicio
    OR NEW.previsto_para IS DISTINCT FROM OLD.previsto_para
    OR NEW.valor_centavos IS DISTINCT FROM OLD.valor_centavos
    OR NEW.destinatario_nome IS DISTINCT FROM OLD.destinatario_nome
    OR NEW.destinatario_responsavel IS DISTINCT FROM OLD.destinatario_responsavel
    OR NEW.chave_pix IS DISTINCT FROM OLD.chave_pix
    OR NEW.chave_pix_tipo IS DISTINCT FROM OLD.chave_pix_tipo
    OR NEW.preparado_em IS DISTINCT FROM OLD.preparado_em
    OR NEW.preparado_por IS DISTINCT FROM OLD.preparado_por
  THEN RAISE EXCEPTION 'SNAPSHOT_REPASSE_IMUTAVEL'; END IF;
  RETURN NEW;
END;
$$;

COMMENT ON CONSTRAINT repasses_destinatario_anonimizado ON public.repasses IS
  'MVP account-deletion redaction permits only a complete NULL recipient tuple; partial payout PII is invalid.';
