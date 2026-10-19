# Épico 0 — Casca Visual (UI-first)

> **Plano vigente (2026-07-31):** Stories 0.1–0.13 permanecem `DONE`. A
> correção de curso preserva integralmente esta interface. Ver
> [`../07-plano-mvp-piloto.md`](../07-plano-mvp-piloto.md).

## Expanded Goal

Construir **todas as telas dos três apps** (Cliente, Lojista, Admin) com **fidelidade visual 100% ao protótipo `keepit-app/index.html`**, populadas por **dados mock**, e navegáveis ponta-a-ponta. Ao final deste épico, `pnpm turbo run dev` levanta os três apps e é possível percorrer todo o produto — descoberta, pedido, PIN, carteira, aprovação de lojista, operação admin — sem nenhum backend real.

A jogada central que impede que "UI-first" vire retrabalho: **todas as telas consomem uma camada de dados assíncrona (Promises) desde o primeiro dia**, através de *ports* (interfaces por domínio) em `packages/core-data`. No Épico 0 a implementação é mock in-memory; nos épicos seguintes (a partir do Épico 1) a mesma port ganha implementação Supabase e a troca é por flag — sem reescrever tela.

Este épico não entrega backend, mas entrega **valor de validação imenso**: um produto navegável e visualmente fiel para revisar UX/fidelidade com o stakeholder cedo e barato, antes de escrever uma linha de lógica de servidor.

## Prerequisites

Herança do trabalho de fundação já concluído (originalmente Épico 1, Stories 1.1–1.3):

- ✅ **Monorepo** pnpm + Turborepo com `apps/{cliente,lojista,admin}` e `packages/{shared-types,supabase-client,ui-tokens}` (ex-Story 1.1, QA gate PASS).
- ✅ **Tokens de design** extraídos do protótipo em `packages/ui-tokens/tokens.json` (dark + light), com exports `expo.ts` e `tailwind.js` (ex-Story 1.2, QA gate PASS).
- 🟡 **Fontes Hanken Grotesk** em `.woff2` (ex-Story 1.3) — faltam os `.ttf` para Expo iOS, completados na Story 0.1.

## Escopo — o que ENTRA e o que NÃO entra

**ENTRA:**
- Boot real dos 3 apps (Expo Cliente, Expo Lojista, Next.js Admin) renderizando com tokens e fontes oficiais.
- Navegação/roteamento real entre todas as telas (react-navigation nos apps mobile; App Router no admin).
- Todas as telas do inventário (seção abaixo) com fidelidade visual ao protótipo.
- `packages/core-data`: ports por domínio + implementação **mock assíncrona** (Promise + latência configurável) com fixtures derivadas do protótipo.
- `packages/config`: módulo único com placeholders financeiros/operacionais (12%, R$ 200, R$ 40, R$ 20, 10 min, 5 tentativas, D+7).
- Estados de UI de primeira classe: **loading, vazio, erro** — exercitáveis via injeção de latência/erro no mock.

**NÃO entra** (fica para o Épico 1 e para os épicos 2–9):
- Projeto Supabase real, migrations, `gen types`, RLS.
- Auth real (Supabase Auth, sessão). No Épico 0, "login" apenas navega. *(Este item citava "SMS Zenvia" — o SMS saiu do MVP pela decisão 10.4, ver nota de reconciliação abaixo da Story 0.4.)*
- Integração Asaas, pagamento, tokenização, webhooks, carteira real.
- Regras de negócio com side-effect real (timeout via `pg_cron`, PIN gerado no servidor, matriz de cancelamento com efeitos, liberação D+7).
- Upload real de fotos (Storage) — imagem é placeholder/local no mock.
- Validação BrasilAPI de CNPJ, push notifications reais, CI (Épico 1).
- Compliance / submissão às lojas (Épico 9).

**Regra de ouro do recorte:** se a tela precisa *renderizar*, entra no Épico 0. Se precisa *persistir, autenticar, cobrar ou disparar side-effect real*, fica para depois.

## Arquitetura da fronteira mock/real

`packages/core-data` estrutura a troca futura mock→Supabase:

