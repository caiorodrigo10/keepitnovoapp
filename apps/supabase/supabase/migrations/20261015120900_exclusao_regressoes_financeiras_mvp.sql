-- Account-deletion regressions: retain the access guard and the exact
-- redaction allowlist while restoring the financial contracts that existed
-- before the account-deletion cycle.

-- 20261015120200 wrapped the legacy RPC with three result columns although
-- the renamed implementation returns the historical two-column contract.
-- PostgreSQL cannot change a function result type in place, and this RPC has
-- no dependent objects (verified before this migration), so recreate only
-- this wrapper and preserve the deletion access guard.
DROP FUNCTION public.criar_pedido(
  uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean
);

CREATE FUNCTION public.criar_pedido(
  p_estabelecimento_id uuid, p_hub_id uuid, p_itens jsonb,
  p_subtotal_produtos_reais numeric, p_taxa_deslocamento_reais numeric,
  p_taxa_keepit_reais numeric, p_taxa_servico_comprador_reais numeric,
  p_total_pago_reais numeric, p_nf_solicitada boolean
)
RETURNS TABLE(pedido_id uuid, numero integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  PERFORM private.exigir_conta_gravavel(v_user_id);
  RETURN QUERY SELECT * FROM public.criar_pedido_sem_guarda_exclusao(
    p_estabelecimento_id, p_hub_id, p_itens, p_subtotal_produtos_reais,
    p_taxa_deslocamento_reais, p_taxa_keepit_reais,
    p_taxa_servico_comprador_reais, p_total_pago_reais, p_nf_solicitada
  );
END;
$$;

REVOKE ALL ON FUNCTION public.criar_pedido(
  uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_pedido(
  uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean
) TO authenticated;

-- The deletion checkpoint may redact only its own allowlisted financial PII.
-- Outside that checkpoint, retain the pre-cycle ledger contract: monetary and
-- refund metadata are immutable, while the existing refund-conciliation state
-- transitions remain legal.
CREATE OR REPLACE FUNCTION public.lancamento_financeiro_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE v_target uuid := private.redacao_exclusao_ativa();
BEGIN
  IF v_target IS NOT NULL
    AND NEW.valor_centavos IS NOT DISTINCT FROM OLD.valor_centavos
    AND NEW.tipo IS NOT DISTINCT FROM OLD.tipo
    AND NEW.estabelecimento_id IS NOT DISTINCT FROM OLD.estabelecimento_id
    AND NEW.pedido_id IS NOT DISTINCT FROM OLD.pedido_id
    AND NEW.criado_em IS NOT DISTINCT FROM OLD.criado_em
    AND NEW.disponivel_em IS NOT DISTINCT FROM OLD.disponivel_em
    AND NEW.solicitacao_id IS NOT DISTINCT FROM OLD.solicitacao_id
    AND NEW.responsavel_reembolso IS NOT DISTINCT FROM OLD.responsavel_reembolso
    AND NEW.operacao_confirmacao_id IS NOT DISTINCT FROM OLD.operacao_confirmacao_id
    AND NEW.estado_reserva IS NOT DISTINCT FROM OLD.estado_reserva
    AND NEW.liberada_em IS NOT DISTINCT FROM OLD.liberada_em
    AND NEW.reembolso_origem_id IS NOT DISTINCT FROM OLD.reembolso_origem_id
    AND NEW.semana_inicio IS NOT DISTINCT FROM OLD.semana_inicio
    AND NEW.previsto_para IS NOT DISTINCT FROM OLD.previsto_para
    AND NEW.repasse_id IS NOT DISTINCT FROM OLD.repasse_id
    AND NEW.asaas_id_externo IS NULL
    AND NEW.detalhe IS NULL
    AND NEW.motivo_reembolso IS NULL
    AND NEW.liberacao_motivo IS NULL
    AND (NEW.ator_admin_id IS NOT DISTINCT FROM OLD.ator_admin_id OR OLD.ator_admin_id = v_target)
    AND (NEW.aprovador_id IS NOT DISTINCT FROM OLD.aprovador_id OR OLD.aprovador_id = v_target)
  THEN
    RETURN NEW;
  END IF;

  IF NEW.valor_centavos IS DISTINCT FROM OLD.valor_centavos
    OR NEW.tipo IS DISTINCT FROM OLD.tipo
    OR NEW.estabelecimento_id IS DISTINCT FROM OLD.estabelecimento_id
    OR NEW.pedido_id IS DISTINCT FROM OLD.pedido_id
    OR NEW.criado_em IS DISTINCT FROM OLD.criado_em
    OR NEW.disponivel_em IS DISTINCT FROM OLD.disponivel_em
    OR NEW.semana_inicio IS DISTINCT FROM OLD.semana_inicio
    OR NEW.previsto_para IS DISTINCT FROM OLD.previsto_para
    OR NEW.repasse_id IS DISTINCT FROM OLD.repasse_id
  THEN
    RAISE EXCEPTION 'LANCAMENTO_IMUTAVEL';
  END IF;

  IF NEW.solicitacao_id IS DISTINCT FROM OLD.solicitacao_id
    OR NEW.motivo_reembolso IS DISTINCT FROM OLD.motivo_reembolso
    OR NEW.responsavel_reembolso IS DISTINCT FROM OLD.responsavel_reembolso
    OR NEW.aprovador_id IS DISTINCT FROM OLD.aprovador_id
    OR NEW.reembolso_origem_id IS DISTINCT FROM OLD.reembolso_origem_id
  THEN
    RAISE EXCEPTION 'REEMBOLSO_METADATA_IMUTAVEL';
  END IF;

  RETURN NEW;
END;
$$;
