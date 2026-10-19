-- =============================================================================
-- Bloco 08 (Carteira & Ledger interno — Épico 7 SEM Asaas) —
--   Tabela `lancamentos_financeiros`: LEDGER ÚNICO append-only do piloto.
-- Autor: @data-engineer (Dara). Data: 2026-08-13.
--
-- Fontes normativas:
--   docs/architecture/03-data-models.md §6.1  (ledger único / DDL / convenção de
--                                              sinal / índices / trigger de imutabilidade)
--   docs/architecture/03-data-models.md §6    (mudança 4 — reconciliação para 1 ledger)
--   docs/architecture/05-security.md   §2      (ENABLE + FORCE RLS; falha fechada)
--   docs/PERGUNTAS_REGRAS_NEGOCIO.md Rodada 8  (escrow D+7; taxa Keepit 10%; saque mín R$200)
--
-- Depende de: 20260812123046 (estabelecimentos), 20260813004932 (pedidos),
--             20260812132330 (is_admin), 20260813004932 (meu_estabelecimento_id).
--             gen_random_uuid() e NOW() são de pg_catalog (core PG15) — resolvem
--             mesmo sob search_path='' das RPCs que inserem aqui.
--
-- ============================ O QUE É ESTE LEDGER ==============================
-- APPEND-ONLY / IMUTÁVEL: uma linha por movimento financeiro. É a FONTE DA VERDADE
-- do dinheiro no piloto (nunca "soma recalculada só na UI"). Correções NUNCA alteram
-- o valor de uma linha — entram como NOVOS lançamentos (estorno + relançamento).
-- Só os campos operacionais do passo manual do Admin (Bloco 09) são mutáveis
-- (status, asaas_id_externo, concluido_em, ator_admin_id, detalhe). valor_centavos,
-- tipo, os vínculos (estabelecimento_id, pedido_id), criado_em E disponivel_em são
-- imutáveis (trigger abaixo).
--
-- ===================== CONVENÇÃO DE SINAL (documentada) ========================
-- valor_centavos é ASSINADO, em CENTAVOS (bigint), na perspectiva da CARTEIRA do
-- lojista: POSITIVO = aumenta o que a Keepit deve ao lojista; NEGATIVO = reduz.
--   * charge          (+)  pagamento do cliente pelo pedido. AUDITORIA/RASTREIO —
--                          NÃO entra na carteira (ver view §6.2 / Model B abaixo).
--   * platform_fee    (−)  comissão Keepit (percentual do snapshot do pedido).
--                          AUDITORIA — NÃO entra na carteira (ver NOTA MODEL B).
--   * merchant_credit (+)  crédito LÍQUIDO do pedido entregue (subtotal − taxa_keepit
--                          + deslocamento). ENTRA na carteira, sujeito a D+7.
--   * merchant_credit (−)  ajuste manual do Admin que DEBITA o lojista. ENTRA
--                          (imediato → total_debitado).
--   * refund          (−)  dinheiro devolvido ao CLIENTE. AUDITORIA — NÃO entra na
--                          carteira (espelha o legado: reembolso não debitava o lojista).
--   * payout          (−)  saque/repasse PIX manual ao lojista. ENTRA (imediato →
--                          total_sacado).
--
-- ---------------------------------------------------------------------------
-- NOTA MODEL B (DECISÃO — LER; difere do texto literal de §6.1/§6.2) — para Caio
-- ---------------------------------------------------------------------------
-- A missão instrui (item 3) que `merchant_credit` seja o LÍQUIDO do lojista
-- (subtotal − taxa_keepit + deslocamento) e que a view bloqueie APENAS
-- `merchant_credit`. Sob esse contrato, `charge` e `platform_fee` são lançamentos
-- de AUDITORIA (registram o dinheiro que entrou e a comissão), mas NÃO são somados
-- na carteira — senão a comissão seria descontada DUAS vezes (uma dentro do líquido,
-- outra via platform_fee). Chamo isto de "Model B".
--   * §6.1 (texto) descreve o "Model A": merchant_credit = BRUTO (subtotal+deslocamento)
--     e platform_fee (−taxa_keepit) AMBOS entram na carteira, pareados em D+7, e a
--     soma reproduz o líquido. Os DOIS modelos produzem EXATAMENTE os mesmos números
--     de saída (saldo disponível/bloqueado/sacado/debitado).
--   * Segui Model B porque a missão dá a FÓRMULA explícita de merchant_credit=LÍQUIDO
--     e descreve a view bloqueando só merchant_credit — contrato interno consistente.
--   * ÚNICA divergência vs. §6.2 literal: a view NÃO inclui `platform_fee` na
--     agregação (ver a migration da view). Se você preferir fidelidade estrita ao
--     §6.1/§6.2 (Model A), me avise: troca-se merchant_credit para BRUTO na entrega,
--     move-se platform_fee para a ENTREGA (pareado, disponivel_em=D+7) e re-inclui-se
--     platform_fee nos dois primeiros filtros da view. É uma troca localizada.
--
-- ===================== JANELA D+7 (escrow) — via disponivel_em =================
-- O crédito de um pedido entregue só entra no saldo DISPONÍVEL após
-- entregue_em + interval '7 days'; antes disso é saldo BLOQUEADO. Materializado no
-- campo `disponivel_em`:
--   * merchant_credit POSITIVO (crédito da entrega): disponivel_em = entregue_em + 7d
--     (gravado por confirmar_pin_pedido no momento da entrega). Assim
--     disponivel_em <= now() ⟺ entregue_em <= now() − 7d.
--   * payout / refund / ajuste (merchant_credit negativo): disponivel_em NULL
--     (efeito imediato — débito/saque não é "bloqueado").
--
-- ============================ HARDENING / RLS =================================
-- ENABLE + FORCE RLS (regra §2 — tabela sem RLS é falha de segurança). Escrita
-- DIRETA do app NEGADA (INSERT/UPDATE/DELETE → false). Todo lançamento nasce por
-- RPC SECURITY DEFINER (criar_pedido, confirmar_pin_pedido, solicitar_saque e, no
-- Bloco 09, admin_acao_financeira) que roda como `postgres` (BYPASSRLS). SELECT:
-- lojista vê os PRÓPRIOS (estabelecimento_id = meu_estabelecimento_id()); admin vê
-- tudo (is_admin()). Verificar get_advisors(type='security') após aplicar.
--
-- ATOMICIDADE: tabela + índices + trigger + RLS + policies neste ÚNICO arquivo, em
-- UMA transação do applier (apply_migration / db push). Sem BEGIN/COMMIT explícito.
--
-- ROLLBACK (forward-only; se necessário reverter):
--     DROP TABLE IF EXISTS public.lancamentos_financeiros CASCADE;
--     DROP FUNCTION IF EXISTS public.lancamento_financeiro_imutavel();
-- =============================================================================

