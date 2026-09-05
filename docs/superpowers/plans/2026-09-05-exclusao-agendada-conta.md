# Scheduled Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o cliente agende a exclusão, recupere a conta por sete dias e demonstre o mesmo ciclo no mock, com uma página pública mínima e conclusão privilegiada somente após aprovação da política de retenção.

**Architecture:** Uma `AccountDeletionPort` única atende app e página pública. No real, uma Edge Function autenticada deriva o usuário do JWT, reautentica a senha e grava/cancela o agendamento idempotente; outra função, chamada por cron com segredo, reclama vencidos e aplica a matriz de retenção aprovada. No mock, a mesma port persiste prazo/estado e usa o relógio QA. O navegador resolve sessão + estado de exclusão antes de montar `Main`.

**Tech Stack:** TypeScript 5.9, Vitest 1.2, React 19, React Native 0.86, Next 16, Supabase JS 2.111, Postgres/RLS, Edge Functions e AsyncStorage já instalados.

**Spec:** `docs/superpowers/specs/2026-09-04-estabilizacao-beta-android-cliente-design.md` (§§ 18, 21–23) e `docs/stories/12.13.story.md`

## Global Constraints

- **Gate bloqueante:** não escrever nem ativar o finalizador destrutivo enquanto Produto/Jurídico não registrar no repositório a política aprovada, campo a campo, de apagar/anonimizar/reter e a auditoria mínima. Sem esse artefato, executar somente agendamento/recuperação, mock e UI e manter a Story 12.13 incompleta.
- Prazo é `requestedAt + interval '7 days'`, calculado no servidor/relógio mock injetado. Agendar, cancelar e processar são idempotentes; falha de persistência nunca mostra sucesso nem encerra sessão.
- Toda operação real deriva `user.id` de um JWT validado; nenhuma API aceita `clienteId`. Para agendar, a Edge Function reautentica a senha em um client por request e exige que o usuário retornado seja o mesmo do JWT. Senhas, JWTs e service keys nunca são persistidos ou logados.
- A tabela pública tem RLS forçada, SELECT somente do próprio usuário e nenhuma escrita direta por `anon`/`authenticated`. A service role fica somente nas Edge Functions e, conforme a [documentação oficial](https://supabase.com/docs/guides/database/postgres/row-level-security#bypassing-row-level-security), bypassa RLS; portanto o handler também valida ownership e ação.
- Antes de tocar Supabase, reler o [changelog](https://supabase.com/changelog), Auth, [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [scheduling](https://supabase.com/docs/guides/functions/schedule-functions) e `supabase --help`/`--help` do subcomando. Não adicionar CLI ou dependência ao projeto e não inventar timestamp de migration.
- Iterar no projeto de desenvolvimento via MCP/SQL aprovado, rodar advisors de segurança/performance e materializar cada alteração com `supabase db pull <label> --local --yes`; revisar o diff e `supabase migration list` antes do commit.
- O rollback remove/desliga somente cron, funções e tabela novos; nunca apaga dados do cliente. JWTs já emitidos podem sobreviver até expirar, então operações sensíveis consultam o estado de exclusão e o finalizador revoga sessões antes de concluir.
- A página pública usa o mesmo adapter/Edge Function do app. Como WA-001 segue pendente, mostrar suporte indisponível de forma honesta; não inventar telefone, e-mail ou URL.
- Não adicionar pacote, matriz manual nem APK nesta story. O fluxo mock e a prova Android ficam no único smoke da Story 12.14.

---

### Task 1: Criar ciclo Supabase seguro de agendar, consultar e recuperar

**Files:**
- Create via Supabase CLI pull: `apps/supabase/supabase/migrations/<CLI-output>_account_deletion_lifecycle.sql`
- Create: `apps/supabase/supabase/tests/database/account_deletion_rls.test.sql`
- Create: `apps/supabase/supabase/functions/account-deletion/handler.ts`
- Create: `apps/supabase/supabase/functions/account-deletion/handler.test.ts`
- Create: `apps/supabase/supabase/functions/account-deletion/index.ts`
- Create: `apps/supabase/supabase/functions/account-deletion/README.md`
- Modify (generated): `packages/shared-types/src/supabase.ts`
- Modify: `docs/architecture/03-data-models.md`
- Modify: `docs/architecture/05-security.md`

**Interfaces:** `POST account-deletion { action: 'status' | 'schedule' | 'cancel', currentPassword?: string }` returns only `{ status, requestedAt, deleteAt }`; it never accepts an account ID.

- [ ] **Step 1: Escrever RED de limites, idempotência e autorização.** No handler puro, cobrir senha inválida, identidade reautenticada diferente, `schedule` repetido com o mesmo prazo, `cancel` repetido e falha de gravação sem sucesso. No pgTAP, usar dois usuários para provar SELECT próprio, invisibilidade cruzada, DML negado, constraint de sete dias e uma única solicitação ativa.
- [ ] **Step 2: Implementar schema e handler mínimo.** Criar estado `scheduled|cancelled|processing|completed|failed`, timestamps UTC, índice parcial de uma solicitação ativa e grants/RLS mínimos. O entrypoint valida JWT, obtém e-mail do usuário, reautentica com `signInWithPassword` em client efêmero e usa service role somente depois de comparar IDs. `schedule` grava antes de responder; `cancel` muda apenas a própria solicitação.
- [ ] **Step 3: Validar e materializar migration.** Executar os advisors, `supabase db pull account_deletion_lifecycle --local --yes`, `supabase db reset`, `supabase test db`, `supabase migration list`, depois:

  Run: `pnpm --filter @keepit/supabase test -- supabase/functions/account-deletion/handler.test.ts && pnpm --filter @keepit/supabase typecheck && pnpm --filter @keepit/shared-types typecheck`

  Expected: PASS para senha, ownership, prazo e idempotência; o diff gerado contém apenas objetos aditivos.
- [ ] **Step 4: Commit.** Adicionar somente o caminho emitido pelo CLI, teste SQL, função, tipos e docs; commit `feat(supabase): schedule account deletion securely`.

### Task 2: Concluir vencidos somente sob a política aprovada

**Precondition:** a política aprovada está registrada em `docs/PERGUNTAS_REGRAS_NEGOCIO.md` (ou artefato normativo referenciado por ele). Se faltar qualquer campo/prazo/base de retenção, **STOP**: não criar cron/finalizador e não declarar AC6 concluído.

**Files:**
- Create: `apps/supabase/supabase/functions/process-account-deletions/handler.ts`
- Create: `apps/supabase/supabase/functions/process-account-deletions/handler.test.ts`
- Create: `apps/supabase/supabase/functions/process-account-deletions/index.ts`
- Create: `apps/supabase/supabase/functions/process-account-deletions/README.md`
- Create via Supabase CLI pull: `apps/supabase/supabase/migrations/<CLI-output>_schedule_account_deletion_processor.sql`
- Modify: `apps/supabase/supabase/tests/database/account_deletion_rls.test.sql`
- Modify: `docs/architecture/03-data-models.md`
- Modify: `docs/architecture/05-security.md`

- [ ] **Step 1: Traduzir a decisão aprovada em RED.** Fixar uma fixture por categoria de dado e provar, com `now` injetado, que `deleteAt > now` não processa, `deleteAt <= now` processa uma vez, concorrência reclama uma linha uma vez, retries retomam `failed/processing` com segurança e a auditoria contém somente campos aprovados.
- [ ] **Step 2: Implementar claim e finalização idempotentes.** Uma RPC privilegiada reclama vencidos atomicamente; o handler revoga sessões, aplica exatamente a matriz aprovada, remove/anônimiza Auth por último e marca `completed`. O cron chama a função com segredo guardado no Vault; nenhum segredo ou dado pessoal entra na migration, resposta ou log.
- [ ] **Step 3: Validar segurança, migration e rollback não destrutivo.** Rodar handlers, pgTAP, advisors, `supabase db pull schedule_account_deletion_processor --local --yes`, `supabase db reset`, `supabase test db` e `supabase migration list`. Documentar no README como desabilitar cron/função sem restaurar nem excluir dados do cliente.
- [ ] **Step 4: Commit.** Commit `feat(supabase): process due account deletions` somente após a precondition e todos os gates verdes.

### Task 3: Entregar a port real/mock e o relógio QA

**Files:**
- Create: `packages/core-data/src/ports/account-deletion.port.ts`
- Create: `packages/core-data/src/supabase/account-deletion.supabase.ts`
- Create: `packages/core-data/src/supabase/account-deletion.supabase.test.ts`
- Create: `packages/core-data/src/mock/account-deletion.mock.ts`
- Create: `packages/core-data/src/mock/account-deletion.mock.test.ts`
- Modify: `packages/core-data/src/mock/cliente-state.ts`
- Modify: `packages/core-data/src/mock/cliente-state-store.ts`
- Modify: `packages/core-data/src/mock/cliente-state-store.test.ts`
- Modify: `packages/core-data/src/ports/demo-scenario.port.ts`
- Modify: `packages/core-data/src/index.ts`
- Modify: `packages/core-data/src/index.test.ts`

**Interfaces:** `AccountDeletionPort.status()`, `schedule(currentPassword)`, `cancel()`; `DemoScenarioPort.advanceClock(ms)` usa o mesmo relógio do mock e nunca existe no datasource Supabase.

- [ ] **Step 1: Escrever RED comum.** Rodar o mesmo contrato contra fake Supabase e mock: reauth, sete dias exatos, repetir schedule/cancel, persistir/reabrir, avançar para `due`, bloquear credencial após conclusão mock e reset restaurar `cliente-ana`/`keepit123`.
- [ ] **Step 2: Implementar adapters sem bifurcação na UI.** Supabase invoca somente `account-deletion`; mock valida a senha atual, persiste antes de resolver e aplica a mesma matriz aprovada ao vencer. Aumentar a versão do snapshot com migração retrocompatível e manter `advanceClock` restrito ao cenário QA.
- [ ] **Step 3: Executar gate focado.**

  Run: `pnpm --filter @keepit/core-data test -- src/mock/account-deletion.mock.test.ts src/supabase/account-deletion.supabase.test.ts src/mock/cliente-state-store.test.ts src/index.test.ts`

  Run: `pnpm --filter @keepit/core-data typecheck`

  Expected: PASS para limites, restart, erro, conclusão mock e reset.
- [ ] **Step 4: Commit.** Commit `feat(core-data): model account deletion lifecycle`.

### Task 4: Restringir navegação e expor app/página pública

**Files:**
- Create: `apps/cliente/src/lib/accountDeletionRoute.ts`
- Create: `apps/cliente/src/lib/accountDeletionRoute.test.ts`
- Create: `apps/cliente/src/screens/auth/ExclusaoAgendada.tsx`
- Modify: `apps/cliente/src/screens/perfil/ExcluirConta.tsx`
- Modify: `apps/cliente/src/screens/perfil/PainelQA.tsx`
- Modify: `apps/cliente/src/navigation/RootNavigator.tsx`
- Modify: `apps/cliente/src/navigation/types.ts`
- Create: `apps/admin/app/conta/exclusao/page.tsx`
- Create: `apps/admin/src/components/AccountDeletionPublicFlow.tsx`

- [ ] **Step 1: Escrever RED do gate raiz.** `resolveAccountRoute(session, deletion)` retorna `Auth`, `Main` ou `ScheduledDeletion`; nunca monta `Main` enquanto `status()` carrega/falha, e cancelamento bem-sucedido libera `Main`.
- [ ] **Step 2: Integrar os fluxos.** `ExcluirConta` explica efeitos/prazo, exige confirmação + senha e só então agenda e faz sign-out. Novo login agendado monta somente data, “Recuperar minha conta” e “Sair”. `PainelQA` avança além de sete dias. A página pública identifica com e-mail/senha, chama a mesma port, encerra a sessão e mostra prazo/suporte indisponível sem importar service key.
- [ ] **Step 3: Executar gate final.**

  Run: `pnpm --filter @keepit/cliente test -- src/lib/accountDeletionRoute.test.ts && pnpm --filter @keepit/cliente typecheck`

  Run: `pnpm --filter @keepit/admin typecheck && pnpm --filter @keepit/core-data typecheck && pnpm --filter @keepit/supabase typecheck`

  Expected: PASS sem rota de bypass, segredo público ou contato inventado. Não gerar APK.
- [ ] **Step 4: Commit.** Commit `feat(cliente): expose recoverable account deletion`.
