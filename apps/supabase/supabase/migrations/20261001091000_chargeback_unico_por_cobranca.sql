BEGIN;

-- Uma tentativa representa uma cobrança externa única (`asaas_payment_id` é
-- UNIQUE). As fases REQUESTED, DISPUTE e AWAITING_REVERSAL são recibos
-- diferentes do mesmo ciclo financeiro e devem apontar para uma só ocorrência.
-- Se uma versão anterior já permitiu duas decisões para a mesma cobrança, não é
-- seguro escolher automaticamente qual débito estornar durante uma migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT op.tentativa_id
    FROM public.ocorrencias_pagamento op
    JOIN public.decisoes_chargeback dc ON dc.ocorrencia_id = op.id
    WHERE op.tipo = 'chargeback'
    GROUP BY op.tentativa_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'CHARGEBACK_DUPLICADO_JA_DECIDIDO_REQUER_CONCILIACAO';
  END IF;
END;
$$;

-- Preserva a ocorrência já decidida quando existir; caso contrário, preserva a
-- primeira. Os demais eventos continuam auditáveis em `eventos_pagamento`.
WITH ocorrencias_ordenadas AS (
  SELECT
    op.id,
    row_number() OVER (
      PARTITION BY op.tentativa_id
      ORDER BY (dc.id IS NOT NULL) DESC, op.criado_em, op.id
    ) AS posicao
  FROM public.ocorrencias_pagamento op
  LEFT JOIN public.decisoes_chargeback dc ON dc.ocorrencia_id = op.id
  WHERE op.tipo = 'chargeback'
)
DELETE FROM public.ocorrencias_pagamento op
USING ocorrencias_ordenadas oo
WHERE op.id = oo.id
  AND oo.posicao > 1;

CREATE UNIQUE INDEX ocorrencia_chargeback_unica_por_tentativa
  ON public.ocorrencias_pagamento(tentativa_id)
  WHERE tipo = 'chargeback';

COMMENT ON INDEX public.ocorrencia_chargeback_unica_por_tentativa IS
  'Uma ocorrência financeira por cobrança; fases distintas do ciclo de chargeback permanecem em eventos_pagamento.';

COMMIT;