CREATE TABLE public.lancamentos_financeiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vínculos (imutáveis)
  estabelecimento_id uuid NOT NULL REFERENCES public.estabelecimentos(id) ON DELETE RESTRICT,
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE RESTRICT,   -- NULL para ajuste/saque sem pedido

  -- Fato financeiro (imutável). valor_centavos ASSINADO (ver convenção de sinal).
  tipo text NOT NULL CHECK (tipo IN ('charge', 'platform_fee', 'merchant_credit', 'refund', 'payout')),
  valor_centavos bigint NOT NULL,

  -- Passo manual do Admin / execução (mutável — Bloco 09)
  status text NOT NULL DEFAULT 'concluido'
    CHECK (status IN ('pendente', 'concluido', 'erro')),
  asaas_id_externo text,                             -- id de cobrança/transferência Asaas, quando existir
  ator_admin_id uuid REFERENCES auth.users(id),      -- admin que executou payout/refund/ajuste
  detalhe text,

  -- Liberação D+7 (escrow). NULL = disponível imediatamente.
  disponivel_em timestamptz,

  criado_em timestamptz NOT NULL DEFAULT NOW(),
  concluido_em timestamptz                           -- quando o passo manual (payout/refund) conclui
);

COMMENT ON TABLE public.lancamentos_financeiros IS
  'Bloco 08. Ledger UNICO append-only do piloto (03-data-models.md §6.1, mudanca 4). '
  'Fonte da verdade do dinheiro. valor_centavos ASSINADO (+ aumenta o que a Keepit deve '
  'ao lojista; - reduz). Escrita SO via RPC SECURITY DEFINER (RLS fail-closed). Imutavel: '
  'valor/tipo/vinculos/criado_em/disponivel_em (trigger). Mutavel (Admin/Bloco 09): status/'
  'asaas_id_externo/concluido_em/ator_admin_id/detalhe. D+7 via disponivel_em. Carteira = '
  'view carteira_lojista (agregacao SUM/FILTER). Model B: merchant_credit carrega o LIQUIDO; '
  'charge/platform_fee sao auditoria (fora da carteira).';

