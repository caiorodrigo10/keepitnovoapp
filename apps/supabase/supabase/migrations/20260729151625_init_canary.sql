-- Story 1.4 — migration canário: prova de conexão end-to-end com o projeto
-- Supabase cloud `keepit-dev` (ref jhhbewnmnorhmsdvfppo).
--
-- Esta migration NÃO modela nenhuma regra de negócio do Keepit. A tabela
-- `_canary` existe apenas para validar que o app consegue ler dados do banco
-- via RLS pública, com nenhuma outra parte do sistema referenciando-a.
--
-- Aplicada no banco `keepit-dev` pelo orquestrador via MCP do Supabase
-- (`apply_migration`) em 2026-07-29. Este arquivo é a versão de rastreabilidade
-- do mesmo SQL — ver docs/stories/1.4.story.md, Task 3/4.

create table if not exists public._canary (
  id serial primary key,
  message text
);

alter table public._canary enable row level security;

create policy "canary_public_select"
  on public._canary
  for select
  using (true);
