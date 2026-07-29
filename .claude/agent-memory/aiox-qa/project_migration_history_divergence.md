---
name: migration-history-divergence
description: Risco recorrente — migrations aplicadas via MCP recebem timestamp diferente do arquivo versionado pelo @dev, quebrando supabase db push/pull
metadata:
  type: project
---

No workflow do Keepit, o orquestrador aplica migrations no Supabase via MCP (`apply_migration`) enquanto o @dev versiona o `.sql` separadamente em `apps/supabase/supabase/migrations/`. Os dois recebem **timestamps diferentes**, então o histórico de migration do banco remoto diverge do arquivo local.

**Exemplo (Story 1.4):** banco registrou `20260729151310` (MCP), arquivo local ficou `20260729151625` (@dev). `supabase migration list --linked` e `db pull` bloqueiam com "remote migration history does not match local files", exigindo `supabase migration repair`.

**Why:** aplicação por MCP e versionamento por código são passos desacoplados; nenhum reconcilia o identificador de versão.

**How to apply:** ao revisar qualquer story que aplique migration via MCP, rodar `supabase migration list --linked` e comparar com o(s) arquivo(s) em `migrations/`. Se divergir, é achado de manutenção (MNT). Não bloqueia stories canário/infra, mas DEVE ser reconciliado antes da primeira migration de schema de produto real, senão `db push` trava. Registrado no gate 1.4 como MNT-001.
