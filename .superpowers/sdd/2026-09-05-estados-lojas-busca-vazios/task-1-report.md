# Task 1 report — contrato central e paridade pública mock/Supabase

## Status

Implementado no worktree `story-12-1-mock-cliente`.

## Entregas

- `Estabelecimento` agora modela `excluido_em`, com fixtures e mapeamentos Supabase completos.
- `LojaDisponibilidade` e `resolveLojaDisponibilidade` centralizam visibilidade e compra: exclusão vence status administrativo; apenas lojas públicas derivam `aberta`, `fechada` ou `pausada`.
- `StorePort.listByHub` mantém lojas públicas pausadas/fechadas. O mock filtra pela projeção central e o adapter Supabase conserva apenas os predicados `status = 'ativo'` e `excluido_em IS NULL`.
- A migration `20260905090000_cliente_consulta_lojas_indisponiveis.sql` recria somente as três policies públicas relevantes com `TO anon, authenticated`, sem o predicado de pausa.
- O mapper administrativo recebeu somente a projeção/row/map de `excluido_em` necessária porque `EstabelecimentoAdmin` herda o campo obrigatório do contrato central; nenhum comportamento administrativo adicional foi alterado.

## Evidência TDD

- Baseline: o comando focado passou 55/55 testes antes das alterações.
- RED: `pnpm --filter @keepit/core-data test -- src/ports/store.port.test.ts src/mock/store.mock.test.ts src/supabase/store.supabase.test.ts` falhou com 8 falhas esperadas: cinco pela função de domínio ausente, uma pelo vazamento mock da loja excluída, uma pelo mapeamento Supabase ausente e uma pelo predicado de pausa ainda presente.
- A ausência de IDs proibidos usa duas asserções `not.toContain`; isso fortalece o `not arrayContaining` do brief, que não detectava o vazamento de apenas um dos dois IDs.
- GREEN: o mesmo comando passou 61/61 testes em 3 arquivos.

## Verificação

- `pnpm --filter @keepit/core-data test -- src/ports/store.port.test.ts src/mock/store.mock.test.ts src/supabase/store.supabase.test.ts` — 61/61 passaram.
- `pnpm --filter @keepit/core-data typecheck` — passou.
- `git diff --check` — passou.
- O Vitest emitiu apenas o aviso preexistente de depreciação da API CJS do Vite.

## Revisão de segurança

- As três policies públicas exigem loja pai `status = 'ativo'` e `excluido_em IS NULL`; produtos também continuam exigindo `ativo = true` e `excluido_em IS NULL`, e vínculos continuam exigindo hub `ativo = true`.
- `publico_ve_ativos` preserva literalmente `OR dono_user_id = (SELECT auth.uid())`; as policies separadas de dono/admin não foram removidas nem reescritas.
- Nenhuma RPC de pedido foi alterada. A versão mais recente de `criar_pedido` continua exigindo `status='ativo'`, `pausado_manualmente=false` e `excluido_em IS NULL` antes de criar um pedido.
- Nenhuma migration foi aplicada remotamente. Advisors/testes SQL contra banco ficam para a etapa controlada de aplicação; esta task produziu apenas a migration versionada e os testes focados de domínio/adapters solicitados.
