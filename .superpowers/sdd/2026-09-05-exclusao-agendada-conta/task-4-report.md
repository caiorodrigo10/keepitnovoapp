# Task 4 report — navegação restrita, app e página pública

Status: **DONE**

## Entrega

- Criado o resolver puro `resolveAccountRoute`: sem sessão abre `Auth`; sessão
  com consulta pendente/falha ou solicitação não cancelada abre somente
  `ScheduledDeletion`; apenas ausência/cancelamento confirmado libera `Main`.
- O `RootNavigator` invalida respostas antigas quando a sessão muda, consulta
  a port antes de montar conteúdo autenticado e evita repetir a consulta nos
  eventos de refresh da mesma sessão.
- O app exige confirmação explícita e senha atual, agenda pela port e só chama
  sign-out depois da persistência. Uma falha posterior de saída mantém a tela
  local bloqueada, com prazo e retry, sem voltar ao conteúdo principal.
- O login de uma conta agendada mostra prazo, “Recuperar minha conta” e “Sair”.
  Cancelamento no limite que não seja confirmado pela port mantém a restrição.
- O Painel QA avança o relógio mock em oito dias usando
  `DemoScenarioPort.advanceClock`, permitindo demonstrar a conclusão mock já
  definida na Task 3.
- Criada a página pública mínima `/conta/exclusao`: identifica por e-mail/senha,
  consulta, agenda com nova confirmação de senha ou cancela pela mesma port e
  encerra a sessão após a ação persistida. Falha de sign-out bloqueia nova ação
  até o retry. Não há service key, contato inventado ou promessa de finalização
  real; o texto informa que o canal de suporte ainda não está disponível.

## TDD e validações

- RED do resolver: stub inicial produziu 8 falhas de autorização e 1 passe.
- RED da ordem transacional: stub da orquestração produziu 1 falha e 10 passes
  porque o sign-out ainda não ocorria após a persistência.
- `pnpm --filter @keepit/cliente test -- src/lib/accountDeletionRoute.test.ts`:
  PASS — 1 arquivo / 11 testes.
- `pnpm --filter @keepit/cliente typecheck`: PASS.
- `pnpm --filter @keepit/admin typecheck`: PASS.
- `pnpm --filter @keepit/core-data typecheck`: PASS.
- `pnpm --filter @keepit/supabase typecheck`: PASS.
- `git diff --check`: PASS.
- Por decisão de escopo MVP, não foram adicionados renderer/dependências nem
  gerado APK; a prova visual fica para o smoke final do plano.

## Arquivos da Task 4

- `apps/cliente/src/lib/accountDeletionRoute.ts`
- `apps/cliente/src/lib/accountDeletionRoute.test.ts`
- `apps/cliente/src/screens/auth/ExclusaoAgendada.tsx`
- `apps/cliente/src/screens/perfil/ExcluirConta.tsx`
- `apps/cliente/src/screens/perfil/PainelQA.tsx`
- `apps/cliente/src/navigation/RootNavigator.tsx`
- `apps/cliente/src/navigation/types.ts`
- `apps/admin/app/conta/exclusao/page.tsx`
- `apps/admin/src/components/AccountDeletionPublicFlow.tsx`

## Residual deliberado

O datasource real continua limitado a status/agendamento/cancelamento pela Edge
Function autenticada. Processamento destrutivo, cron e política de retenção não
foram implementados. O fluxo público declara suporte indisponível até existir
um canal aprovado.
