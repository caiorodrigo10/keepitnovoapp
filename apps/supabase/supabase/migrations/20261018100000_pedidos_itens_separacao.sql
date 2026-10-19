-- =============================================================================
-- Bug M — checklist persistente de separação por `pedidos_itens`.
-- Autor: Codex. Data: 2026-10-18.
--
-- Fontes e precedentes:
--   * `20260813004933_criar_pedidos_itens.sql`: snapshot de itens com RLS
--     fail-closed (`sem_update_direto_itens`), que esta migration preserva.
--   * `20260813022931_rpc_avancar_estado_pedido.sql`: autorização de lojista
--     dono/admin, erros nomeados, `SECURITY DEFINER` e `search_path` endurecido.
--   * `20260814000001_pedidos_add_cliente_chegou_em.sql`: RPC pequena que
--     atualiza, retorna `uuid` e relê no adapter.
--
-- Decisão de estado: a separação só pode mudar em aguardando_aceite, aceito ou em_preparo (fluxo exato do bug M: marcar 1/1 antes de aceitar, aceitar e reabrir mantendo 1/1).
-- `saindo_hub`/`no_hub` ficam deliberadamente bloqueados: a tela ainda pode ser
-- reaberta para consulta/navegação, mas não reabre o checklist depois que a loja
-- declarou o pedido pronto para o hub. Todos os demais estados são igualmente
-- bloqueados com `ESTADO_INVALIDO`.
--
-- Erros nomeados: AUTENTICACAO_NECESSARIA, PEDIDO_NAO_ENCONTRADO,
-- ACESSO_NEGADO e ESTADO_INVALIDO. Para não introduzir um quinto erro e manter
-- o vocabulário do adapter, item inexistente usa PEDIDO_NAO_ENCONTRADO: não há
-- pedido operável para o identificador de item informado.
--
-- Hardening: a função roda como owner porque a política de UPDATE direto dos
-- itens continua NEGADA; valida `auth.uid()` e ownership/admin dentro da
-- função. `SET search_path = ''`, REVOKE de PUBLIC/anon e GRANT somente a
-- authenticated impedem exposição acidental.
--
-- Rollback (forward-only; se a reversão for necessária, aplicar migration nova):
--   DROP FUNCTION IF EXISTS public.marcar_item_separado_pedido(uuid, boolean);
--   ALTER TABLE public.pedidos_itens DROP COLUMN IF EXISTS separado_em;
--   ALTER TABLE public.pedidos_itens DROP COLUMN IF EXISTS separado;
-- =============================================================================

ALTER TABLE public.pedidos_itens
  ADD COLUMN IF NOT EXISTS separado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS separado_em timestamptz NULL;

COMMENT ON COLUMN public.pedidos_itens.separado IS
  'Checklist operacional de separação do lojista. Só muda pela RPC marcar_item_separado_pedido.';

COMMENT ON COLUMN public.pedidos_itens.separado_em IS
  'Instante em que o item foi marcado como separado; NULL quando desmarcado.';

CREATE OR REPLACE FUNCTION public.marcar_item_separado_pedido(
  p_item_id uuid,
  p_separado boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pedido_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de lojista ausente ao chamar marcar_item_separado_pedido';
  END IF;

  UPDATE public.pedidos_itens pi
  SET separado = p_separado,
      separado_em = CASE WHEN p_separado THEN NOW() ELSE NULL END
  FROM public.pedidos p
  JOIN public.estabelecimentos e ON e.id = p.estabelecimento_id
  WHERE pi.id = p_item_id
    AND p.id = pi.pedido_id
    AND p.status IN ('aguardando_aceite', 'aceito', 'em_preparo')
    AND (
      public.is_admin(v_uid)
      OR e.dono_user_id = v_uid
    )
  RETURNING pi.pedido_id INTO v_pedido_id;

  IF v_pedido_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.pedidos_itens WHERE id = p_item_id) THEN
      RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'
        USING HINT = 'Nenhum item de pedido com o id informado';
    END IF;

    IF NOT (
      public.is_admin(v_uid)
      OR EXISTS (
        SELECT 1
        FROM public.pedidos_itens pi
        JOIN public.pedidos p ON p.id = pi.pedido_id
        JOIN public.estabelecimentos e ON e.id = p.estabelecimento_id
        WHERE pi.id = p_item_id
          AND e.dono_user_id = v_uid
      )
    ) THEN
      RAISE EXCEPTION 'ACESSO_NEGADO'
        USING HINT = 'Apenas o lojista dono do pedido (ou um admin) pode marcar a separação';
    END IF;

    RAISE EXCEPTION 'ESTADO_INVALIDO'
      USING HINT = 'A separação só pode ser alterada com o pedido em aguardando_aceite, aceito ou em_preparo';
  END IF;

  RETURN v_pedido_id;
END;
$$;

COMMENT ON FUNCTION public.marcar_item_separado_pedido(uuid, boolean) IS
  'Bug M. Lojista dono (ou admin) marca/desmarca um item do checklist de separação '
  'somente em pedido aguardando_aceite/aceito/em_preparo; retorna pedido_id para releitura autorizada. '
  'Erros: AUTENTICACAO_NECESSARIA, PEDIDO_NAO_ENCONTRADO, ACESSO_NEGADO, ESTADO_INVALIDO.';

REVOKE ALL ON FUNCTION public.marcar_item_separado_pedido(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.marcar_item_separado_pedido(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.marcar_item_separado_pedido(uuid, boolean) TO authenticated;
