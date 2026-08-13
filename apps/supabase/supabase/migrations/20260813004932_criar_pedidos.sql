-- =============================================================================
-- Bloco 06 (Pedido — fundação) — tabela `pedidos` + helpers de visibilidade + RLS
-- Autor: @data-engineer (Dara). Data: 2026-08-13.
--
-- Fontes normativas (seguidas à risca; SUBSET do PILOTO — caminho feliz):
--   docs/architecture/03-data-models.md §5.1  (DDL pedidos + CHECK de status
--                                              PERMISSIVO com os 15 valores de
--                                              PROPÓSITO — mudança 5 — + índices)
--   docs/architecture/03-data-models.md §"Trigger utilitário compartilhado"
--   docs/architecture/05-security.md   §1     (helpers is_admin / meu_estabelecimento_id
--                                              / pode_ver_pedido)
--   docs/architecture/05-security.md   §3.11  (RLS de pedidos)
--   docs/architecture/05-security.md   §4.4   (PIN: crypt/bcrypt — usado na RPC, não aqui)
--   docs/architecture/03-data-models.md §8 item 10 (ordem: pedidos após produtos)
--
-- PRIMEIRA migration que cria `pedidos`. Reutiliza infraestrutura JÁ EXISTENTE do
-- piloto (NÃO recriada aqui):
--   * public.set_atualizado_em()  — trigger utilitário (migration 20260812123046).
--   * public.is_admin()           — SECURITY DEFINER (migration 20260812132330).
--   * public.clientes / public.estabelecimentos / public.hubs — FKs pai.
--
-- ============================ RECORTE DO PILOTO (o que ENTRA e o que FICA FORA) ==
-- ENTRA (caminho feliz do piloto — comprar → aceitar → [PIN no próximo bloco]):
--   * Colunas do §5.1 necessárias ao fluxo: relações, status (CHECK permissivo),
--     PIN (hash+texto+tentativas+bloqueio), timing mínimo, snapshot financeiro,
--     nf/motivos, forma_pagamento.
--   * NOVA coluna `taxa_servico_comprador_reais` — taxa provisória R$ 2,90 do
--     comprador no checkout. NÃO existe no §5.1 (que só tem subtotal/deslocamento/
--     keepit/total). Adicionada aqui como snapshot financeiro do valor cobrado do
--     cliente. Ver observação para o Caio ao fim.
--
-- FICA FORA (LATER — não é caminho feliz do piloto):
--   * Colunas de PIX-via-Asaas: `asaas_payment_id`, `qr_code_pix`, `pix_copia_e_cola`
--     (Épico 7 — pagamento real). No DEV o pagamento é SIMULADO (ver RPC criar_pedido);
--     por isso o índice `idx_pedidos_asaas` também NÃO é criado.
--   * Colunas de cartão/chargeback: nenhuma (não há no §5.1; mudança do modelo-alvo).
--   * Timestamps de rastreio pós-aceite: `saiu_hub_em`, `cliente_chegou_em`,
--     `lojista_chegou_em` (estados saindo_hub/no_hub — automações LATER).
--   * `idx_pedidos_entregue_estab` (carteira/ledger D+7 — Épico 7, mudança 4).
--   * `atrasado_notificado` (job pg_cron §7.2 — LATER).
--
-- CHECK de status (§5.1, mudança 5): mantido PERMISSIVO com os 15 valores como
-- MODELO-ALVO — evita migration quando os estados adiados voltarem. No piloto só
-- IMPLEMENTA-SE o subconjunto de transições (RPCs deste e do próximo bloco):
--   aguardando_aceite → aceito → [em_preparo] → [no_hub] → entregue, + 'cancelado'.
-- Os demais valores existem no enum SEM lógica de transição no piloto.
--
-- DEFAULT de status (mudança dirigida pela missão): §5.1 usa DEFAULT
-- 'aguardando_pagamento'; AQUI o DEFAULT é 'aguardando_aceite' porque no DEV o
-- pagamento é SIMULADO e o pedido nasce já aguardando o aceite do lojista. No
-- Épico 7 (pagamento real), o DEFAULT volta a 'aguardando_pagamento' e o webhook
-- PIX promove para 'aguardando_aceite'. A RPC criar_pedido também grava o status
-- explicitamente (não depende do DEFAULT).
--
-- CHECKs de não-negatividade no snapshot financeiro: ENDURECIMENTO INTENCIONAL vs.
-- §5.1 (que não põe CHECK nessas colunas). Dinheiro nunca é negativo — coerente com
-- o `CHECK (taxa_deslocamento_reais >= 0)` de estabelecimentos (§1.4). Falha FECHADA.
--
-- ATOMICIDADE (obrigatório): tabela + helpers + índices + trigger + RLS + policies
-- neste ÚNICO arquivo, aplicados em UMA transação (regra §2 de 05-security.md —
-- tabela sem RLS ativada é falha de segurança). `apply_migration` (MCP) e
-- `supabase db push` envolvem o arquivo inteiro em transação. BEGIN/COMMIT
-- explícitos omitidos de propósito (não encerrar a transação externa do applier).
--
-- ROLLBACK (forward-only; se necessário reverter):
--     DROP TABLE IF EXISTS public.pedidos CASCADE;  -- índices/trigger/policies caem junto
--     DROP FUNCTION IF EXISTS public.pode_ver_pedido(public.pedidos);
--     DROP FUNCTION IF EXISTS public.meu_estabelecimento_id();
--     -- NÃO dropar public.set_atualizado_em() nem public.is_admin() (compartilhados).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabela `pedidos` (03-data-models.md §5.1 — subset do piloto).
-- -----------------------------------------------------------------------------
CREATE TABLE public.pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero serial NOT NULL UNIQUE,                     -- número humano-amigável tipo #2048

  -- Relações (ON DELETE RESTRICT — pedido é histórico obrigatório; §5.1)
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  estabelecimento_id uuid NOT NULL REFERENCES public.estabelecimentos(id) ON DELETE RESTRICT,
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE RESTRICT,

  -- Estado — CHECK PERMISSIVO (15 valores = modelo-alvo, mudança 5). DEFAULT dev.
  status text NOT NULL DEFAULT 'aguardando_aceite'
    CHECK (status IN (
      'aguardando_pagamento',
      'aguardando_aceite',
      'aceito',
      'em_preparo',
      'saindo_hub',
      'no_hub',
      'entregue',
      'cancelado',
      'cancelado_timeout',
      'cancelado_atraso',
      'cancelado_admin',
      'recusado',
      'nao_retirado',
      'nao_entregue_lojista',
      'estornado_chargeback'
    )),

  -- PIN (§5.1 / §4.4). pin_hash = crypt(pin, gen_salt('bf',10)); pin_texto = plano
  -- (só exibível ao cliente-dono via RLS). tentativas_pin / pin_bloqueado_ate
  -- EXISTEM aqui, mas a POLÍTICA de lockout (máximo de tentativas + expiração) é da
  -- CONFIRMAÇÃO de PIN (próximo bloco) e depende da decisão Q2.2 (pendente
  -- stakeholder) — NÃO implementada nesta migration. Ver observação ao fim.
  pin_hash text NOT NULL,
  pin_texto text NOT NULL,
  tentativas_pin int NOT NULL DEFAULT 0,
  pin_bloqueado_ate timestamptz,

  -- Timing (subset do piloto)
  tempo_estimado_min int,                            -- informado no aceite (RPC aceitar_pedido)
  criado_em timestamptz NOT NULL DEFAULT NOW(),
  pago_em timestamptz,                               -- DEV: gravado na criação (pagamento simulado)
  aceito_em timestamptz,
  entregue_em timestamptz,                           -- gravado pela RPC de PIN (próximo bloco)
  cancelado_em timestamptz,

  -- Financeiro — snapshot no momento da compra (§5.1 + taxa_servico_comprador NOVA)
  subtotal_produtos_reais numeric(10,2) NOT NULL CHECK (subtotal_produtos_reais >= 0),
  taxa_deslocamento_reais numeric(10,2) NOT NULL CHECK (taxa_deslocamento_reais >= 0),
  taxa_keepit_reais numeric(10,2) NOT NULL CHECK (taxa_keepit_reais >= 0),          -- 12% do subtotal
  taxa_servico_comprador_reais numeric(10,2) NOT NULL DEFAULT 0
    CHECK (taxa_servico_comprador_reais >= 0),       -- NOVA: taxa provisória R$ 2,90 do comprador (checkout)
  total_pago_reais numeric(10,2) NOT NULL CHECK (total_pago_reais >= 0),

  -- Meta
  nf_solicitada boolean NOT NULL DEFAULT false,
  motivo_recusa text,
  motivo_cancelamento text,
  motivo_nao_retirado text,

  -- Pagamento — CHECK permissivo (pix/cartao = modelo-alvo); no piloto SÓ 'pix'
  -- (cartão é LATER). A RPC criar_pedido sempre grava 'pix'.
  forma_pagamento text NOT NULL DEFAULT 'pix' CHECK (forma_pagamento IN ('pix', 'cartao')),

  atualizado_em timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.pedidos IS
  'Tabela central do pedido (03-data-models.md §5.1 — subset do piloto). Escrita de '
  'status/PIN/valores/timestamps e exclusiva de RPCs SECURITY DEFINER (criar_pedido, '
  'aceitar_pedido, confirmar_pin_pedido) — NAO ha INSERT/UPDATE/DELETE direto do app '
  '(RLS fail-closed). DEV: pagamento SIMULADO (nasce aguardando_aceite; pago_em=now). '
  'FORA do piloto: asaas_payment_id/qr_code_pix/pix_copia_e_cola, timestamps de hub, '
  'idx carteira, atrasado_notificado (Epico 7 / LATER).';