```
packages/core-data/
  src/
    ports/            # interfaces TS puras, um arquivo por domínio
      auth.port.ts        (signIn, signUp, currentUser…)
      hub.port.ts         (listNearby, getById…)
      store.port.ts       (listByHub, getCatalog, getState…)
      product.port.ts     (list, getById, create, update, pause…)
      order.port.ts       (create, listMine, accept, refuse, confirmPin, cancel…)
      wallet.port.ts      (getBalance, requestWithdrawal, statement…)
      admin.port.ts       (pendingStores, approve, reject, hubsCrud, refundQueue…)
    mock/
      fixtures/         # dados semeados do protótipo (Hub Centro, Farmácia Vida…)
      *.mock.ts         # implementações in-memory, ASSÍNCRONAS (Promise + latência fake)
    supabase/           # VAZIO no Épico 0 — preenchido a partir do Épico 1
    index.ts            # createDataClient({ source: 'mock' | 'supabase' })
```

- As telas consomem **só a port** via hook/provider (`useOrders()`, `useHubs()`), nunca a implementação direta.
- As ports **espelham o schema real** de `docs/architecture/03-data-models.md` (nomes de campos = colunas reais) para o mock não divergir.
- Trocar `DATA_SOURCE=mock` por `supabase` não toca em nenhum componente.
- Limite deliberado: **7 ports** (uma por domínio do PRD). Sem generic repository, sem CQRS — KISS.

## Referência visual — garantia de fidelidade (camada obrigatória)

O princípio nº1 (fidelidade 100% ao protótipo) é **verificável**, não aspiracional, através de três camadas:

1. **Tokens extraídos do HTML** (`packages/ui-tokens`) — cores, fontes, spacing, radii, sombras vêm do próprio `keepit-app/index.html`. Toda tela consome deles; **zero hex hardcoded** (o QA reprova quem violar).
2. **Capturas de referência por tela** em `docs/design-refs/` — cada tela do protótipo foi recortada individualmente (25 telas: 14 Cliente + 11 Lojista) e mapeada à sua Story em `docs/design-refs/INDEX.md`. **Toda Story de tela (0.4–0.13) deve citar a(s) imagem(ns) de referência correspondente(s)** como alvo do `@dev` e baseline do `@qa`.
3. **Gate visual do QA** — no gate de cada Story de tela, o `@qa` compara a tela construída contra a imagem de referência (diff via Playwright, disponível no ambiente) + confirma consumo exclusivo de tokens.

**Cobertura:** Cliente (boa), Lojista (parcial — falta Onboarding/Cadastro passo 2-3/"Em análise"/Login), Admin (**inexistente** — o protótipo não tem Admin; fidelidade das Stories 0.12/0.13 é ao design system dark, não pixel-a-pixel). Ver `docs/design-refs/INDEX.md`.

**⚠️ Conflitos protótipo × decisões abertas** (bloqueiam decisão, não implementação): (a) a tela de **escolha do ponto de retirada tem mapa** no protótipo, mas a Rodada 4 decidiu "sem mapa"; (b) **login social (Google/Apple)** aparece no protótipo, mas a Rodada 2 o colocou fora do MVP. Decisão do stakeholder pendente — ver `docs/design-refs/INDEX.md`.

## Stories

### Fundação

#### Story 0.1 — Fontes completas + boot dos 3 apps (casca)

**As a** dev solo,
**I want** os 3 apps bootados de verdade renderizando uma tela com tokens e fontes oficiais,
**so that** eu prove que a stack de renderização está viva antes de construir telas.

**Acceptance Criteria:**
1: Fontes Hanken Grotesk disponíveis em `.woff2` **e `.ttf`** (iOS) para os pesos Regular, Medium, SemiBold, Bold, Extrabold.
2: `apps/cliente` e `apps/lojista` bootados com Expo (SDK estável mais recente), fontes carregadas via `useFonts`, abrindo no simulador iOS e emulador Android.
3: `apps/admin` bootado com Next.js (App Router), Tailwind consumindo `ui-tokens/tailwind.js`, `@font-face` das fontes locais.
4: Cada app exibe uma Home mínima com a paleta correta (Cliente claro `#F6F7F3`, Lojista dark `#1B1E1C`, Admin dark) — prova de vida = render fiel, **sem** leitura a backend.
5: `pnpm turbo run dev` levanta os três.

---

#### Story 0.2 — `packages/core-data` (ports + mock) e `packages/config`

