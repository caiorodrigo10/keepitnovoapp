-- =============================================================================
-- Story 3.5 — RPC atômica `criar_estabelecimento_completo`
-- Épico 3 (Lojista / Aprovação). Autor: @data-engineer (Dara). Data: 2026-08-12.
--
-- Fontes normativas:
--   docs/stories/3.5.story.md          AC3 (escrita atômica + recuperação de
--                                      escrita parcial, ajuste @po 2026-08-12),
--                                      AC4 (mensagem honesta em conflito UNIQUE)
--   docs/architecture/03-data-models.md §1.4 / §1.5
--   docs/architecture/05-security.md   §2 (FORCE RLS + SECURITY DEFINER explícito)
--
-- Depende de: 20260812123046 (estabelecimentos) e 20260812123047 (horarios).
--
-- POR QUE RPC (e não Edge Function): não há segredo externo envolvido (a conta
-- Asaas é única e vive no env server-side — Story 3.8). Escrita atômica de duas
-- tabelas relacionadas é exatamente o caso de uma função SQL transacional.
--
-- ============================ ESTRATÉGIA DE ATOMICIDADE =======================
-- Escolha: (a) UPSERT IDEMPOTENTE por `dono_user_id`, com (b) rollback
-- transacional total como backstop. As DUAS propriedades exigidas pela AC3 são
-- satisfeitas:
--
--   * SEM ESTADO PARCIAL / SEM ÓRFÃO: o corpo inteiro da função roda numa ÚNICA
--     transação (a função é uma unidade transacional; o applier — MCP/CLI — não
--     abre subtransações). Qualquer RAISE ou erro de constraint (CHECK do horário,
--     FK, etc.) faz ROLLBACK de TUDO, inclusive do INSERT de `estabelecimentos`.
--     Nunca fica um estabelecimento sem as suas 7 linhas de horário.
--
--   * SEM TRAVA PERMANENTE POR UNIQUE (dono_user_id): o INSERT usa
--     `ON CONFLICT (dono_user_id) DO UPDATE` — um reenvio do MESMO lojista NÃO
--     colide com o UNIQUE; ATUALIZA a linha `em_analise` existente. Os horários
--     usam `ON CONFLICT (estabelecimento_id, dia_semana) DO UPDATE`, COMPLETANDO
--     linhas faltantes de uma tentativa anterior parcial e atualizando as
--     presentes. O reenvio é, portanto, um caminho de RECUPERAÇÃO, não um beco
--     sem saída. (O rollback transacional já impede a órfã; a idempotência
--     garante que, mesmo assim, o reenvio sempre funcione.)
--
-- Guardas que preservam a honestidade da AC4 (mensagem honesta, sem sucesso
-- simulado):
--   * Só fazemos DO UPDATE se a linha existente ainda está `em_analise`
--     (`WHERE estabelecimentos.status = 'em_analise'`). Se o cadastro já avançou
--     (ativo/rejeitado/suspenso), o UPDATE não afeta linha nenhuma, v_estab_id
--     volta NULL e levantamos `CADASTRO_JA_PROCESSADO` — o lojista não pode
--     sobrescrever um cadastro já julgado reenviando o Passo 3.
--   * Um CNPJ que colida com o estabelecimento de OUTRO dono não é capturado
--     pelo ON CONFLICT (dono_user_id) → dispara unique_violation, que traduzimos
--     em `CNPJ_DUPLICADO` (mensagem honesta, sem vazar detalhe de outro dono).
--
-- DEFESA (SECURITY DEFINER ignora RLS): a função roda como owner (BYPASSRLS),
-- então NÃO confiamos em RLS aqui. `dono_user_id` NÃO é parâmetro — é sempre
-- `auth.uid()`. Se não houver sessão (`auth.uid()` NULL), abortamos.
--
-- HARDENING (grants): função em `public` é exposta como RPC pelo PostgREST com
-- EXECUTE para PUBLIC por padrão. REVOKE de PUBLIC/anon; EXECUTE só para
-- `authenticated` (o lojista logado chama). SET search_path fixo (SECURITY
-- DEFINER). Verificar com get_advisors(type='security') após aplicar.
--
-- ROLLBACK (forward-only):
--     DROP FUNCTION IF EXISTS public.criar_estabelecimento_completo(
--       text, text, text, text, text, text, numeric, numeric, numeric, int,
--       numeric, numeric, text, text, text, text, jsonb);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.criar_estabelecimento_completo(
  p_nome_fantasia          text,
  p_cnpj                   text,
  p_responsavel_nome       text,
  p_telefone               text,
  p_categoria              text,
  p_endereco               text,
  p_lat                    numeric,
  p_lng                    numeric,
  p_raio_atendimento_km    numeric,
  p_tempo_medio_entrega_min int,
  p_taxa_deslocamento_reais numeric,
  p_ticket_minimo_reais    numeric,
  p_chave_pix              text,
  p_chave_pix_tipo         text,
  p_foto_fachada_url       text,
  p_descricao              text,
  p_horarios               jsonb          -- array de 7 objetos: {dia_semana, aberto, hora_abre, hora_fecha}
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_estab_id  uuid;
  v_dia       jsonb;
BEGIN
  -- 1) Defesa: exige sessão autenticada (a função ignora RLS, então validamos aqui).
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de lojista ausente ao chamar criar_estabelecimento_completo';
  END IF;

  -- 2) Defesa: exatamente 7 dias de horário (0..6). A PK e o CHECK do §1.5
  --    validam faixa/duplicidade/consistência; aqui garantimos a completude.
  IF p_horarios IS NULL OR jsonb_typeof(p_horarios) <> 'array'
     OR jsonb_array_length(p_horarios) <> 7 THEN
    RAISE EXCEPTION 'HORARIOS_INVALIDOS'
      USING HINT = 'Esperado um array JSON com exatamente 7 dias (dia_semana 0..6)';
  END IF;

  -- 3) UPSERT idempotente do estabelecimento por dono_user_id.
  --    status = 'em_analise' fixo; dono_user_id = auth.uid() (nunca vem de fora);
  --    asaas_wallet_id fica NULL (conta Asaas única do piloto).
  INSERT INTO public.estabelecimentos (
    dono_user_id, nome_fantasia, cnpj, responsavel_nome, telefone, categoria,
    descricao, foto_fachada_url, endereco, lat, lng, raio_atendimento_km,
    tempo_medio_entrega_min, taxa_deslocamento_reais, ticket_minimo_reais,
    chave_pix, chave_pix_tipo, status
  )
  VALUES (
    v_uid, p_nome_fantasia, p_cnpj, p_responsavel_nome, p_telefone, p_categoria,
    p_descricao, p_foto_fachada_url, p_endereco, p_lat, p_lng, p_raio_atendimento_km,
    p_tempo_medio_entrega_min, COALESCE(p_taxa_deslocamento_reais, 0), p_ticket_minimo_reais,
    p_chave_pix, p_chave_pix_tipo, 'em_analise'
  )
  ON CONFLICT (dono_user_id) DO UPDATE SET
    nome_fantasia           = EXCLUDED.nome_fantasia,
    cnpj                    = EXCLUDED.cnpj,
    responsavel_nome        = EXCLUDED.responsavel_nome,
    telefone                = EXCLUDED.telefone,
    categoria               = EXCLUDED.categoria,
    descricao               = EXCLUDED.descricao,
    foto_fachada_url        = EXCLUDED.foto_fachada_url,
    endereco                = EXCLUDED.endereco,
    lat                     = EXCLUDED.lat,
    lng                     = EXCLUDED.lng,
    raio_atendimento_km     = EXCLUDED.raio_atendimento_km,
    tempo_medio_entrega_min = EXCLUDED.tempo_medio_entrega_min,
    taxa_deslocamento_reais = EXCLUDED.taxa_deslocamento_reais,
    ticket_minimo_reais     = EXCLUDED.ticket_minimo_reais,
    chave_pix               = EXCLUDED.chave_pix,
    chave_pix_tipo          = EXCLUDED.chave_pix_tipo
    -- NÃO tocamos status / asaas_wallet_id / aprovado_* aqui (imutáveis por este caminho).
  WHERE estabelecimentos.status = 'em_analise'   -- só recupera reenvio ainda em análise
  RETURNING id INTO v_estab_id;

  -- 4) Se o UPSERT não retornou id, existe uma linha do mesmo dono que NÃO está
  --    mais 'em_analise' (já aprovada/rejeitada/suspensa). Mensagem honesta (AC4).
  IF v_estab_id IS NULL THEN
    RAISE EXCEPTION 'CADASTRO_JA_PROCESSADO'
      USING HINT = 'Já existe um cadastro deste lojista fora do estado em_analise';
  END IF;

  -- 5) Upsert das 7 linhas de horário (completa faltantes / atualiza presentes).
  --    Idempotente por (estabelecimento_id, dia_semana). O CHECK do §1.5 valida
  --    a consistência aberto/horas — se inconsistente, RAISE → rollback total.
  FOR v_dia IN SELECT jsonb_array_elements(p_horarios)
  LOOP
    INSERT INTO public.estabelecimentos_horarios (
      estabelecimento_id, dia_semana, aberto, hora_abre, hora_fecha
    )
    VALUES (
      v_estab_id,
      (v_dia->>'dia_semana')::smallint,
      COALESCE((v_dia->>'aberto')::boolean, false),
      NULLIF(v_dia->>'hora_abre', '')::time,
      NULLIF(v_dia->>'hora_fecha', '')::time
    )
    ON CONFLICT (estabelecimento_id, dia_semana) DO UPDATE SET
      aberto     = EXCLUDED.aberto,
      hora_abre  = EXCLUDED.hora_abre,
      hora_fecha = EXCLUDED.hora_fecha;
  END LOOP;

  RETURN v_estab_id;

