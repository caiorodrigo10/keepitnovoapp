-- =============================================================================
-- Bloco 07 (Retirada com PIN) — coluna de timing `pedidos.saiu_hub_em`
-- Autor: @data-engineer (Dara). Data: 2026-08-13.
--
-- Adiciona SOMENTE a coluna `saiu_hub_em timestamptz` (nullable) à `pedidos`.
-- É a única coluna de rastreio pós-aceite que o PILOTO do Bloco 07 realmente usa:
-- a RPC `avancar_estado_pedido(..., 'saindo_hub')` (Story 6.12) a grava. Forward-only,
-- não destrutiva, idempotente (ADD COLUMN IF NOT EXISTS).
--
-- Fontes normativas:
--   docs/architecture/03-data-models.md §5.1  (coluna `saiu_hub_em timestamptz`,
--                                              mesmo nome/tipo do modelo-alvo)
--   docs/prd/epics/6-pedido-pin.md Story 6.12 AC2  (UPDATE ... saiu_hub_em = NOW())
--
-- Depende de: 20260813004932 (criar_pedidos) — que EXPLICITAMENTE deixou esta coluna
--   "FORA do piloto" (ver header daquela migration, linhas 37-38). Este bloco reabilita
--   apenas `saiu_hub_em`, porque a transição 'saindo_hub' entra agora (Story 6.12).
--
-- ============================ DECISÃO DE COLUNAS (por que só ESTA) =============
-- O §5.1 tem TRÊS colunas de rastreio pós-aceite: `saiu_hub_em`, `cliente_chegou_em`,
-- `lojista_chegou_em`. Adiciono APENAS `saiu_hub_em`. As outras duas seriam o check-in
-- de DOIS lados da Story 6.14 (cliente aperta "cheguei" + lojista aperta "cheguei" →
-- só então 'no_hub'). Mas o overlay do piloto — docs/architecture/07-mvp-pilot-backend.md
-- §"Fluxo do pedido no piloto" — decide que `at_hub` (= status 'no_hub') é atingido por
-- "UM check-in operacional do lojista" (linha 102/119), SEM exigir os dois devices.
-- No piloto esse único check-in é a própria RPC `avancar_estado_pedido(..., 'no_hub')`
-- chamada pelo lojista. Logo `cliente_chegou_em`/`lojista_chegou_em` NÃO são usadas no
-- piloto → não são adicionadas (KISS + no-invention: só cria coluna que alguma RPC/UI do
-- bloco realmente escreve). Voltam junto com a Story 6.14 completa (check-in bilateral),
-- em migration própria, quando/se sair do "later".
-- [AUTO-DECISION] check-in do piloto → 1 check-in do lojista via avancar_estado_pedido
--   (reason: 07-mvp-pilot-backend.md §fluxo "at_hub = um check-in operacional do lojista";
--   evita colunas mortas e o baile de 2 devices no piloto SIMPLE).
--
-- O CHECK de `status` já aceita 'saindo_hub' e 'no_hub' (criado permissivo com os 15
-- valores na 20260813004932) → NÃO há alteração de constraint aqui, só a coluna.
--
-- ATOMICIDADE: um único ALTER; o applier (MCP apply_migration / supabase db push) o
-- envolve em transação. Sem BEGIN/COMMIT explícito (não encerrar a transação do applier).
--
-- ROLLBACK (forward-only; se necessário reverter):
--     ALTER TABLE public.pedidos DROP COLUMN IF EXISTS saiu_hub_em;
--   Seguro: coluna nullable, sem default, sem dependências (nenhum índice/constraint a usa).
-- =============================================================================

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS saiu_hub_em timestamptz;

COMMENT ON COLUMN public.pedidos.saiu_hub_em IS
  'Bloco 07 / §5.1. Instante em que o lojista marcou "saindo para o hub" (Story 6.12). '
  'Gravado por avancar_estado_pedido(..., ''saindo_hub''). NULL até a transição. '
  'cliente_chegou_em/lojista_chegou_em (check-in bilateral da Story 6.14) ficam LATER: '
  'no piloto, at_hub=no_hub via UM check-in do lojista (07-mvp-pilot-backend.md).';