**As a** dev solo,
**I want** a fronteira mock/real estabelecida via ports assíncronas + o módulo de placeholders,
**so that** todas as telas consumam dados de forma trocável e nenhum valor de regra fique hard-coded.

**Acceptance Criteria:**
1: `packages/core-data/src/ports/` define interfaces por domínio (auth, hub, store, product, order, wallet, admin) alinhadas a `docs/architecture/03-data-models.md`.
2: Implementações mock **assíncronas** (Promise + latência configurável) em `packages/core-data/src/mock/`, com fixtures derivadas do protótipo.
3: Factory `createDataClient({ source })` com default `mock`; hooks/providers de consumo (`useOrders()`, `useHubs()`, etc.).
4: Suporte a injeção de estado por chamada: loading / vazio / erro (para as telas exercitarem os três estados).
5: `packages/config` exporta os placeholders financeiros/operacionais (12%, R$ 200, R$ 40, R$ 20, 10 min, 5 tentativas, D+7) num único módulo tipado; mocks e telas leem dele — nunca hard-coded.
6: Testes unitários dos mocks validando o contrato das ports.

---

#### Story 0.3 — Navegação/roteamento dos 3 apps

**As a** dev solo,
**I want** navegação real entre todas as telas mock,
**so that** o produto seja percorrível ponta-a-ponta desde cedo.

**Acceptance Criteria:**
1: Cliente e Lojista usam **react-navigation** — stack de auth → tab navigator → stacks internas, conforme a estrutura do protótipo.
2: Admin usa Next.js App Router com route groups (`(auth)`, `(dashboard)`) e layout persistente com sidebar.
3: Todos os fluxos ponta-a-ponta são navegáveis (telas ainda podem ser stubs nesta story).
4: Modais (CPF, PIN, permissão push) implementados como rotas modais.
5: Guardas de navegação (auth) são stubs que sempre deixam passar, alternáveis por flag para testar o fluxo deslogado.

---

### App Cliente (tema claro)

#### Story 0.4 — Cliente: Onboarding & Auth (visual)

**Objetivo:** telas de entrada do cliente, fiéis ao protótipo, navegando sem auth real.

**Acceptance Criteria:**
1: Telas: Onboarding "Como funciona" (3 telas), Criar conta, Confirmação SMS, Login, Esqueci a senha, Perfil, Configurações + Excluir conta, modal de permissão push.
2: Fidelidade visual verificada contra o protótipo (cores, spacing, tipografia, textos).
3: "Login"/"Criar conta" navegam para a Home sem autenticação real; campos renderizados sem submit real.
4: Nenhum valor de regra hard-coded; qualquer texto de taxa/prazo vem de `packages/config`.

> **Nota de reconciliação (2026-07-30) — decisão 10.4 (Rodada 6, 2026-07-29):** o MVP passou a autenticar o cliente só com **e-mail + senha**, **sem confirmação por SMS**. A tela **`ConfirmacaoSMS`**, construída aqui (AC1) e roteada na Story 0.3, **continua existindo no código mas fica fora do fluxo de navegação do MVP** (órfã).
> As Stories **0.3 e 0.4 permanecem `Done`** e **não são reabertas**: foram entregues corretamente conforme o escopo vigente à época, com gate de QA. Não há retrabalho a fazer no Épico 0 — a remoção da tela do fluxo é tratada como parte da implementação do Épico 2.
> Rastreabilidade do "porquê": **Épico 2, Story 2.5 (removida do MVP)** e **Story 2.4 (Edge Function Zenvia, removida)** em `docs/prd/epics/2-auth-cliente.md`. Se o SMS voltar em v2, a tela já existe e pode ser religada ao fluxo.

---

#### Story 0.5 — Cliente: Descoberta & Busca

**Objetivo:** navegação de hubs, lojas, catálogo e busca com dados mock.

**Acceptance Criteria:**
1: Telas: Home (hubs perto, favoritos, lojas por categoria, lojas perto do hub), tela do Hub, Loja + catálogo (estados Aberta/Fechada/Pausada), Detalhe do produto, Busca por produto, Busca por loja, placeholder de rating (★ visual).
2: Dados via `hub.port` / `store.port` / `product.port` mock (assíncronos).
3: Estados loading / vazio / erro exercitados e fiéis.
4: Fidelidade visual verificada contra o protótipo.

---

