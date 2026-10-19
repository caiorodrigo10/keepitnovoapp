# Modo Demo — App de Parceiros (Lojista): Análise de Prontidão

> **Data:** 2026-08-19 · **Autor:** Análise técnica (gap analysis) · **Base:** worktree `feat/modo-demo-mock` (`/root/projetos/keepitnovoapp/.worktrees/block-13-demo`)
> **Referência de "completo":** app do **Cliente**, cujo modo demo já foi buildado e enviado ao TestFlight iOS com sucesso.

## Resumo executivo

O app do Lojista está **~65% pronto** para uma demo mock igual à do Cliente. **Toda a infraestrutura existe e funciona**: a flag de build (`EXPO_PUBLIC_DATA_SOURCE`), os perfis EAS (`demo`/`demo-apk`/`production`), e — o mais importante — **todas as telas da área logada** (Pedidos, Catálogo, Financeiro, Perfil) consomem dados mock ricos e funcionariam de ponta a ponta. **Porém há um bloqueador único e decisivo**: no modo mock **não existe caminho para entrar na área logada** (as 4 abas principais). O login exige uma conta que não vem semeada, e mesmo se o dono se cadastrar pelo app, o estabelecimento nasce "em análise" — nunca "ativo" — então ele só vê onboarding + cadastro + tela "em análise", e **nunca chega no app de verdade** (gerenciar loja, pedidos, carteira). Some-se a isso um segundo bloqueador operacional: o app Lojista **não tem as credenciais de assinatura iOS** que o Cliente já tem. Fechados esses dois pontos, a prontidão sobe para ~90%.

Em uma frase para não-técnicos: **o app do parceiro está construído e os dados de demonstração são bons, mas hoje a "porta de entrada" do app está trancada no modo demo — o dono consegue ver a tela de cadastro, mas não consegue entrar na loja para ver pedidos, produtos e dinheiro.**

---

## ✅ O que já existe

### Configuração de build (paridade quase total com o Cliente)

| Item | Lojista | Cliente | Status |
|------|---------|---------|--------|
| Perfis EAS `demo` / `demo-apk` / `production` | Presentes, idênticos em estrutura | Idem | ✅ Pronto — `apps/lojista/eas.json` |
| Flag `EXPO_PUBLIC_DATA_SOURCE` (mock/supabase) | `demo`=mock, `production`=supabase | Idem | ✅ Pronto |
| `dataClientBootstrap.ts` lendo a flag | Sim, simétrico ao Cliente (sem `passwordRecoveryState`) | Sim | ✅ Pronto — `apps/lojista/src/lib/dataClientBootstrap.ts` |
| `dataSource.ts` (`isSupabaseDataSource()`) | Sim | Sim | ✅ Pronto — `apps/lojista/src/lib/dataSource.ts` |
| `App.tsx` importa o bootstrap como 1º import | Sim | Sim | ✅ Pronto — `apps/lojista/App.tsx` |
| `submit.demo` com ASC App ID | `6796881536` | `6796881085` | ✅ App record existe |
| Ícones/splash/adaptive icon (iOS+Android) | Presentes | Presentes | ⚠️ Presentes, mas **clone do Cliente** (ver gaps) |
| bundle id / package | `com.keepithub.lojista` | `com.keepithub.cliente` | ✅ Distinto e correto |
| `buildNumber`/`versionCode` | `1` / `1` | `2` / `4` | ✅ OK (`autoIncrement: true` cuida) |

### Cobertura de mock por fluxo (área logada — MainTabs)

Todas as telas da área logada usam, em modo mock, o id de estabelecimento **fixo** `estab-farmacia-vida` (`apps/lojista/src/screens/catalogo/currentStore.ts` → `CURRENT_ESTABELECIMENTO_ID`) e consomem as ports de `@keepit/core-data`, todas com implementação mock e fixtures ricas.

