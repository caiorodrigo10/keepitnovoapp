-- =============================================================================
-- Bloco 06 (Pedido — fundação) — RPC `aceitar_pedido(p_pedido_id, p_tempo_estimado_min)`
-- Autor: @data-engineer (Dara). Data: 2026-08-13.
--
-- O lojista DONO do estabelecimento (ou um admin) aceita um pedido: transição
-- 'aguardando_aceite' → 'aceito', grava tempo_estimado_min e aceito_em.
--
-- Fontes normativas:
--   docs/architecture/03-data-models.md §5.1  (status/tempo_estimado_min/aceito_em)
--   docs/architecture/05-security.md   §3.11  ("Convencao critica": transição de
--                                              estado via RPC server-side, não UPDATE
--                                              direto do app)
--   docs/architecture/07-mvp-pilot-backend.md §"Fluxo do pedido no piloto"
--
-- Depende de: 20260813004932 (pedidos), 20260812132330 (is_admin).
--
-- ============================ POR QUE RPC SECURITY DEFINER =====================
--   * Autorização server-side por OWNERSHIP: só o lojista dono do estabelecimento
--     do pedido (ou admin) aceita. A RPC roda como owner (BYPASSRLS) → NÃO confia
--     em RLS; valida ownership/admin explicitamente. auth.uid() continua sendo o do
--     CHAMADOR (claim do JWT), então a checagem reflete o lojista real.
--   * Escreve mesmo com o RLS fail-closed de pedidos (UPDATE direto do app é NEGADO).
--   * Só transiciona 'aguardando_aceite' → 'aceito' (idempotência-segura: um segundo
--     aceite não reabre o estado; devolve ESTADO_INVALIDO).
--
-- VALIDAÇÃO tempo_estimado_min: exigimos > 0 (erro honesto). O §5.1 não põe CHECK na
-- coluna; a faixa fina (ex. 5..240 como em tempo_medio_entrega_min) é regra de UX/
-- negócio não especificada para o aceite — aqui só barramos o claramente inválido.
--
-- ERROS NOMEADOS (mensagens honestas — sem sucesso simulado): AUTENTICACAO_NECESSARIA,
-- TEMPO_ESTIMADO_INVALIDO, PEDIDO_NAO_ENCONTRADO, ACESSO_NEGADO, ESTADO_INVALIDO.
--   Distinção honesta dos 3 casos de falha do UPDATE: não existe → PEDIDO_NAO_ENCONTRADO;
--   existe mas não é do lojista → ACESSO_NEGADO; é do lojista mas não está
--   'aguardando_aceite' → ESTADO_INVALIDO.
--
-- HARDENING (grants): REVOKE PUBLIC/anon; EXECUTE só para `authenticated` (a
-- autorização REAL é ownership/is_admin DENTRO da função). SET search_path = ''.
-- Verificar com get_advisors(type='security') após aplicar.
--
-- ROLLBACK (forward-only):
--     DROP FUNCTION IF EXISTS public.aceitar_pedido(uuid, int);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.aceitar_pedido(
  p_pedido_id           uuid,
  p_tempo_estimado_min  int
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_id   uuid;
BEGIN
  -- 1) Exige sessão autenticada (a função ignora RLS; validamos aqui).
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de lojista ausente ao chamar aceitar_pedido';
  END IF;

  -- 2) tempo estimado tem de ser positivo.
  IF p_tempo_estimado_min IS NULL OR p_tempo_estimado_min <= 0 THEN
    RAISE EXCEPTION 'TEMPO_ESTIMADO_INVALIDO'
      USING HINT = 'Informe um tempo estimado em minutos maior que zero';
  END IF;

  -- 3) Transição idempotente-segura: só aceita 'aguardando_aceite' E só se o pedido
  --    for da loja do chamador (dono) OU o chamador for admin. Tudo na cláusula WHERE
  --    do UPDATE (autorização + estado juntos).
  UPDATE public.pedidos p
  SET status              = 'aceito',
      tempo_estimado_min  = p_tempo_estimado_min,
      aceito_em           = NOW()
  WHERE p.id = p_pedido_id
    AND p.status = 'aguardando_aceite'
    AND (
      public.is_admin(v_uid)
      OR EXISTS (
        SELECT 1 FROM public.estabelecimentos e
        WHERE e.id = p.estabelecimento_id
          AND e.dono_user_id = v_uid
      )
    )
  RETURNING p.id INTO v_id;

  -- 4) Nada atualizado: distinguir os 3 casos com mensagem honesta (sem sucesso
  --    silencioso). O chamador já foi validado como sessão; a distinção é legítima.
  IF v_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id) THEN
      RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'
        USING HINT = 'Nenhum pedido com o id informado';
    END IF;

    IF NOT (
      public.is_admin(v_uid)
      OR EXISTS (
        SELECT 1 FROM public.pedidos p
        JOIN public.estabelecimentos e ON e.id = p.estabelecimento_id
        WHERE p.id = p_pedido_id
          AND e.dono_user_id = v_uid
      )
    ) THEN
      RAISE EXCEPTION 'ACESSO_NEGADO'
        USING HINT = 'Apenas o lojista dono do pedido (ou um admin) pode aceitá-lo';
    END IF;

    RAISE EXCEPTION 'ESTADO_INVALIDO'
      USING HINT = 'Só é possível aceitar um pedido em status aguardando_aceite';
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.aceitar_pedido(uuid, int) IS
  'Bloco 06. Lojista dono (ou admin) aceita o pedido: aguardando_aceite → aceito, '
  'grava tempo_estimado_min + aceito_em. SECURITY DEFINER guardada por ownership/'
  'is_admin(). Erros: AUTENTICACAO_NECESSARIA, TEMPO_ESTIMADO_INVALIDO, '
  'PEDIDO_NAO_ENCONTRADO, ACESSO_NEGADO, ESTADO_INVALIDO.';

-- -----------------------------------------------------------------------------
-- Hardening de grants — só o lojista/admin autenticado invoca; anon/PUBLIC nunca.
-- A autorização real é ownership/is_admin() DENTRO da função; o grant a
-- `authenticated` apenas expõe a RPC ao PostgREST.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.aceitar_pedido(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aceitar_pedido(uuid, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.aceitar_pedido(uuid, int) TO authenticated;
