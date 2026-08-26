-- =============================================================================
-- Bloco 06 (Pedido — fundação) — RPC `criar_pedido(...)` SECURITY DEFINER
-- Autor: @data-engineer (Dara). Data: 2026-08-13.
--
-- Cria o pedido do cliente autenticado + o snapshot dos itens, numa ÚNICA
-- transação (sem pedido órfão), gera o PIN de retirada de forma CRIPTOGRÁFICA
-- (pgcrypto) e retorna (pedido_id, numero, pin_texto) para exibir no app.
--
-- Fontes normativas:
--   docs/architecture/03-data-models.md §5.1 / §5.2  (colunas pedidos/itens)
--   docs/architecture/03-data-models.md §2.3          (invariante: pedido só
--                                                      referencia hub que a loja atende)
--   docs/architecture/05-security.md   §4.4           (PIN: crypt(pin, gen_salt('bf',10)))
--   docs/architecture/05-security.md   §3.11          ("Convencao critica": escrita
--                                                      de status/pin/valores via RPC)
--   docs/architecture/07-mvp-pilot-backend.md         (RPC SECURITY DEFINER como veículo)
--
-- Depende de: 20260813004932 (pedidos), 20260813004933 (pedidos_itens),
--             pgcrypto (extensão em `extensions` — garantida abaixo).
--
-- ============================ PAGAMENTO SIMULADO NO DEV ========================
-- No DEV o pagamento é SIMULADO: o pedido nasce DIRETO em 'aguardando_aceite' com
-- pago_em = NOW() (como se o PIX já tivesse confirmado). No ÉPICO 7 (pagamento
-- real) esta RPC muda: cria em 'aguardando_pagamento' (pago_em NULL) e SÓ vai a
-- 'aguardando_aceite' quando a Edge Function `asaas-payment-webhook` receber a
-- confirmação do PIX (grava pago_em + asaas_payment_id — colunas que voltam no
-- Épico 7). Nada mais na assinatura/itens muda; só o gatilho do estado inicial.
--
-- ============================ POR QUE RPC SECURITY DEFINER =====================
--   * Escrita atômica de duas tabelas (pedidos + pedidos_itens) + geração de PIN:
--     caso clássico de função SQL transacional. Qualquer RAISE/erro faz ROLLBACK
--     total (a função é uma unidade transacional) → nunca fica pedido sem itens
--     nem item órfão.
--   * A RPC roda como owner (`postgres`, BYPASSRLS) → escreve mesmo com o RLS
--     fail-closed de pedidos/pedidos_itens (INSERT direto do app é NEGADO). NÃO
--     confia em RLS: `cliente_id` NÃO é parâmetro — é sempre auth.uid().
--   * PIN nunca vem do cliente: é gerado server-side. pin_texto volta UMA vez no
--     retorno (para o app exibir); depois só o cliente-dono o lê via RLS.
--
-- ======================= GERAÇÃO SEGURA DO PIN (pgcrypto) =====================
-- A missão exige geração CRIPTOGRÁFICA (não `random()`, que é PRNG não-cripto e
-- previsível). Usamos `extensions.gen_random_bytes(2)` (CSPRNG do pgcrypto) e
-- REJECTION SAMPLING para eliminar o viés de módulo:
--   * 2 bytes → inteiro uniforme 0..65535 (via get_byte, funções de pg_catalog).
--   * Descartamos 60000..65535 e reamostramos; 60000 = 6*10000 é o maior múltiplo
--     de 10000 <= 65535. Assim `v_n % 10000` fica PERFEITAMENTE uniforme em 0..9999
--     (sem o viés que `random()*10000` ou `bytes % 10000` cru introduziriam).
--   * lpad(...,4,'0') → 4 dígitos com zeros à esquerda ('0007').
-- O HASH usa bcrypt do pgcrypto: `extensions.crypt(pin, extensions.gen_salt('bf',10))`
-- (§4.4). Guardamos pin_hash (para a confirmação futura) e pin_texto (exibível ao
-- cliente-dono via RLS) — decisão §4.4 (não dá para derivar o texto do hash).
--
-- POLÍTICA DE LOCKOUT (tentativas_pin / pin_bloqueado_ate): NÃO implementada aqui.
-- É da CONFIRMAÇÃO de PIN (próximo bloco) e o valor de segurança (máx. tentativas +
-- expiração) depende da decisão Q2.2 (PENDENTE stakeholder). Aqui as colunas só
-- nascem com os defaults (tentativas_pin=0, pin_bloqueado_ate NULL).
--
-- ERROS NOMEADOS (mapeados pelo @dev para mensagens honestas — sem sucesso
-- simulado): AUTENTICACAO_NECESSARIA, CLIENTE_NAO_ENCONTRADO, ITENS_INVALIDOS,
-- LOJA_INDISPONIVEL, HUB_NAO_ATENDIDO, HUB_INDISPONIVEL.
--
-- HARDENING (grants): REVOKE PUBLIC/anon; EXECUTE só para `authenticated` (o cliente
-- logado chama). SET search_path = '' + tudo qualificado (inclusive extensions.*).
-- Verificar com get_advisors(type='security') após aplicar.
--
-- ROLLBACK (forward-only):
--     DROP FUNCTION IF EXISTS public.criar_pedido(
--       uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean);
-- =============================================================================