#### Story 0.6 — Cliente: Carrinho, Checkout & Pagamento

**Objetivo:** carrinho ao pagamento, com valores vindos do config, sem cobrança real.

**Acceptance Criteria:**
1: Telas: Carrinho, Checkout (resumo + taxas + total), Escolha do ponto de retirada (hub), modal CPF no 1º checkout, Pagamento (PIX + cartão salvo), Adicionar cartão.
2: Cálculo de total/taxas roda sobre placeholders de `packages/config`.
3: Nenhuma cobrança real; "pagar" apenas avança o fluxo mock.
4: Fidelidade visual verificada contra o protótipo.

---

#### Story 0.7 — Cliente: Pedido, PIN & Meus pedidos

**Objetivo:** acompanhamento do pedido, PIN e histórico, com transições de estado mockadas.

**Acceptance Criteria:**
1: Telas: Confirmar retirada / PIN, "Cheguei ao hub", Recibo / pedido concluído, Meus pedidos (em andamento / histórico), telas de exceção (cancelar, "lojista não veio").
2: Transições de estado do pedido (`Novo → … → Entregue` + ramos `Cancelado` / `Não retirado`) mockadas em memória via `order.port`.
3: Estados loading / vazio / erro fiéis.
4: Fidelidade visual verificada contra o protótipo.

---

### App Lojista (tema dark `#1B1E1C`)

#### Story 0.8 — Lojista: Onboarding, Cadastro & Auth (visual)

**Acceptance Criteria:**
1: Telas: Onboarding lojista, Cadastro passo 1 (dados básicos), passo 2 (operacionais: raio, tempo médio), passo 3 (recebimento + fachada + horários), "Em análise", Login, Perfil público (editar), Configurações + Excluir conta.
2: Tema dark fiel ao protótipo.
3: Sem validação de CNPJ real; campos renderizados, submit apenas navega.
4: Fidelidade visual verificada contra o protótipo.

---

#### Story 0.9 — Lojista: Catálogo & Disponibilidade

**Acceptance Criteria:**
1: Telas: Gerenciar catálogo (lista), Cadastrar produto (upload de foto mock/local), Editar produto, Pausar/excluir produto, Horários & disponibilidade, toggle "Pausar novos pedidos" / "Recebendo pedidos agora".
2: CRUD contra `product.port` mock (persistência em memória durante a sessão).
3: Fidelidade visual verificada contra o protótipo.

---

#### Story 0.10 — Lojista: Pedidos & PIN

**Acceptance Criteria:**
1: Telas: Novos pedidos, Aceitar pedido (com tempo estimado pré-preenchido do config), Recusar pedido (motivo obrigatório), Detalhe / separar, "Saindo pro hub", "Cheguei ao hub", Digitar PIN (tela + teclado), Confirmar retirada, Concluídos (histórico), "Cliente não apareceu".
2: Máquina de estados do pedido mockada via `order.port`, refletindo na UI (card muda de estado).
3: Fidelidade visual verificada contra o protótipo.

---

#### Story 0.11 — Lojista: Financeiro (Dashboard, Carteira, Extrato)

**Acceptance Criteria:**
1: Telas: Dashboard (saldo, vendas 7/30/90/1a, ticket médio, top produtos), Carteira, Solicitar saque (mínimo de `packages/config`), Extrato financeiro, Formas de recebimento.
2: Dados via `wallet.port` mock; valores/prazos vêm do config.
3: Sem Asaas; "solicitar saque" apenas avança o fluxo mock.
4: Fidelidade visual verificada contra o protótipo.

---

### App Admin (web, tema dark)

#### Story 0.12 — Admin: Aprovações & Hubs

**Acceptance Criteria:**
1: Telas: Login (navega), Lojistas pendentes, Aprovar / Rejeitar lojista (motivo), CRUD de hubs (nome, endereço, horário).
2: Dados via `admin.port` mock.
3: Fidelidade visual verificada contra o protótipo.

---

#### Story 0.13 — Admin: Operação & Financeiro

**Acceptance Criteria:**
1: Telas: Fila de reembolsos, Executar reembolso, Lista de pedidos (filtros), Detalhe + forçar cancelamento, Lista de clientes + bloquear, Suspender lojista, Dashboard financeiro geral, Vista de qualidade do lojista.
2: Dados via `admin.port` / `order.port` mock.
3: Fidelidade visual verificada contra o protótipo.