| Fluxo | Port + mock cobre? | Fixture realista? | Evidência |
|-------|--------------------|--------------------|-----------|
| Onboarding (3 telas) | n/a (UI pura) | — | ✅ `screens/auth/OnboardingLojista1/2/3.tsx` |
| Cadastro 3 passos + validação CNPJ | `lojistaAuth.signUp` + `estabelecimentoCadastro.criarCadastro` | Cria conta na sessão | ✅ `lojista-auth.mock.ts`, `estabelecimento-cadastro.mock.ts`, `lib/cnpj.ts` |
| Estados de conta (Em análise / Rejeitado / Conta indisponível) | roteados por `getMeuEstabelecimento` | — | ✅ `screens/auth/EmAnalise.tsx`, `CadastroRejeitado.tsx`, `ContaIndisponivel.tsx` |
| Gerenciar catálogo (listar) | `product.list` | 15+ produtos c/ foto | ✅ `product.mock.ts`, `ProductCatalogContext.tsx` |
| Cadastrar / editar / pausar / excluir produto | `product.create/update/delete` (`toggleAtivo` via `update`) | ✅ | ✅ `product.mock.ts` (linhas 43/65/89), `CadastrarProduto.tsx`, `EditarProduto.tsx` |
| Upload de foto do produto | `product.uploadFoto` (habilitado só em mock) | path fake honesto | ✅ `lib/produtoFoto.ts`, `ProductForm.tsx` |
| Horários de disponibilidade | `store.getById` (leitura) | 7 dias, horário amplo | ✅ `LojaDisponibilidadeContext.tsx`, `HorariosDisponibilidade.tsx` |
| Pausar novos pedidos / retomar | `store.setPausadoManualmente` | ✅ | ✅ `LojaDisponibilidadeContext.tsx` (linhas 68/86) |
| Perfil público / configurações | `estabelecimentoCadastro.getMeuPerfil/atualizarMeuPerfil` **ou** `LojaPerfilContext` local | ✅ | ✅ `screens/perfil/PerfilPublico.tsx`, `Configuracoes.tsx` |
| Excluir conta | UI + fluxo local | — | ✅ `screens/perfil/ExcluirConta.tsx` |
| **Pedidos** — receber / recusar (c/ motivo) / separar / pronto | `order.accept/refuse/markReadyForHub` | 21 pedidos p/ a loja, esteira completa | ✅ `order.mock.ts`, `OrdersContext.tsx`, `NovosPedidos.tsx`, `AceitarPedido.tsx`, `RecusarPedido.tsx`, `DetalheSepararPedido.tsx` |
| **Retirada com PIN** | `order.confirmPin` (c/ bloqueio/tentativas) | pins semeados | ✅ `order.mock.ts` (linha 198), `DigitarPin.tsx`, `ConfirmarRetirada.tsx` |
| Cliente não apareceu | `order.markCustomerNoShow` | ✅ | ✅ `order.mock.ts` (linha 331), `ClienteNaoApareceu.tsx` |
| Carteira / saldo / extrato / saque | `wallet.getBalance/statement/requestWithdrawal` + `analytics` | saldo + 2 saques semeados | ✅ `FinanceiroContext.tsx`, `wallet.mock.ts`, `analytics.mock.ts`, `Dashboard.tsx`, `Vendas.tsx`, `ExtratoFinanceiro.tsx`, `SolicitarSaque.tsx` |

### Dataset / fixtures (enriquecido no commit `fc4fc8a`)

Todas as fixtures da loja de demo (`estab-farmacia-vida`) foram semeadas de forma rica e realista:

- **Estabelecimentos** (`fixtures/estabelecimentos.ts`): 10 lojas ativas (8 com horário `00:00–23:59` → sempre "Aberta") + 1 Pausada + 1 Fechada + suspenso + 3 "em análise" (para o Admin). Cobre os 3 estados do protótipo.
- **Pedidos** (`fixtures/pedidos.ts`): **21 pedidos** para `estab-farmacia-vida`, cobrindo a esteira completa (`aguardando_aceite`, `aceito`, `em_preparo`, `saindo_hub`, `no_hub`, `entregue`, `recusado`, `nao_retirado`, `cancelado`, `cancelado_admin`). PINs fixos (ex.: `4567` no pedido `no_hub`).
- **Produtos** (`fixtures/produtos.ts`): 15+ produtos com foto (Unsplash) e preço.
- **Carteira** (`fixtures/saques.ts`): saldo positivo + 1 saque `solicitado` + 1 `concluido` → extrato não abre vazio.
- **Hubs** (`fixtures/hubs.ts`): horário amplo, evita "hub fechado" no demo noturno.

### Sessão / navegação

