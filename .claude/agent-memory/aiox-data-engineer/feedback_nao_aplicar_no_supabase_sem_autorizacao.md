---
name: nao-aplicar-no-supabase-sem-autorizacao
description: Migrations no keepit-dev são escritas, não aplicadas — Caio autoriza a aplicação em passo separado
metadata:
  type: feedback
---

Entregar migrations como **arquivo `.sql` escrito e revisado**, sem executar `supabase db push` / `apply_migration` / qualquer DDL no projeto remoto `keepit-dev` (ref `jhhbewnmnorhmsdvfppo`). Leituras de diagnóstico contra o remoto são permitidas e esperadas.

**Why:** o projeto não tem ambiente de staging — o `keepit-dev` é o único banco real. Caio quer revisar o SQL antes de qualquer mudança de schema, e autoriza a aplicação num passo separado. Vale também para config de painel (ex.: `Confirm email`), que não aparece em `git diff` e não é revertível por `git revert`.

**How to apply:** escrever o `.sql` em `apps/supabase/supabase/migrations/`, documentar rollback ordenado no cabeçalho do próprio arquivo, e entregar o procedimento de aplicação/verificação em prosa para o Caio executar. Verificações fim-a-fim viram script pronto (ex.: `apps/supabase/scripts/verify-2.3.sh`), não execução direta.