---

## Definition of Done

Status em 2026-07-28 (orquestração completa: @sm → @po → @dev → @qa em todas as 13 stories).

- [x] **Todas as 13 stories `Done`** (0.1–0.13), cada uma com fluxo @dev → @qa. Gates: todos PASS/CONCERNS (nenhum FAIL pendente). QA verificou fidelidade contra `docs/design-refs/` e correção da fronteira mock de forma independente (typecheck, grep de hex, comparação com as imagens de referência).
- [x] **`pnpm turbo run typecheck` = 9/9** após `pnpm install` limpo (workspace reconciliado, sem symlinks manuais). **Admin** (`next dev`) sobe ao vivo (Ready ~400ms, páginas com dados mock reais screenshot via Playwright pelo QA). **Cliente/Lojista** (Expo) compilam e o Metro sobe quando a porta está livre. ⚠️ *Boot em simulador iOS/emulador Android real fica deferido (REQ-002) — sem device no sandbox; ver `docs/EPICO_0_RECONCILIACAO.md`.*
- [x] **Telas do inventário construídas** com fidelidade ao design system e às referências de `docs/design-refs/` (25 telas capturadas do protótipo). Onboarding do Cliente corrigido para dark (fidelidade). ⚠️ *Conferência visual pixel-a-pixel em device é o item deferido REQ-002.*
- [x] **Navegação ponta-a-ponta** nos três apps (react-navigation mobile + App Router admin; cobertura de rotas validada pelo QA da 0.3 contra o inventário 0.4–0.13).
- [x] **Todo dado vem de `packages/core-data` (mock)**; nenhum valor financeiro/operacional hard-coded (verificado por grep nos gates) — valores em `packages/config`. ⚠️ *Percentuais de reembolso ainda em `cancelamentoPolicy.ts` a migrar para o config — ver reconciliação.*
- [x] **Estados loading / vazio / erro** exercitáveis via injeção do mock (`AsyncCallOptions` / `DevStateToggle`).

**Débitos pré-Épico-1 (não bloqueiam o Épico 0):** consolidados em `docs/EPICO_0_RECONCILIACAO.md` — principalmente estender as ports de `core-data` (admin-ops, order lado-lojista/cliente, product delete/ativo, store write, analytics) que hoje vivem como adaptadores locais nos apps, migrar percentuais de reembolso para o config, e as pendências de stakeholder em `PERGUNTAS_REGRAS_NEGOCIO.md` seção 10 — hoje **mapa (10.1)** e **login social (10.2)** seguem abertas; o **modelo de auth (10.4)** foi **resolvido** na Rodada 6 (e-mail + senha, sem SMS), deixando a tela `ConfirmacaoSMS` órfã (ver nota na Story 0.4) e abrindo a nova pendência **10.5** (confirmação de e-mail obrigatória?).

## Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Telas síncronas → reescrita ao plugar backend | Alto | Ports assíncronas (Promise) desde a Story 0.2; telas nascem com loading/erro. |
| Mock diverge do schema real | Alto | Ports espelham `03-data-models.md`; nomes de campos = colunas reais. |
| Loading/erro só aparecem "de verdade" com backend | Médio | Injeção de latência/erro no mock; telas de erro/vazio construídas já no Épico 0. |
| Fidelidade de componentes interativos (teclado PIN, toggles, steppers, tabs de período) | Médio | Tratados como itens de AC explícitos; validados célula-a-célula contra o `index.html`. |
| Regras financeiras 🔴 ainda abertas (valores exatos) | Baixo | Placeholders em `packages/config`; quando o stakeholder decidir, muda-se um arquivo. |
| Over-abstração da camada de dados | Baixo | Limite de 7 ports; sem generic repository/CQRS; KISS reforçado no QA. |

## Relação com os demais épicos

O Épico 0 é o novo nó-raiz. Os épicos 2–9 passam a depender de **"tela já existe (Épico 0)"** + **"fundação backend (Épico 1)"**. Cada story dos épicos 2–9 muda o *verbo* de "construir tela + lógica" para **"plugar backend real na tela existente"** (substituir a implementação mock da port pela Supabase, ligar auth/pagamento/RLS, validar que a tela agora usa dado real). Ver `docs/prd/05-epics.md`.
