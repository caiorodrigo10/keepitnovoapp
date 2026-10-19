-- Task 3 — deny stale sessions and late business writes once a deletion is claimed.
-- This migration deliberately neither enables the MVP policy nor performs deletion.

CREATE FUNCTION public.conta_tem_acesso()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid())
    AND NOT EXISTS (
      SELECT 1
      FROM private.account_deletion_executions e
      JOIN public.account_deletion_requests r ON r.id = e.request_id
      WHERE e.target_user_id = auth.uid()
        AND r.status = 'processing'
    );
$$;

REVOKE ALL ON FUNCTION public.conta_tem_acesso() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conta_tem_acesso() TO authenticated;

CREATE FUNCTION private.exigir_conta_gravavel(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'CONTA_EM_EXCLUSAO';
  END IF;

  -- Writers acquire the same per-account mutex as the claimant before any row lock.
  PERFORM pg_advisory_xact_lock(hashtextextended('account-deletion:' || p_user_id::text, 0));

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id)
    OR EXISTS (
      SELECT 1
      FROM private.account_deletion_executions e
      JOIN public.account_deletion_requests r ON r.id = e.request_id
      WHERE e.target_user_id = p_user_id
        AND r.status = 'processing'
    )
  THEN
    RAISE EXCEPTION 'CONTA_EM_EXCLUSAO';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.exigir_conta_gravavel(uuid) FROM PUBLIC, anon, authenticated;

-- Restrictive policies compose with existing ownership/public policies.  They
-- leave anonymous discovery intact while making every authenticated business
-- path fail closed after the claim.
CREATE POLICY conta_acesso_clientes ON public.clientes AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.conta_tem_acesso()) WITH CHECK (public.conta_tem_acesso());
CREATE POLICY conta_acesso_estabelecimentos ON public.estabelecimentos AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.conta_tem_acesso()) WITH CHECK (public.conta_tem_acesso());
CREATE POLICY conta_acesso_produtos ON public.produtos AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.conta_tem_acesso()) WITH CHECK (public.conta_tem_acesso());
CREATE POLICY conta_acesso_favoritos_hubs ON public.clientes_hubs_favoritos AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.conta_tem_acesso()) WITH CHECK (public.conta_tem_acesso());
CREATE POLICY conta_acesso_favoritos_estabelecimentos ON public.clientes_estabelecimentos_favoritos AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.conta_tem_acesso()) WITH CHECK (public.conta_tem_acesso());
CREATE POLICY conta_acesso_pedidos ON public.pedidos AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.conta_tem_acesso()) WITH CHECK (public.conta_tem_acesso());
CREATE POLICY conta_acesso_cartoes ON public.clientes_cartoes AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.conta_tem_acesso()) WITH CHECK (public.conta_tem_acesso());
CREATE POLICY conta_acesso_storage ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.conta_tem_acesso()) WITH CHECK (public.conta_tem_acesso());

-- Keep the reviewed implementations intact behind non-public names so the
-- guard runs before their first validation or row lock.
ALTER FUNCTION public.cotar_pedido(uuid, uuid, jsonb)
  RENAME TO cotar_pedido_sem_guarda_exclusao;
CREATE FUNCTION public.cotar_pedido(p_estabelecimento_id uuid, p_hub_id uuid, p_itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  PERFORM private.exigir_conta_gravavel(v_user_id);
  RETURN public.cotar_pedido_sem_guarda_exclusao(p_estabelecimento_id, p_hub_id, p_itens);
END;
$$;
REVOKE ALL ON FUNCTION public.cotar_pedido_sem_guarda_exclusao(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cotar_pedido(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cotar_pedido(uuid, uuid, jsonb) TO authenticated;

ALTER FUNCTION public.criar_pedido(uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean)
  RENAME TO criar_pedido_sem_guarda_exclusao;
CREATE FUNCTION public.criar_pedido(
  p_estabelecimento_id uuid, p_hub_id uuid, p_itens jsonb,
  p_subtotal_produtos_reais numeric, p_taxa_deslocamento_reais numeric,
  p_taxa_keepit_reais numeric, p_taxa_servico_comprador_reais numeric,
  p_total_pago_reais numeric, p_nf_solicitada boolean
)
RETURNS TABLE(pedido_id uuid, numero integer, pin_texto text)
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
    p_taxa_servico_comprador_reais, p_total_pago_reais, p_nf_solicitada);
END;
$$;
REVOKE ALL ON FUNCTION public.criar_pedido_sem_guarda_exclusao(uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.criar_pedido(uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_pedido(uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean) TO authenticated;

ALTER FUNCTION public.criar_pedido_cotado(uuid, text, boolean, uuid)
  RENAME TO criar_pedido_cotado_sem_guarda_exclusao;
CREATE FUNCTION public.criar_pedido_cotado(
  p_cotacao_id uuid, p_forma text, p_nf_solicitada boolean, p_operacao_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  PERFORM private.exigir_conta_gravavel(v_user_id);
  RETURN public.criar_pedido_cotado_sem_guarda_exclusao(
    p_cotacao_id, p_forma, p_nf_solicitada, p_operacao_id);
END;
$$;
REVOKE ALL ON FUNCTION public.criar_pedido_cotado_sem_guarda_exclusao(uuid, text, boolean, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.criar_pedido_cotado(uuid, text, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_pedido_cotado(uuid, text, boolean, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_operacao_cartao_service(
  p_cliente_id uuid, p_tentativa_id uuid, p_operacao_id uuid, p_contexto text,
  p_ambiente text, p_salvar_cartao boolean, p_cartao_salvo_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.exigir_conta_gravavel(p_cliente_id);
  RETURN private.registrar_operacao_cartao(
    p_cliente_id, p_tentativa_id, p_operacao_id, p_contexto, p_ambiente,
    p_salvar_cartao, p_cartao_salvo_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_validacao_cartao_service(
  p_cliente_id uuid, p_operacao_id uuid, p_ambiente text, p_valor_centavos integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.exigir_conta_gravavel(p_cliente_id);
  RETURN private.registrar_validacao_cartao(p_cliente_id, p_operacao_id, p_ambiente, p_valor_centavos);
END;
$$;

-- A payment webhook may confirm an already-created financial fact.  It does
-- not call the two creation guards above and cannot recreate a profile/token.