-- Índices do §5.1 que servem ao piloto (excluídos: idx_pedidos_asaas e
-- idx_pedidos_entregue_estab — Épico 7).
--   idx_pedidos_cliente: "meus pedidos" no app do cliente (lista por data desc).
CREATE INDEX idx_pedidos_cliente ON public.pedidos(cliente_id, criado_em DESC);
--   idx_pedidos_estab: fila de pedidos do lojista (por data desc).
CREATE INDEX idx_pedidos_estab ON public.pedidos(estabelecimento_id, criado_em DESC);
--   idx_pedidos_hub: pedidos por hub (operação de retirada).
CREATE INDEX idx_pedidos_hub ON public.pedidos(hub_id, criado_em DESC);
--   idx_pedidos_status: filtros por estado (Admin/lojista).
CREATE INDEX idx_pedidos_status ON public.pedidos(status);
--   idx_pedidos_aguardando_aceite: consulta MANUAL do Admin de pedidos vencidos
--   (status='aguardando_aceite' AND criado_em < now() - interval '10 min'), já que o
--   job de timeout automático (§7.1 / Story 6.10) está FORA do piloto. Barato; passa
--   a servir também o job quando reativado.
CREATE INDEX idx_pedidos_aguardando_aceite
  ON public.pedidos(criado_em)
  WHERE status = 'aguardando_aceite';