COMMENT ON COLUMN public.lancamentos_financeiros.valor_centavos IS
  'Assinado, em CENTAVOS. + aumenta o devido ao lojista; - reduz. merchant_credit+ = '
  'liquido da entrega (subtotal - taxa_keepit + deslocamento); platform_fee-/charge+ = '
  'auditoria; payout-/refund- ; merchant_credit- = ajuste do Admin.';
COMMENT ON COLUMN public.lancamentos_financeiros.disponivel_em IS
  'Escrow D+7. merchant_credit+ da entrega: entregue_em + 7 dias. NULL = imediato '
  '(payout/refund/ajuste). disponivel_em <= now() <=> credito liberado.';

-- Índices (missão): por estabelecimento+disponivel_em (carteira/D+7); fila de
-- pendentes do Admin (payout/refund a executar); por pedido.
CREATE INDEX idx_lancamentos_estab ON public.lancamentos_financeiros(estabelecimento_id, disponivel_em);
CREATE INDEX idx_lancamentos_pendentes ON public.lancamentos_financeiros(status, criado_em)
  WHERE status = 'pendente';
CREATE INDEX idx_lancamentos_pedido ON public.lancamentos_financeiros(pedido_id)
  WHERE pedido_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Imutabilidade append-only (trigger). Bloqueia UPDATE de valor/tipo/vínculos/
-- criado_em/disponivel_em; permite só status/asaas_id_externo/concluido_em/
-- ator_admin_id/detalhe (passo manual do Admin — Bloco 09).
-- Nota: `disponivel_em` é IMUTÁVEL aqui (endurecimento vs. §6.1, que não o listava)
--   para honrar a allow-list EXPLÍCITA da missão (só os 5 campos acima mutáveis) —
--   o D+7 é fato econômico e não deve ser adiado/alterado depois de gravado.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lancamento_financeiro_imutavel()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.valor_centavos       IS DISTINCT FROM OLD.valor_centavos
     OR NEW.tipo              IS DISTINCT FROM OLD.tipo
     OR NEW.estabelecimento_id IS DISTINCT FROM OLD.estabelecimento_id
     OR NEW.pedido_id         IS DISTINCT FROM OLD.pedido_id
     OR NEW.criado_em         IS DISTINCT FROM OLD.criado_em
     OR NEW.disponivel_em     IS DISTINCT FROM OLD.disponivel_em THEN
    RAISE EXCEPTION 'lancamentos_financeiros: valor/tipo/vinculo/criado_em/disponivel_em sao imutaveis — registre um NOVO lancamento para corrigir';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.lancamento_financeiro_imutavel() IS
  'Bloco 08. Trigger append-only: bloqueia UPDATE de valor_centavos/tipo/'
  'estabelecimento_id/pedido_id/criado_em/disponivel_em. So status/asaas_id_externo/'
  'concluido_em/ator_admin_id/detalhe sao mutaveis (passo manual do Admin — Bloco 09).';

CREATE TRIGGER trg_lancamento_imutavel
  BEFORE UPDATE ON public.lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.lancamento_financeiro_imutavel();

-- -----------------------------------------------------------------------------
-- RLS (05-security.md §2 — ENABLE + FORCE). Escrita direta do app NEGADA; leitura
-- por dono/admin. As RPCs SECURITY DEFINER (postgres, BYPASSRLS) escrevem.
-- -----------------------------------------------------------------------------
ALTER TABLE public.lancamentos_financeiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos_financeiros FORCE ROW LEVEL SECURITY;

-- SELECT: admin tudo; lojista os próprios (estabelecimento_id do dono logado).
-- meu_estabelecimento_id() é NULL p/ quem não é lojista → `= NULL` nunca casa → 0 linhas.
CREATE POLICY le_ve_relacionados ON public.lancamentos_financeiros
  FOR SELECT
  USING (
    public.is_admin()
    OR estabelecimento_id = public.meu_estabelecimento_id()
  );

-- INSERT/UPDATE/DELETE diretos do app: NEGADOS. Só RPC SECURITY DEFINER escreve.
CREATE POLICY le_sem_insert_direto ON public.lancamentos_financeiros
  FOR INSERT WITH CHECK (false);
CREATE POLICY le_sem_update_direto ON public.lancamentos_financeiros
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY le_sem_delete_direto ON public.lancamentos_financeiros
  FOR DELETE USING (false);
