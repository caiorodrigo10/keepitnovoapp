-- =============================================================================
-- Story 7.2 (docs/stories/7.2.story.md) — cobrança PIX real via Asaas em `pedidos`.
-- Autor: @dev (Dex). Data: 2026-08-27.
--
-- Fontes normativas:
--   docs/architecture/03-data-models.md §5.1 (DDL modelo-alvo: asaas_payment_id,
--   qr_code_pix, pix_copia_e_cola, idx_pedidos_asaas — deixadas de fora pela
--   migration `20260813004932_criar_pedidos.sql`, ver seu comentário "FICA FORA").
--
-- O QUE ESTA MIGRATION FAZ:
--   1. Adiciona 3 colunas NULLABLE a `pedidos` (nem todo pedido terá cobrança
--      Asaas — ex. pedidos de teste/mock antigos, ou pedidos criados antes desta
--      Story). `asaas_payment_id` é UNIQUE (1 cobrança Asaas por pedido).
--   2. Cria o índice parcial `idx_pedidos_asaas` (só indexa pedidos que já têm
--      cobrança — a maioria histórica não tem).
--   3. Flipa o DEFAULT de `pedidos.status` de 'aguardando_aceite' para
--      'aguardando_pagamento' (alinha ao modelo-alvo do §5.1).
--
-- POR QUE O FLIP DO DEFAULT É SEGURO (SEM EFEITO COMPORTAMENTAL HOJE):
--   As duas RPCs ativas de criação de pedido (`20260813004934_rpc_criar_pedido.sql`
--   linha 176 e `20260813050002_rpc_criar_pedido_com_ledger.sql` linha 122) gravam
--   `status` EXPLICITAMENTE na lista de colunas do INSERT ('aguardando_aceite') —
--   NENHUMA delas depende do DEFAULT da coluna. Portanto flipar o DEFAULT não muda
--   nenhum pedido criado por essas RPCs, hoje.
--
-- O QUE FALTA PARA O FLIP "VALER" DE FATO (fora do escopo desta Story):
--   Story 7.5 (webhook Asaas `PAYMENT_RECEIVED`) precisa existir para promover
--   aguardando_pagamento → aguardando_aceite quando o pagamento real é confirmado.
--   Só depois disso as RPCs `criar_pedido`/`criar_pedido_com_ledger` devem ser
--   editadas para gravar 'aguardando_pagamento' no INSERT (não feito nesta Story —
--   editá-las agora, sem o webhook, prenderia todo pedido novo em
--   'aguardando_pagamento' para sempre). Ver docs/stories/7.2.story.md,
--   "Decisão de sequência — DEFAULT de status (AC1)".
--
-- RLS: nenhuma policy nova necessária. A Edge Function `create-pix-payment`
-- (Story 7.2) grava estas 3 colunas via client com a `service_role` key (bypassa
-- RLS), mesmo padrão de toda escrita privilegiada do projeto (RPCs SECURITY
-- DEFINER). As policies existentes de `pedidos` (`20260813004932_criar_pedidos.sql`)
-- já negam INSERT/UPDATE direto do app — nada muda para o cliente/lojista.
-- =============================================================================

ALTER TABLE public.pedidos
  ADD COLUMN asaas_payment_id text UNIQUE,
  ADD COLUMN qr_code_pix text,
  ADD COLUMN pix_copia_e_cola text;

COMMENT ON COLUMN public.pedidos.asaas_payment_id IS
  'Story 7.2. Id da cobrança PIX no Asaas (`pay_...`). NULL para pedidos sem '
  'cobrança real (mock/teste/pré-Épico 7). UNIQUE — 1 cobrança Asaas por pedido.';
COMMENT ON COLUMN public.pedidos.qr_code_pix IS
  'Story 7.2. PNG base64 do QR Code PIX real (`AsaasPixQrCode.encodedImage`). '
  'NÃO é o valor exibido em `ModalPagamentoPix` (que continua usando '
  '`pixCopiaCola` fake até a Story 7.5+ trocar a fonte de dados da UI).';
COMMENT ON COLUMN public.pedidos.pix_copia_e_cola IS
  'Story 7.2. BR Code EMV real (`AsaasPixQrCode.payload`), copia-e-cola. Mesma '
  'nota de `qr_code_pix` — auditável, ainda não consumido pela UI.';

CREATE INDEX idx_pedidos_asaas
  ON public.pedidos(asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;

-- Flip do DEFAULT (modelo-alvo §5.1) — SEM efeito comportamental hoje, ver
-- comentário no cabeçalho deste arquivo. Story 7.2 (docs/stories/7.2.story.md).
ALTER TABLE public.pedidos
  ALTER COLUMN status SET DEFAULT 'aguardando_pagamento';
