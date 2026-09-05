# Real and Mock Password Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a recuperação de senha segura no Supabase e demonstrável no mock, incluindo callbacks válidos, expirados e consumidos, troca persistente da credencial demo e reset previsível.

**Architecture:** `AuthPort.requestPasswordReset` devolve uma capacidade discriminada: envio real sem revelar existência da conta, ou callback mock sem segredo. O snapshot mock passa a guardar a solicitação e seu estado; o mesmo sanitizador de deep link consome callbacks reais e simulados. A UI escolhe a copy pelo resultado da port, nunca por variável de datasource.

**Tech Stack:** TypeScript 5.9, Vitest 1.2, React 19, React Native 0.86, React Navigation 7, Supabase JS 2.111 e AsyncStorage já instalados.

**Spec:** `docs/superpowers/specs/2026-09-04-estabilizacao-beta-android-cliente-design.md` (§§ 2, 4–6, 17, 21–23) e `docs/stories/12.12.story.md`

## Global Constraints

- E-mail existente e inexistente produzem a mesma confirmação no modo real; nenhum erro, log ou estado de navegação expõe token, URL bruta, senha ou existência da conta.
- A implementação deve reler primeiro o changelog e a documentação atuais do Supabase sobre [password recovery](https://supabase.com/docs/guides/auth/passwords) e confirmar as APIs instaladas em `@supabase/supabase-js@2.111.0`; não adicionar dependência nem inventar garantia do provedor.
- O modo real continua usando `resetPasswordForEmail`, callback autorizado, sessão de recovery e `updateUser({ password })`; sucesso encerra a sessão antes de voltar ao Login.
- Nova solicitação mock recebe ID opaco novo e invalida a anterior. No real, registrar e testar apenas a semântica observada/documentada do provedor.
- Callback mock nunca contém credencial ou token Supabase. Estados `requested`, `ready`, `expired` e `consumed` sobrevivem a restart para permitir demonstração reproduzível.
- Só um callback `ready` altera a senha; sucesso marca `consumed`. Senha anterior falha no próximo login, a nova funciona e reset restaura `keepit123`.
- No mock, a confirmação diz explicitamente “Modo demonstração” e “nenhum e-mail real foi enviado”; no real, não aparece CTA técnico.
- Preservar o callback canônico `com.keepithub.cliente://auth/reset`; não criar rota paralela, backend, template de e-mail ou segredo.
- Não gerar APK nem fazer verificação manual isolada. O fluxo mock completo e o e-mail/deep link em staging serão exercitados no único smoke Android da Story 12.14.

---

### Task 1: Persistir o ciclo de recuperação mock

**Files:**
- Modify: `packages/core-data/src/ports/auth.port.ts`
- Modify: `packages/core-data/src/mock/cliente-state.ts`
- Modify: `packages/core-data/src/mock/cliente-state.test.ts`
- Modify: `packages/core-data/src/mock/cliente-state-store.ts`
- Modify: `packages/core-data/src/mock/cliente-state-store.test.ts`
- Modify: `packages/core-data/src/mock/auth.mock.ts`
- Modify: `packages/core-data/src/mock/auth.mock.test.ts`

**Interfaces:**
- Produces: `PasswordResetRequestResult = { delivery: 'email' } | { delivery: 'demo'; callbackUrl: string }`.
- Produces: persisted `MockPasswordRecovery = { requestId: string; clienteId: string; state: 'requested' | 'ready' | 'expired' | 'consumed' } | null`.
- Changes: `AuthPort.requestPasswordReset(...): Promise<PasswordResetRequestResult>`.

- [ ] **Step 1: Escrever RED de solicitação, restart e replay**

Adicionar ao adapter mock:

```ts
const first = await port.requestPasswordReset('ana.souza@example.com', { delayMs: 0 });
expect(first).toMatchObject({ delivery: 'demo' });

await port.establishPasswordRecoverySession(first.delivery === 'demo' ? first.callbackUrl : '');
await port.updatePassword('nova-senha-segura');
await expect(port.updatePassword('replay')).rejects.toThrow(/consumid|sessão/i);
```

No state-store, persistir depois da solicitação, reabrir e consumir o mesmo callback; semear snapshots `expired`/`consumed` e provar que ambos rejeitam sem mudar credencial. Pedir de novo deve produzir `requestId` diferente e tornar a primeira URL inválida. Reset deve zerar recovery e restaurar a senha inicial.

- [ ] **Step 2: Executar RED**

Run: `pnpm --filter @keepit/core-data test -- src/mock/auth.mock.test.ts src/mock/cliente-state.test.ts src/mock/cliente-state-store.test.ts`

Expected: FAIL porque o resultado discriminado e o estado persistido ainda não existem.

- [ ] **Step 3: Migrar snapshot e implementar a máquina mínima**

Incrementar a versão do snapshot e migrar V2 adicionando `passwordRecovery: null`. `requestPasswordReset` substitui a solicitação anterior e persiste `requested`; e-mail desconhecido continua retornando o mesmo formato demo, mas seu callback rejeita genericamente. `establishPasswordRecoverySession` aceita somente rota/ID correspondentes e muda `requested → ready`; `updatePassword` aceita somente `ready`, grava a credencial, muda para `consumed` e persiste tudo antes de resolver.

Não guardar senha nova dentro de `passwordRecovery`; ela continua apenas em `accounts[].password`. O reset baseline mantém `passwordRecovery: null`.

- [ ] **Step 4: Validar persistência e commit**

Run: `pnpm --filter @keepit/core-data test -- src/mock/auth.mock.test.ts src/mock/cliente-state.test.ts src/mock/cliente-state-store.test.ts`

Run: `pnpm --filter @keepit/core-data typecheck`

Expected: PASS para válida, expirada, consumida, nova solicitação, login novo, restart e reset.

```bash
git add packages/core-data/src/ports/auth.port.ts packages/core-data/src/mock/cliente-state.ts packages/core-data/src/mock/cliente-state.test.ts packages/core-data/src/mock/cliente-state-store.ts packages/core-data/src/mock/cliente-state-store.test.ts packages/core-data/src/mock/auth.mock.ts packages/core-data/src/mock/auth.mock.test.ts
git commit -m "feat(core-data): persist mock password recovery"
```

### Task 2: Endurecer o adapter real e o callback único

**Files:**
- Modify: `packages/core-data/src/supabase/auth.supabase.ts`
- Modify: `packages/core-data/src/supabase/auth.supabase.test.ts`
- Modify: `apps/cliente/src/navigation/passwordRecoveryLinking.ts`
- Modify: `apps/cliente/src/navigation/passwordRecoveryLinking.test.ts`
- Modify: `apps/supabase/supabase/config.toml`

**Interfaces:**
- Supabase returns `{ delivery: 'email' }` only after `resetPasswordForEmail` resolves.
- `consumePasswordRecoveryUrl` continues returning only the safe route with `recovery=ready|invalid`; raw query/hash never escapes the adapter boundary.

- [ ] **Step 1: Completar RED da semântica real**

Manter os testes existentes e acrescentar: resultado `{ delivery: 'email' }`; erro do provider não gera confirmação; callback com erro/rota errada/sem sessão limpa o marcador; uma segunda troca sem nova sessão falha; `updateUser` bem-sucedido só conclui depois de `signOut` e limpeza do recovery state. Testar cold start e evento em app aberto com URL mock e real, sempre verificando que a saída não contém `access_token`, `refresh_token`, `code` ou `requestId`.

- [ ] **Step 2: Executar RED**

Run: `pnpm --filter @keepit/core-data test -- src/supabase/auth.supabase.test.ts && pnpm --filter @keepit/cliente test -- src/navigation/passwordRecoveryLinking.test.ts`

Expected: FAIL somente nas novas garantias/retorno; o fluxo-base da Story 2.7 continua verde.

- [ ] **Step 3: Ajustar retorno, limpeza e configuração rastreável**

Retornar `email` sem ecoar endereço. Em toda falha ao estabelecer callback, limpar a marca de recovery e qualquer sessão parcial antes de relançar erro genérico. Após senha atualizada, `signOut` e `passwordRecoveryState.clear` devem concluir antes do sucesso. Manter exatamente um redirect em `config.toml` e confirmar que a allow-list hospedada de staging contém a mesma URL; não registrar chaves ou tokens.

Para “nova solicitação invalida a anterior”, documentar em JSDoc/teste a capacidade efetivamente observada no Supabase atual. Se o provedor não garantir revogação imediata do link anterior, não simular uma garantia local nem afirmá-la na UI.

- [ ] **Step 4: Validar adapter/linking e commit**

Run: `pnpm --filter @keepit/core-data test -- src/supabase/auth.supabase.test.ts`

Run: `pnpm --filter @keepit/cliente test -- src/navigation/passwordRecoveryLinking.test.ts`

Expected: PASS para anti-enumeração, callbacks inválidos, replay local e encerramento da sessão.

```bash
git add packages/core-data/src/supabase/auth.supabase.ts packages/core-data/src/supabase/auth.supabase.test.ts apps/cliente/src/navigation/passwordRecoveryLinking.ts apps/cliente/src/navigation/passwordRecoveryLinking.test.ts apps/supabase/supabase/config.toml
git commit -m "fix(auth): harden password recovery callbacks"
```

### Task 3: Exibir confirmação honesta e abrir o callback demo

**Files:**
- Create: `apps/cliente/src/lib/passwordRecoveryPresentation.ts`
- Create: `apps/cliente/src/lib/passwordRecoveryPresentation.test.ts`
- Modify: `apps/cliente/src/screens/auth/EsqueciSenha.tsx`
- Modify: `apps/cliente/src/screens/auth/RecuperarSenha.tsx`

**Interfaces:**
- Produces: `resolvePasswordResetConfirmation(result)` with real neutral copy or demo copy/CTA.
- Consumes: the existing `consumePasswordRecoveryUrl` path; no datasource flag in either screen.

- [ ] **Step 1: Escrever RED da apresentação por capacidade**

```ts
expect(resolvePasswordResetConfirmation({ delivery: 'email' })).toMatchObject({
  showDemoAction: false,
});
expect(resolvePasswordResetConfirmation({ delivery: 'demo', callbackUrl: 'com.keepithub.cliente://auth/reset?request=mock-1' }))
  .toMatchObject({ showDemoAction: true, message: expect.stringMatching(/demonstração|nenhum e-mail real/i) });
```

Adicionar casos que nunca interpolam e-mail, callback ou erro técnico na mensagem.

- [ ] **Step 2: Executar RED**

Run: `pnpm --filter @keepit/cliente test -- src/lib/passwordRecoveryPresentation.test.ts`

Expected: FAIL porque o presenter ainda não existe.

- [ ] **Step 3: Integrar o CTA demo ao mesmo sanitizador**

`EsqueciSenha` guarda o resultado da port. Para `email`, mantém a confirmação neutra atual. Para `demo`, mostra “Modo demonstração — nenhum e-mail real foi enviado” e o botão “Abrir callback de demonstração”; o botão entrega a URL mock ao mesmo consumidor de linking e navega apenas com `recovery=ready|invalid`. `RecuperarSenha` mantém mensagens genéricas para expirado/consumido e, após sucesso, reseta para Login; nenhuma tela lê query/hash ou infere datasource.

- [ ] **Step 4: Executar gate final e commit**

Run: `pnpm --filter @keepit/core-data test -- src/mock/auth.mock.test.ts src/mock/cliente-state.test.ts src/mock/cliente-state-store.test.ts src/supabase/auth.supabase.test.ts`

Run: `pnpm --filter @keepit/cliente test -- src/navigation/passwordRecoveryLinking.test.ts src/lib/passwordRecoveryPresentation.test.ts`

Run: `pnpm --filter @keepit/core-data typecheck && pnpm --filter @keepit/cliente typecheck`

Expected: PASS para solicitação, callback, estados inválidos, redefinição, login e reset. Não gerar APK; o único smoke da Story 12.14 valida o CTA mock e o fluxo real em staging.

```bash
git add apps/cliente/src/lib/passwordRecoveryPresentation.ts apps/cliente/src/lib/passwordRecoveryPresentation.test.ts apps/cliente/src/screens/auth/EsqueciSenha.tsx apps/cliente/src/screens/auth/RecuperarSenha.tsx
git commit -m "feat(cliente): expose demonstrable password recovery"
```