-- pgcrypto no schema `extensions` (convenção do projeto — ver migration
-- 20260812190001 para pg_trgm). No-op se já instalada (Supabase instala pgcrypto
-- em `extensions` por padrão). Garante que extensions.crypt/gen_salt/gen_random_bytes
-- resolvam com search_path=''.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.criar_pedido(
  p_estabelecimento_id           uuid,
  p_hub_id                       uuid,
  p_itens                        jsonb,     -- array: {produto_id, nome_snapshot, preco_unitario, quantidade}
  p_subtotal_produtos_reais      numeric,
  p_taxa_deslocamento_reais      numeric,
  p_taxa_keepit_reais            numeric,
  p_taxa_servico_comprador_reais numeric,
  p_total_pago_reais             numeric,
  p_nf_solicitada                boolean
)
RETURNS TABLE (pedido_id uuid, numero integer, pin_texto text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_pin       text;
  v_pin_hash  text;
  v_rb        bytea;
  v_n         int;
  v_pedido_id uuid;
  v_numero    int;
  v_item      jsonb;
BEGIN
  -- 1) Defesa: exige sessão autenticada (a função ignora RLS; validamos aqui).
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de cliente ausente ao chamar criar_pedido';
  END IF;

  -- 2) O autor tem de ser um CLIENTE (linha em public.clientes criada no signup).
  --    Erro honesto em vez de deixar a FK cliente_id estourar cru.
  IF NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = v_uid) THEN
    RAISE EXCEPTION 'CLIENTE_NAO_ENCONTRADO'
      USING HINT = 'O usuário autenticado não possui perfil de cliente';
  END IF;

  -- 3) Itens: array não-vazio.
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array'
     OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'ITENS_INVALIDOS'
      USING HINT = 'Esperado um array JSON com ao menos 1 item do pedido';
  END IF;

  -- 4) Loja disponível: existe, ATIVA, não pausada e não excluída (§1.4). Falha
  --    fechada — não se cria pedido para loja indisponível.
  IF NOT EXISTS (
    SELECT 1 FROM public.estabelecimentos e
    WHERE e.id = p_estabelecimento_id
      AND e.status = 'ativo'
      AND e.pausado_manualmente = false
      AND e.excluido_em IS NULL
  ) THEN
    RAISE EXCEPTION 'LOJA_INDISPONIVEL'
      USING HINT = 'Estabelecimento inexistente, inativo, pausado ou excluído';
  END IF;

  -- 5) INVARIANTE §2.3: o hub tem de ser um hub que a loja ATENDE (par existente em
  --    estabelecimentos_hubs). É a validação server-side declarada em §2.3 (não há
  --    FK composta em pedidos, de propósito — ver §2.3 trade-off).
  IF NOT EXISTS (
    SELECT 1 FROM public.estabelecimentos_hubs eh
    WHERE eh.estabelecimento_id = p_estabelecimento_id
      AND eh.hub_id = p_hub_id
  ) THEN
    RAISE EXCEPTION 'HUB_NAO_ATENDIDO'
      USING HINT = 'A loja não atende o hub informado (par ausente em estabelecimentos_hubs)';
  END IF;

  -- 6) Hardening: o hub precisa estar ATIVO. Não é regra de negócio nova — é falha
  --    fechada coerente com publico_ve_hubs (hub inativo some da descoberta). A RPC
  --    bypassa RLS, então re-checa explicitamente.
  IF NOT EXISTS (SELECT 1 FROM public.hubs h WHERE h.id = p_hub_id AND h.ativo = true) THEN
    RAISE EXCEPTION 'HUB_INDISPONIVEL'
      USING HINT = 'Hub inexistente ou inativo';
  END IF;

  -- 7) PIN cripto de 4 dígitos (pgcrypto CSPRNG + rejection sampling — ver header).
  LOOP
    v_rb := extensions.gen_random_bytes(2);
    v_n  := (get_byte(v_rb, 0) << 8) | get_byte(v_rb, 1);  -- 0..65535 uniforme
    EXIT WHEN v_n < 60000;                                 -- descarta cauda enviesada
  END LOOP;
  v_pin      := lpad((v_n % 10000)::text, 4, '0');
  v_pin_hash := extensions.crypt(v_pin, extensions.gen_salt('bf', 10));

  -- 8) Insere o pedido. cliente_id = auth.uid() (nunca de fora). Status DEV direto
  --    'aguardando_aceite'; pago_em = NOW() (pagamento simulado). forma_pagamento
  --    'pix' fixo (cartão é LATER). numero vem do serial (DEFAULT nextval).
  INSERT INTO public.pedidos (
    cliente_id, estabelecimento_id, hub_id, status,
    pin_hash, pin_texto,
    subtotal_produtos_reais, taxa_deslocamento_reais, taxa_keepit_reais,
    taxa_servico_comprador_reais, total_pago_reais,
    nf_solicitada, forma_pagamento, pago_em
  )
  VALUES (
    v_uid, p_estabelecimento_id, p_hub_id, 'aguardando_aceite',
    v_pin_hash, v_pin,
    COALESCE(p_subtotal_produtos_reais, 0), COALESCE(p_taxa_deslocamento_reais, 0),
    COALESCE(p_taxa_keepit_reais, 0),
    COALESCE(p_taxa_servico_comprador_reais, 0), COALESCE(p_total_pago_reais, 0),
    COALESCE(p_nf_solicitada, false), 'pix', NOW()
  )
  RETURNING id, pedidos.numero INTO v_pedido_id, v_numero;

  -- 9) Snapshot dos itens (mesma transação). subtotal = preco_unitario * quantidade.
  --    Qualquer erro de cast/CHECK aqui faz ROLLBACK do pedido inteiro (sem órfão).
  FOR v_item IN SELECT jsonb_array_elements(p_itens)
  LOOP
    INSERT INTO public.pedidos_itens (
      pedido_id, produto_id, nome_snapshot, preco_unitario_reais, quantidade, subtotal_reais
    )
    VALUES (
      v_pedido_id,
      NULLIF(v_item->>'produto_id', '')::uuid,
      v_item->>'nome_snapshot',
      (v_item->>'preco_unitario')::numeric,
      (v_item->>'quantidade')::int,
      (v_item->>'preco_unitario')::numeric * (v_item->>'quantidade')::int
    );
  END LOOP;

  -- 10) Retorna id, numero e o PIN em texto (única vez que sai no retorno).
  RETURN QUERY SELECT v_pedido_id, v_numero, v_pin;
END;
$$;

COMMENT ON FUNCTION public.criar_pedido(
  uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean) IS
  'Bloco 06. Cliente autenticado cria pedido + snapshot de itens (1 transacao), com '
  'PIN cripto (pgcrypto gen_random_bytes + rejection sampling; hash bcrypt). DEV: '
  'pagamento SIMULADO (nasce aguardando_aceite, pago_em=now, forma pix). Valida hub '
  'atendido (§2.3) e loja ativa. Retorna (pedido_id, numero, pin_texto). Erros: '
  'AUTENTICACAO_NECESSARIA, CLIENTE_NAO_ENCONTRADO, ITENS_INVALIDOS, LOJA_INDISPONIVEL, '
  'HUB_NAO_ATENDIDO, HUB_INDISPONIVEL.';

-- -----------------------------------------------------------------------------
-- Hardening de grants — só o cliente autenticado invoca; anon/PUBLIC nunca.
-- Verificar com get_advisors(type='security') após aplicar.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.criar_pedido(
  uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_pedido(
  uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.criar_pedido(
  uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean) TO authenticated;
