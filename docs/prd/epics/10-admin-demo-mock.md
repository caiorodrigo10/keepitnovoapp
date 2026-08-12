# Épico 10 — Admin: Login Mock e Dados de Demonstração

> **Contexto (2026-07-31):** o Painel Admin já tem todas as telas reais
> (aprovações, hubs, reembolsos, pedidos, clientes, lojistas, financeiro,
> qualidade lojista) consumindo o `AdminPort` sobre o mock (`DATA_SOURCE=mock`).
> Faltam duas coisas para ele ser **demonstrável ponta a ponta**: uma
> autenticação mock de verdade (hoje o login é um stub que só navega) e a
> garantia de que toda seção mostra dados representativos.
>
> **Numeração:** "Épico 10" (arquivo `10-admin-demo-mock.md`). Não confundir
> com as *decisões* `10.x` de `docs/PERGUNTAS_REGRAS_NEGOCIO.md` — namespaces
> diferentes.

## Expanded Goal

Tornar o Painel Admin utilizável numa demo sem atalhos manuais: o operador
**entra por uma tela de login que valida credencial mock**, navega o painel
protegido por um **guard efetivo**, consegue **sair (logout)**, e encontra
**dados de demonstração** em todas as seções. Tudo sobre mock — nenhuma
dependência de Supabase Auth ou backend real nesta fatia.

## Não-objetivos (deferidos — decisão do stakeholder)

- **Autenticação real de admin em produção** (Supabase Auth, papéis/roles,
  RLS, política de quem pode ser admin, recuperação de senha). É decisão de
  regra de negócio do stakeholder — registrar em
  `docs/PERGUNTAS_REGRAS_NEGOCIO.md` se/quando for priorizada. Esta fatia é
  **mock explícito** para desbloquear demo/desenvolvimento.
- Multi-admin, permissões granulares, auditoria de sessão.

## Data Mode

- Modo padrão: **mock**. A autenticação é um mock **local do app Admin**
  (decisão do Caio, 2026-07-31): vive em `apps/admin/src`, não altera
  `packages/core-data` nem os 8 ports existentes. Os **dados de negócio**
  (lojistas, reembolsos, etc.) continuam vindo do `AdminPort` sobre as fixtures
  de `@keepit/core-data`.
- Compatibilidade: `DATA_SOURCE=mock` preserva o comportamento atual dos apps
  Cliente e Lojista. Enriquecer fixtures é **aditivo** e não deve quebrar
  nenhum consumidor existente.

## Prerequisites

- Épico 0 (casca visual do Admin — Stories 0.12/0.13) concluído: telas, hooks,
  `authGuard.ts` stub e layout já existem.
- `@keepit/core-data` mock operante (as fixtures que alimentam o `AdminPort`).

## Stories

### Story 10.1 — Autenticação mock do Admin (login, sessão, guard, logout)

**As a** admin da Keepit,
**I want** entrar no painel por uma tela de login que valida uma credencial e
mantém minha sessão,
**so that** o painel só abra autenticado e eu possa sair quando quiser.

**Acceptance Criteria:**
1: Existe um mock de autenticação **local do app Admin** (`apps/admin/src`),
   sem tocar `packages/core-data`. Ele expõe: `signIn(email, senha)`,
   `signOut()`, `currentAdmin()` e uma forma de observar mudança de sessão
   (callback/subscribe), espelhando conceitualmente o `auth.mock.ts` do Cliente.
2: Há **admin(s) semeado(s)** no mock local, incluindo `admin@keepit.com.br`
   (nome exibível, ex.: "Admin Keepit"). `signIn` procura por e-mail e **ignora
   a senha** (mesmo padrão do mock do Cliente hoje). E-mail não cadastrado →
   erro observável na tela ("Admin não encontrado" / credencial inválida).
3: A tela `(auth)/login/page.tsx` usa esse mock: em sucesso, define a sessão e
   navega para `/aprovacoes`; em erro, renderiza mensagem de erro e **não**
   navega. Estado de envio (loading) no botão "Entrar".
4: O guard passa a ser **efetivo**: acessar qualquer rota de `(dashboard)` sem
   sessão redireciona para `/login`. Com sessão, o dashboard renderiza normal.
   Substitui o `authGuard.ts` stub (`AUTH_GUARD_ENABLED=false` que sempre
   deixava passar).
5: A sessão **persiste no navegador** (`sessionStorage`) e sobrevive a um
   refresh de página (F5) sem exigir novo login; enquanto restaura, não deve
   "piscar" o login indevidamente (estado inicial "carregando" curto).
6: A **sidebar** do `(dashboard)/layout.tsx` mostra o admin logado (nome/e-mail)
   e um botão **"Sair"** que chama `signOut()` e redireciona para `/login`.
7: `pnpm --filter @keepit/admin typecheck` limpo; sem novos erros de console
   relevantes (HMR/websocket via túnel e favicon 404 são aceitáveis).

---

### Story 10.2 — Dados de demonstração garantidos no Admin

**As a** admin,
**I want** encontrar dados representativos em todas as seções do painel,
**so that** a demonstração mostre o produto funcionando, não telas vazias.

**Acceptance Criteria:**
1: **Aprovações** (`pendingStores`, `status='em_analise'`): pelo menos **2**
   lojistas pendentes nas fixtures (hoje há só "Padoca Nova"). Adicionar
   1–2 estabelecimentos `em_analise` plausíveis.
2: **Lojistas**: a lista cobre a variedade de estados — `ativo`, `suspenso`
   (com `motivo_suspensao`) e `em_analise`. Já existe base; garantir que
   permanece após o item 1.
3: **Reembolsos**, **Pedidos**, **Clientes** (incluindo ao menos 1 bloqueado),
   **Qualidade Lojista** (falhas) e **Financeiro** (dashboard com números não
   nulos) exibem dados. Enriquecer fixtures **apenas onde estiver vazio/fino**.
4: As mudanças são **aditivas** e não quebram os apps Cliente/Lojista nem os
   testes existentes de `@keepit/core-data` (o Cliente filtra `ativo`, então
   novos `em_analise` não aparecem lá).
5: `pnpm --filter @keepit/core-data test` verde; `pnpm qa` sem regressões nos
   pacotes tocados.

## Executor Assignment

- executor: "@dev" (Sonnet)
- quality_gate: "@qa" (Opus) — **obrigatório** após cada story (CLAUDE.md).
- quality_gate_tools: ["pnpm qa", "typecheck admin", "typecheck/test core-data",
  "verificação manual no Admin rodando (túnel) — login inválido/válido, refresh,
  logout, seções populadas"]