-- Trigger de atualização de `atualizado_em` (reutiliza o utilitário compartilhado
-- public.set_atualizado_em(), já existente — NÃO recriado aqui).
CREATE TRIGGER trg_pedidos_atualizado
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

-- -----------------------------------------------------------------------------
-- Helpers de visibilidade (05-security.md §1). SECURITY DEFINER + STABLE +
-- search_path='' (hardening). São a base das policies de SELECT de pedidos e
-- pedidos_itens. Por serem SECURITY DEFINER (consultam estabelecimentos/admin_users,
-- tabelas distintas de pedidos) NÃO há recursão de RLS.
--
-- POR QUE helpers (e não EXISTS inline como em produtos): a condição de
-- visibilidade do pedido é a MESMA em pedidos (SELECT) e em pedidos_itens (SELECT
-- derivado do pai). Centralizar em pode_ver_pedido evita duplicar a regra 3-vias
-- (cliente | lojista-dono | admin) e segue o §3.11 normativo, que a define assim.
-- [AUTO-DECISION] helpers vs. EXISTS inline → helpers (reason: reuso pedidos↔itens
-- + fidelidade ao §3.11; funcionalmente idêntico ao EXISTS da missão).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.meu_estabelecimento_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.estabelecimentos WHERE dono_user_id = auth.uid() LIMIT 1;
$$;

