-- Fixed MVP account-retention policy.  This migration deliberately leaves the
-- policy disabled: operational approval/configuration is a separate action.
ALTER TABLE private.politicas_retencao_cartoes
  ADD COLUMN versao text NOT NULL DEFAULT 'legado-cartoes',
  ADD COLUMN habilitada boolean NOT NULL DEFAULT false,
  ADD COLUMN prazo_financeiro_anos smallint NOT NULL DEFAULT 5
    CHECK (prazo_financeiro_anos = 5),
  ADD COLUMN prazo_auditoria_dias smallint NOT NULL DEFAULT 180
    CHECK (prazo_auditoria_dias = 180);

COMMENT ON COLUMN private.politicas_retencao_cartoes.prazo_financeiro_anos IS
  'MVP operational policy: H/F expire five years after financial closure; not a universal legal period.';
COMMENT ON COLUMN private.politicas_retencao_cartoes.prazo_auditoria_dias IS
  'MVP operational policy: minimum A audit expires 180 days after completion or cancellation.';
COMMENT ON COLUMN private.politicas_retencao_cartoes.habilitada IS
  'Execution gate. New migrations never enable it; an authorized operational action is required.';

CREATE OR REPLACE FUNCTION private.exigir_politica_retencao(p_versao text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_versao IS NULL OR NOT EXISTS (
    SELECT 1
    FROM private.politicas_retencao_cartoes p
    WHERE p.escopo = 'cartoes_salvos'
      AND p.versao = p_versao
      AND p.habilitada
      AND p.aprovada_em <= now()
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'POLITICA_RETENCAO_NAO_HABILITADA';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.exigir_politica_retencao(text)
  FROM PUBLIC, anon, authenticated;

CREATE TABLE private.retencoes_conta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL
    REFERENCES public.account_deletion_requests(id) ON DELETE RESTRICT,
  tabela text NOT NULL,
  linha_id uuid NOT NULL,
  campo text NOT NULL,
  valor_minimo text,
  versao_politica text NOT NULL,
  encerramento_financeiro timestamptz NOT NULL,
  expira_em timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retencoes_conta_uma_por_origem
    UNIQUE (solicitacao_id, tabela, linha_id, campo),
  CONSTRAINT retencoes_conta_prazo_financeiro_fixo
    CHECK (expira_em = encerramento_financeiro + interval '5 years'),
  CONSTRAINT retencoes_conta_sem_credencial_reutilizavel
    CHECK (campo NOT IN (
      'asaas_credit_card_token', 'token_temporario', 'claim_token',
      'pin_hash', 'pin_texto', 'pan', 'cvv', 'chave_pix', 'asaas_customer_id'
    ))
);

ALTER TABLE private.retencoes_conta ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.retencoes_conta FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.retencoes_conta FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.retencoes_conta TO service_role;

COMMENT ON TABLE private.retencoes_conta IS
  'Only approved minimum F retention. H/F use a fixed five-year period after financial closure; A remains 180 days on the fixed MVP policy. Tokens, PAN, CVV and reusable credentials are prohibited.';
COMMENT ON COLUMN private.retencoes_conta.valor_minimo IS
  'Optional minimum approved value only; never a raw payload, token, PAN, CVV or reusable credential.';