- A raiz (`RootNavigator.tsx`) alterna `Auth` ↔ `Main` observando a **sessão mock local** `lojistaSession.ts` (`onLojistaSessionChange`) — reativa, sem backend. Funciona.
- O `authGuard.ts` é um stub desativado (`AUTH_GUARD_ENABLED = false`) — não bloqueia nada.

---

## ⚠️ O que falta / gaps

| # | Item | Severidade | O que fazer | Arquivo(s) alvo |
|---|------|------------|-------------|-----------------|
| 1 | **Sem caminho para a área logada (MainTabs) no modo demo.** `signInLojista()` — único gatilho de `Main` — só é chamado no `Login.tsx` quando o status lido é `'ativo'`. Em mock, `db.lojistaContas = []` e `db.estabelecimentosCadastrados = []` (nascem vazios, "piloto sempre começa vazio"). Login de e-mail não cadastrado falha; e um cadastro feito no app nasce `'em_analise'` → tela "Em análise", nunca `'ativo'`. **O dono nunca vê Pedidos/Catálogo/Financeiro/Perfil.** | 🔴 **Bloqueador** | Semear, **apenas no modo demo/mock**, 1 conta de lojista conhecida (ex.: `lojista@keepit.com.br`) + 1 registro em `estabelecimentosCadastrados` com `status: 'ativo'` e `donoUserId` = id da conta. Assim: login com esse e-mail (senha qualquer) → `getMeuEstabelecimento` devolve `'ativo'` → `signInLojista()` → MainTabs (que já usa `estab-farmacia-vida`, cheio de dados). Alternativa mais simples: um atalho "entrar em modo demo" que chama `signInLojista()` direto. | `packages/core-data/src/mock/db.ts` (`createMockDb`), possivelmente uma fixture nova `fixtures/lojista-contas.ts`; `apps/lojista/src/screens/auth/Login.tsx` |
| 2 | **Credenciais de assinatura iOS ausentes.** `apps/lojista/` **não tem** `credentials/` (o Cliente tem `AuthKey.p8` + `dist.p12` + `profile.mobileprovision`, criados hoje). O `eas.json` do Lojista referencia `credentials/AuthKey.p8` (submit) e usa `credentialsSource: local` (build iOS). Sem isso, `eas build`/`eas submit --platform ios` do Lojista falha. `credentials/` é gitignored — precisa ser provisionado localmente, como foi feito no Cliente. | 🔴 **Bloqueador** (para shippar iOS) | Provisionar assinatura para `com.keepithub.lojista`: colocar `AuthKey.p8` (mesma chave ASC, reusável) em `apps/lojista/credentials/`, e gerar `dist.p12` + `profile.mobileprovision` do bundle id do Lojista (via EAS). | `apps/lojista/credentials/` (a criar), `apps/lojista/eas.json` |
| 3 | **PIN de retirada não é descobrível na demo.** `DigitarPin.tsx` diz "peça o código ao cliente", mas na demo o dono só tem o app do Lojista — não sabe qual PIN digitar. Os pins estão nas fixtures (ex.: `4567` no pedido `no_hub`), mas não aparecem na UI. | 🟡 Médio | Para a demo brilhar de ponta a ponta no fluxo de retirada: documentar os PINs válidos para quem apresenta, ou (se aceitável) exibir uma dica só em modo mock. Não é código de negócio. | `packages/core-data/src/mock/fixtures/pedidos.ts`, `apps/lojista/src/screens/pedidos/DigitarPin.tsx` |
| 4 | **Ícone/splash são cópia byte-a-byte do Cliente.** `apps/lojista/assets/icon.png` (393.493 bytes) é idêntico ao do Cliente. O app é "Keepit Lojista" (tema dark) mas usa o ícone do Cliente — testers não distinguem os dois apps na home. | 🟢 Baixo | Gerar um ícone/splash distinto do Lojista (variante dark) antes da submissão à loja. | `apps/lojista/assets/*` |
| 5 | **1 PIN de fixture usa `Math.random()`.** O 1º pedido de fixture gera `pin_texto` aleatório (`fixtures/pedidos.ts` linha 40) — não-determinístico entre boots. Só afeta se esse pedido específico chegar à etapa de PIN. | 🟢 Baixo | Fixar o PIN se esse pedido for usado na demo de retirada. | `packages/core-data/src/mock/fixtures/pedidos.ts` |

