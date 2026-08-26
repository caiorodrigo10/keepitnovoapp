-- =============================================================================
-- Bloco 07 (Retirada com PIN) — RPC `confirmar_pin_pedido(p_pedido_id, p_pin)`
-- Autor: @data-engineer (Dara). Data: 2026-08-13.  ***peça central do bloco***
--
-- O lojista DONO do estabelecimento (ou admin) confirma a ENTREGA validando o PIN de
-- 4 dígitos que o cliente mostra. Compara contra `pin_hash` via pgcrypto (o PIN nunca
-- trafega/persiste em texto do lado da verificação). Acerto → 'entregue'. Erro →
-- incrementa `tentativas_pin`; no 5º erro bloqueia por 5 min. Reset por timestamp,
-- sem cron. SOMENTE esta função pode produzir o estado 'entregue'.
--
-- Fontes normativas:
--   docs/architecture/07-mvp-pilot-backend.md §"Operações server-side via RPC"
--       (confirmar_pin_pedido: crypt(pin,pin_hash)=pin_hash; ownership; estado at_hub;
--        incrementa tentativas_pin + pin_bloqueado_ate; delivered só aqui)
--   docs/prd/epics/6-pedido-pin.md Story 6.15 (5 tentativas → bloqueio 5 min; reset por
--       timestamp sem cron; constantes fonte-de-verdade em packages/config)
--   docs/PERGUNTAS_REGRAS_NEGOCIO.md §Decisões (linha "PIN — tentativas do lojista":
--       5 tentativas; após esgotar bloqueia por 5 min e libera automaticamente) — DECIDIDO
--   docs/architecture/05-security.md §4.4 (crypt/bcrypt) e §3.11 (estado via RPC)
--
-- Depende de: 20260813004932 (pedidos), 20260813004934 (pgcrypto em `extensions`;
--             is_admin/meu_estabelecimento_id já existentes), 20260813022931 (a transição
--             que leva a 'no_hub', estado de entrada válido daqui).
--
-- ================= ESTADO DE ENTRADA VÁLIDO: 'no_hub' (e só) ===================
-- O overlay do piloto define delivered (= 'entregue') como alcançável a partir de at_hub
-- (= 'no_hub'), e at_hub é atingido pelo check-in operacional único do lojista
-- (avancar_estado_pedido → 'no_hub'). A Story 6.14 AC4 diz que é em 'no_hub' que o lojista
-- vê a tela de digitar PIN (6.15). Logo o ÚNICO estado de entrada válido é 'no_hub'
-- (senão ESTADO_INVALIDO). Escolha coerente com 07-mvp-pilot-backend.md e com as Stories.
-- [AUTO-DECISION] estado de entrada da confirmação → 'no_hub' apenas
--   (reason: at_hub=no_hub no piloto; a tela de PIN aparece em no_hub — 6.14 AC4).
--
-- ============ POR QUE ESTA RPC RETORNA (não RAISE) NO ERRO DE PIN ==============
-- Semântica do PostgreSQL: se a função der RAISE EXCEPTION DEPOIS de um UPDATE, a
-- exceção faz ROLLBACK de TUDO que a função escreveu — inclusive o incremento de
-- `tentativas_pin`. Ou seja, "RAISE PIN_INCORRETO" apagaria o próprio contador que o
-- lockout precisa acumular → o bloqueio de 5/5min NUNCA dispararia. Por isso os
-- desfechos do ATAQUE ao PIN (acerto, erro, erro-que-bloqueia, e "já bloqueado") são
-- devolvidos como LINHA DE RESULTADO (o UPDATE persiste porque a função retorna
-- normalmente), e NÃO como exceção. As exceções ficam só para condições ESTRUTURAIS
-- anteriores a qualquer mutação (sem sessão / pedido inexistente / não é seu / estado
-- errado) — onde não há contador a preservar. Isto reconcilia a instrução da missão
-- ("RAISE PIN_INCORRETO/PIN_BLOQUEADO") com a semântica real do Postgres, entregando o
-- MESMO efeito observável (tentativas restantes / tempo de bloqueio) via colunas do
-- retorno em vez de HINT — e ainda melhor para o @dev (dado estruturado, não string).
--
-- Contrato de retorno — TABLE (resultado text, tentativas_restantes int, bloqueado_ate timestamptz):
--   * ('entregue',       NULL, NULL)            -- PIN correto; pedido agora 'entregue'
--   * ('pin_incorreto',  N,    NULL)            -- PIN errado; faltam N tentativas (N = 5 - usadas)
--   * ('pin_bloqueado',  0,    <ts>)            -- bloqueado (acabou de bloquear OU já estava); libera em <ts>
-- NUNCA retorna/expõe pin_hash nem pin_texto.
-- Exceções (estruturais, antes de mutar): AUTENTICACAO_NECESSARIA, PEDIDO_NAO_ENCONTRADO,
--   ACESSO_NEGADO, ESTADO_INVALIDO.
--
-- ============================ LOCKOUT / RESET (5 / 5min) ======================
--   * Constantes NO SQL: 5 tentativas, INTERVAL '5 minutes'. FONTE-DE-VERDADE da UI é
--     packages/config/business-rules.ts (Story 6.15 AC5) — o SQL as replica como guarda
--     server-side inegociável; se mudarem lá, alinhar aqui (mudança consciente).
--   * Bloqueio ATIVO: pin_bloqueado_ate IS NOT NULL AND pin_bloqueado_ate > now()
--       → devolve ('pin_bloqueado', 0, pin_bloqueado_ate) SEM tentar/consumir tentativa.
--   * Reset por TIMESTAMP (sem cron): se pin_bloqueado_ate <= now() (bloqueio expirado),
--     a janela reinicia — tentativas efetivas = 0 (o próprio branch de erro zera/regrava).
--   * Acerto: status='entregue', entregue_em=NOW(), zera tentativas_pin e pin_bloqueado_ate.
--   * Erro: novas = tentativas_efetivas + 1.
--       - novas < 5 → grava tentativas_pin=novas, pin_bloqueado_ate=NULL; retorna
--                     ('pin_incorreto', 5-novas, NULL).
--       - novas >= 5 → grava pin_bloqueado_ate=now()+'5 minutes' e ZERA tentativas_pin
--                     (contador reinicia na próxima janela); retorna ('pin_bloqueado', 0, ts).
--
-- ============================ RACE (concorrência) ============================
-- Duas confirmações simultâneas no MESMO pedido poderiam (a) incrementar o contador em
-- paralelo perdendo uma tentativa, ou (b) uma entregar enquanto a outra ainda tenta.
-- Blindagem: `SELECT ... FOR UPDATE` trava a LINHA do pedido no início; a segunda chamada
-- espera a primeira commitar e relê o estado fresco (verá 'entregue' → ESTADO_INVALIDO,
-- ou o contador já incrementado). Todos os desfechos gravam com a linha travada. O branch
-- de acerto ainda re-checa `AND status='no_hub'` no UPDATE (cinto e suspensório).
--
-- HARDENING (grants): REVOKE PUBLIC/anon; EXECUTE só para `authenticated` (autorização
--   real é ownership/is_admin DENTRO da função). SET search_path = '' + extensions.crypt
--   qualificado. Verificar get_advisors(type='security') após aplicar.
--
-- ROLLBACK (forward-only):
--     DROP FUNCTION IF EXISTS public.confirmar_pin_pedido(uuid, text);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.confirmar_pin_pedido(
  p_pedido_id uuid,
  p_pin       text
)
RETURNS TABLE (resultado text, tentativas_restantes int, bloqueado_ate timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Política de tentativas (guarda server-side; fonte-de-verdade da UI: packages/config).
  c_max_tentativas   constant int      := 5;
  c_janela_bloqueio  constant interval := interval '5 minutes';

  v_uid          uuid := auth.uid();
  v_status       text;
  v_pin_hash     text;
  v_tentativas   int;
  v_bloqueado    timestamptz;
  v_estab_id     uuid;
  v_efetivas     int;
  v_novas        int;
  v_ate          timestamptz;
BEGIN
  -- 1) Exige sessão autenticada.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de lojista ausente ao chamar confirmar_pin_pedido';
  END IF;

  -- 2) Trava a linha do pedido (serializa confirmações concorrentes — ver header RACE).
  SELECT p.status, p.pin_hash, p.tentativas_pin, p.pin_bloqueado_ate, p.estabelecimento_id
    INTO v_status, v_pin_hash, v_tentativas, v_bloqueado, v_estab_id
  FROM public.pedidos p
  WHERE p.id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'
      USING HINT = 'Nenhum pedido com o id informado';
  END IF;

  -- 3) Ownership/admin (a RPC bypassa RLS; validação explícita).
  IF NOT (
    public.is_admin(v_uid)
    OR EXISTS (
      SELECT 1 FROM public.estabelecimentos e
      WHERE e.id = v_estab_id
        AND e.dono_user_id = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO'
      USING HINT = 'Apenas o lojista dono do pedido (ou um admin) pode confirmar o PIN';
  END IF;

  -- 4) Bloqueio ATIVO? Devolve resultado (não consome tentativa). Ver header: é um
  --    desfecho da vida do PIN → RETURN, não RAISE.
  IF v_bloqueado IS NOT NULL AND v_bloqueado > NOW() THEN
    RETURN QUERY SELECT 'pin_bloqueado'::text, 0, v_bloqueado;
    RETURN;
  END IF;

  -- 5) Estado de entrada válido: SÓ 'no_hub' (ver header). Estrutural → RAISE.
  IF v_status <> 'no_hub' THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO'
      USING HINT = 'Só é possível confirmar o PIN de um pedido em no_hub (no hub, pronto para retirada)';
  END IF;

  -- 6) Tentativas efetivas: se o bloqueio expirou (reset por timestamp), a janela zera.
  IF v_bloqueado IS NOT NULL AND v_bloqueado <= NOW() THEN
    v_efetivas := 0;
  ELSE
    v_efetivas := COALESCE(v_tentativas, 0);
  END IF;

  -- 7) Compara o PIN via pgcrypto (bcrypt): crypt(pin, hash) = hash. Nunca expõe hash/texto.
  IF extensions.crypt(p_pin, v_pin_hash) = v_pin_hash THEN
    -- ACERTO → entrega. Re-checa status='no_hub' no UPDATE (cinto e suspensório sob o lock).
    UPDATE public.pedidos p
    SET status            = 'entregue',
        entregue_em       = NOW(),
        tentativas_pin    = 0,
        pin_bloqueado_ate = NULL
    WHERE p.id = p_pedido_id
      AND p.status = 'no_hub';

    IF NOT FOUND THEN
      -- Corrida rara: o estado saiu de 'no_hub' entre o passo 5 e aqui (com o lock, quase
      -- impossível; mantido honesto).
      RAISE EXCEPTION 'ESTADO_INVALIDO'
        USING HINT = 'O pedido deixou de estar em no_hub durante a confirmação';
    END IF;

    RETURN QUERY SELECT 'entregue'::text, NULL::int, NULL::timestamptz;
    RETURN;
  END IF;

  -- 8) ERRO de PIN. Persiste o incremento (por isso RETURN, nunca RAISE — ver header).
  v_novas := v_efetivas + 1;

  IF v_novas >= c_max_tentativas THEN
    -- 5º erro → bloqueia e ZERA o contador (reinicia na próxima janela).
    v_ate := NOW() + c_janela_bloqueio;
    UPDATE public.pedidos p
    SET tentativas_pin    = 0,
        pin_bloqueado_ate = v_ate
    WHERE p.id = p_pedido_id;

    RETURN QUERY SELECT 'pin_bloqueado'::text, 0, v_ate;
    RETURN;
  ELSE
    -- Erro sem bloquear: acumula e limpa qualquer bloqueio expirado remanescente.
    UPDATE public.pedidos p
    SET tentativas_pin    = v_novas,
        pin_bloqueado_ate = NULL
    WHERE p.id = p_pedido_id;

    RETURN QUERY SELECT 'pin_incorreto'::text, (c_max_tentativas - v_novas), NULL::timestamptz;
    RETURN;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.confirmar_pin_pedido(uuid, text) IS
  'Bloco 07 (peça central). Lojista dono (ou admin) confirma a ENTREGA validando o PIN '
  '(pgcrypto crypt(pin,pin_hash)=pin_hash; nunca expõe hash/texto). Único caminho para '
  '''entregue''. Entrada válida: no_hub. Lockout 5 tentativas / 5 min, reset por timestamp '
  '(sem cron). RETORNA (resultado, tentativas_restantes, bloqueado_ate) nos desfechos do '
  'PIN — RETURN (não RAISE) para o incremento de tentativas_pin PERSISTIR. Exceções '
  'estruturais: AUTENTICACAO_NECESSARIA, PEDIDO_NAO_ENCONTRADO, ACESSO_NEGADO, ESTADO_INVALIDO. '
  'SECURITY DEFINER + FOR UPDATE (sem race). Constantes: fonte-de-verdade UI em packages/config.';

-- -----------------------------------------------------------------------------
-- Hardening de grants — só o lojista/admin autenticado invoca; anon/PUBLIC nunca.
-- A autorização real é ownership/is_admin() DENTRO da função.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.confirmar_pin_pedido(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirmar_pin_pedido(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirmar_pin_pedido(uuid, text) TO authenticated;