COMMENT ON FUNCTION public.meu_estabelecimento_id() IS
  '05-security.md §1. Retorna o estabelecimento do lojista logado (dono_user_id = '
  'auth.uid()) ou NULL. SECURITY DEFINER STABLE — usada nas policies de pedidos.';

CREATE OR REPLACE FUNCTION public.pode_ver_pedido(pedido_row public.pedidos)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.is_admin()
    OR pedido_row.cliente_id = auth.uid()
    OR pedido_row.estabelecimento_id = public.meu_estabelecimento_id();
$$;

COMMENT ON FUNCTION public.pode_ver_pedido(public.pedidos) IS
  '05-security.md §1/§3.11. True se o pedido pertence ao user como cliente-dono, '
  'como lojista-dono do estabelecimento, ou se is_admin(). SECURITY DEFINER (sem '
  'recursao de RLS). Usada em ve_pedidos_relacionados e ve_itens_relacionados.';

-- Grants dos helpers: EXECUTE para authenticated E anon (as policies de SELECT são
-- avaliadas para ambos; anon simplesmente não casa nenhuma condição → zero linhas).
-- Espelha o grant de is_admin() (migration 20260812132330).
REVOKE ALL ON FUNCTION public.meu_estabelecimento_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meu_estabelecimento_id() TO authenticated, anon;
REVOKE ALL ON FUNCTION public.pode_ver_pedido(public.pedidos) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pode_ver_pedido(public.pedidos) TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- RLS (05-security.md §2 + §3.11). Regra absoluta do §2: ENABLE + FORCE.
-- FORCE vale até para o owner — MAS as RPCs SECURITY DEFINER rodam como `postgres`
-- (BYPASSRLS), então continuam podendo escrever. FORCE protege contra escrita
-- direta indevida em caminhos privilegiados NÃO-BYPASSRLS.
--
-- DESENHO FAIL-CLOSED (mais restrito que o §3.11, coerente com a "Convencao
-- critica" do §3.11 e com a mudança 3 = PIN/estado via RPC):
--   * SELECT: cliente-dono | lojista-dono | admin (via pode_ver_pedido).
--   * INSERT/UPDATE/DELETE diretos do app: NEGADOS (WITH CHECK/USING false).
--     Toda criação/transição passa pelas RPCs SECURITY DEFINER (criar_pedido,
--     aceitar_pedido, confirmar_pin_pedido) — o app NUNCA escreve direto.
-- Diferença vs. §3.11: o doc tinha `cliente_cria_pedido` (INSERT) e
-- `relacionados_atualizam_pedido` (UPDATE amplo, que o próprio doc admite delegar
-- regra de campo à Edge Function). Com o estado agora 100% em RPC, essas policias
-- permissivas viram BURACO — removidas em favor do fail-closed. [AUTO-DECISION]
-- INSERT/UPDATE do app → NEGADOS (reason: mudança 3 canaliza escrita em RPC; não
-- relaxar RLS). Ver observação ao fim.
-- -----------------------------------------------------------------------------
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos FORCE ROW LEVEL SECURITY;

-- SELECT: cliente-dono, lojista-dono e admin (§3.11). Sem `TO` explícito (aplica a
-- todos os roles). anon não casa nenhuma condição → não vê nada.
CREATE POLICY ve_pedidos_relacionados ON public.pedidos
  FOR SELECT
  USING (public.pode_ver_pedido(pedidos.*));

-- INSERT direto do app: NEGADO. Criação SOMENTE via RPC criar_pedido (que gera PIN,
-- faz snapshot dos itens, valida hub atendido — tudo atômico e server-side).
CREATE POLICY sem_insert_direto_pedidos ON public.pedidos
  FOR INSERT
  WITH CHECK (false);

-- UPDATE direto do app: NEGADO. Transições de estado SOMENTE via RPC (aceitar_pedido,
-- confirmar_pin_pedido, cancelamentos). Cliente/lojista não mudam status/pin/valores.
CREATE POLICY sem_update_direto_pedidos ON public.pedidos
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

-- DELETE: NEGADO a todos (histórico obrigatório — §3.11 sem_delete_pedidos).
CREATE POLICY sem_delete_pedidos ON public.pedidos
  FOR DELETE
  USING (false);