> **Nota importante sobre o gap #1:** as telas da área logada **não têm problema de mock** — elas leem `estab-farmacia-vida` de `db.estabelecimentos` (StorePort, domínio de descoberta), que tem status `'ativo'` e dados ricos. O bug de entrada está num **array diferente**: o Login lê `db.estabelecimentosCadastrados` (EstabelecimentoCadastroPort, domínio do wizard do lojista), que está vazio. São dois domínios separados por decisão de arquitetura — por isso a loja "existe e está ativa" para o Cliente, mas "não existe" para o gate de login do Lojista. Semear o segundo array resolve.

---

## 🔧 Divergências vs app Cliente (que já funciona)

| Aspecto | Cliente (funciona) | Lojista | Impacto |
|---------|--------------------|---------|---------|
| **Credenciais de login mock** | `clientesCredenciaisFixture` **semeado** (`cliente-ana` / `ana.souza@example.com`) → login demo funciona de imediato | `db.lojistaContas = []` — **nada semeado** | 🔴 Login demo do Lojista não tem conta contra a qual autenticar |
| **Acesso à área principal** | Marketplace navegável; login leva direto ao app; correção `REL-008` (commit `6710360`) garantiu que cadastro/login entram | Área logada só abre em `status === 'ativo'`, que o mock nunca produz | 🔴 Sem entrada na área logada |
| **Credenciais iOS locais** | `apps/cliente/credentials/` presente (provisionado hoje) | Ausente | 🔴 Build/submit iOS bloqueado |
| **Ícone/splash** | Próprio (light) | **Reusa o do Cliente** | 🟢 Cosmético |
| **Plugin `expo-location`** | Presente (hub mais próximo) | Ausente | ✅ OK — Lojista não usa geolocalização |
| **Foco dos commits de demo** | `fix(cliente)` REL-008, PIX, seleção de hub, etc. | Nenhum commit de demo endereçou a entrada do Lojista | Explica o gap #1 |

---

## 📋 Plano sugerido (levar o demo do Lojista ao nível do Cliente)

1. **[Bloqueador] Destrancar a entrada da área logada.** Semear, só em mock, uma conta de lojista + estabelecimento `'ativo'` em `createMockDb()` (`packages/core-data/src/mock/db.ts`), espelhando o padrão de `clientesCredenciaisFixture`. Garantir `conta.id === cadastro.donoUserId` para `getMeuEstabelecimento` devolver `'ativo'`. Documentar o e-mail de demo (ex.: `lojista@keepit.com.br`, senha qualquer). Rodar `@dev` → `@qa`.
2. **[Bloqueador] Provisionar credenciais iOS do Lojista.** Colocar `AuthKey.p8` em `apps/lojista/credentials/` e gerar `dist.p12` + `profile.mobileprovision` para `com.keepithub.lojista` (mesmo processo já feito no Cliente). *(operação @devops)*
3. **[Polish] PINs de retirada** — fixar o PIN aleatório e documentar a lista de PINs válidos para quem apresenta a demo (gaps #3/#5).
4. **[Polish] Ícone/splash próprios do Lojista** (gap #4) — antes da submissão pública; não bloqueia TestFlight interno.
5. **Verificar o dataset ligado ao `estab-farmacia-vida`** após o passo 1 (as 4 abas devem abrir cheias: 21 pedidos na esteira, produtos, saldo/extrato, horários).
6. **Build + submit** (após passos 1 e 2):
   - iOS TestFlight: `cd apps/lojista && eas build --profile demo --platform ios && eas submit --profile demo --platform ios`
   - Android APK direto (sem conta Play): `eas build --profile demo-apk --platform android`
   - Android Play Internal (quando a conta US$25 — PUB-01 — existir): `eas build/submit --profile demo --platform android`
7. **Adicionar os donos como testers** no App Store Connect (Internal Testing = sem revisão).

**Esforço estimado:** passo 1 ≈ meio dia (@dev + @qa, só fixture/seed mock — sem lógica de negócio nova); passo 2 ≈ operação de credenciais @devops; passos 3–4 são polish. Fechados 1 e 2, o demo do Lojista fica equivalente ao do Cliente.