EXCEPTION
  -- CNPJ que colide com estabelecimento de OUTRO dono (o conflito do próprio dono
  -- já foi absorvido pelo ON CONFLICT acima). Mensagem honesta, sem vazar dono.
  WHEN unique_violation THEN
    RAISE EXCEPTION 'CNPJ_DUPLICADO'
      USING HINT = 'CNPJ já cadastrado em outro estabelecimento';
END;
$$;

COMMENT ON FUNCTION public.criar_estabelecimento_completo(
  text, text, text, text, text, text, numeric, numeric, numeric, int,
  numeric, numeric, text, text, text, text, jsonb) IS
  'Story 3.5 AC3/AC4. Cria/atualiza (upsert idempotente por dono_user_id) o '
  'estabelecimento em_analise do lojista autenticado + upsert das 7 linhas de '
  'horário, numa única transação. Erros: AUTENTICACAO_NECESSARIA, '
  'HORARIOS_INVALIDOS, CADASTRO_JA_PROCESSADO, CNPJ_DUPLICADO.';

-- -----------------------------------------------------------------------------
-- Hardening de grants — NÃO REMOVER. Verificar com get_advisors(type='security').
-- Só o lojista autenticado invoca; anon/PUBLIC nunca.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.criar_estabelecimento_completo(
  text, text, text, text, text, text, numeric, numeric, numeric, int,
  numeric, numeric, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_estabelecimento_completo(
  text, text, text, text, text, text, numeric, numeric, numeric, int,
  numeric, numeric, text, text, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.criar_estabelecimento_completo(
  text, text, text, text, text, text, numeric, numeric, numeric, int,
  numeric, numeric, text, text, text, text, jsonb) TO authenticated;
