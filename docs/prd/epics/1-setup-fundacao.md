# Épico 1 — Fundação Backend & CI

> **Reorganização (2026-07-27):** este épico foi reduzido. As Stories de fundação de renderização e tela canário (1.1 monorepo, 1.2 tokens, 1.3 fontes, 1.6/1.7/1.8 boot dos apps) foram absorvidas pelo novo **[Épico 0 — Casca Visual](./0-casca-visual.md)**. O Épico 1 remanescente cuida do **backend real (Supabase) e do CI**. As Stories 1.1, 1.2 e 1.3 já estavam `Done` (QA gates em `docs/qa/gates/`) e continuam válidas como pré-requisito herdado — mantidas abaixo por rastreabilidade histórica, mas seu objetivo operacional agora vive no Épico 0.

## Expanded Goal

Estabelecer a **fundação de backend** do Keepit: projeto Supabase `keepit-dev` na nuvem, wrapper `supabase-client` tipado, migration canário provando conectividade, implementação Supabase das *ports* de `packages/core-data` (esqueleto a ser preenchido pelos épicos 2–9), e CI garantindo qualidade em cada PR. Ao final, o backend está vivo e pronto para começar a substituir os mocks do Épico 0 por dados reais.

Este épico não entrega valor direto ao usuário final, mas elimina o risco de descobrir problema de stack de backend no meio do desenvolvimento de features. Roda em paralelo ou logo após o Épico 0 — pode começar assim que a Story 0.2 (ports) existir.

## Prerequisites

- **[Épico 0](./0-casca-visual.md)**, Story 0.2 — as ports de `packages/core-data` precisam existir para que a implementação Supabase (Story 1.6, abaixo) tenha alvo.
- Herança já concluída: monorepo (ex-1.1), tokens (ex-1.2), fontes woff2 (ex-1.3) — ver Épico 0.

## Stories

> **Stories 1.1, 1.2, 1.3 — herança concluída (`Done`).** Objetivo operacional migrado para o Épico 0 (fundação de renderização). Mantidas aqui por rastreabilidade dos QA gates existentes. As Stories ativas deste épico são **1.4 (Supabase)**, **1.5 (CI)** e **1.6 (ports Supabase)**.

### Story 1.1 — Estrutura do monorepo

**As a** dev solo tocando o Keepit,
**I want** um monorepo pnpm + Turborepo com as pastas de apps e packages compartilhados,
**so that** eu tenha uma base única para código, tipos e tokens de design.

**Acceptance Criteria:**
1: O repositório contém `apps/cliente/`, `apps/lojista/`, `apps/admin/`, `apps/supabase/`, `packages/shared-types/`, `packages/supabase-client/`, `packages/ui-tokens/`.
2: `pnpm-workspace.yaml` define os workspaces.
3: `turbo.json` na raiz define pipelines `build`, `lint`, `typecheck`, `test`.
4: `pnpm install` completa sem erros.
5: `pnpm turbo run typecheck` roda em todos os projetos (mesmo que ainda vazios) e passa.

---

### Story 1.2 — Extrair tokens de design do protótipo

**As a** dev solo,
**I want** os tokens de design (cores, tipografia, spacing, radii, sombras) extraídos do `keepit-app/index.html` para `packages/ui-tokens/tokens.json`,
**so that** todos os 3 apps consumam a mesma fonte de verdade e a fidelidade visual seja garantida.

**Acceptance Criteria:**
1: `packages/ui-tokens/tokens.json` contém a paleta completa (dark: `#1B1E1C`, `#75DC8D`, `#1F9D57`, cinzas, etc.; light: fundos claros, verdes claros de badge; laranja alerta `#E0894A`).
2: Tokens de tipografia (`fontFamily: 'Hanken Grotesk'`, pesos 400/500/700/800, tamanhos 10-24px com line-height).
3: Tokens de spacing (múltiplos de 4px), radii (card, badge, modal — valores empíricos calibrados pelo protótipo; ver `docs/qa/design-decisions.md` para nota sobre `radii.card`), sombras (`0 6px 14px rgba(0,0,0,.2)` etc.).
4: Export do JSON em formato consumível por Expo (`ui-tokens/expo.ts`) e por Tailwind (`ui-tokens/tailwind.js`) para o admin Next.js.
5: Documentação curta no README do package explicando origem e como estender.

---

### Story 1.3 — Extrair fontes Hanken Grotesk do protótipo

**As a** dev solo,
**I want** as fontes Hanken Grotesk extraídas do `keepit-app/index.html` (base64) para arquivos `.woff2` reais em `packages/ui-tokens/fonts/`,
**so that** os apps mobile e o admin carreguem a fonte oficial sem depender de CDN.

**Acceptance Criteria:**
1: `packages/ui-tokens/fonts/` contém `.woff2` (e `.ttf` para Expo iOS) dos pesos Regular, Medium, Bold, Extrabold com nomes claros.
2: Script `packages/ui-tokens/scripts/extract-fonts.ts` documentado e reproduzível (para conferir a extração).
3: Exports em `expo.ts` prontos para uso com `useFonts` do Expo.
4: Exports em `tailwind.js` configuram `fontFamily.sans` como Hanken Grotesk.

---

### Story 1.4 — Projeto Supabase dev (cloud) + wrapper `supabase-client`

**As a** dev solo,
**I want** o projeto Supabase `keepit-dev` (cloud) linkado ao repo + package `supabase-client` com cliente tipado,
**so that** os 3 apps possam autenticar e consultar dados desde o começo, sem depender de Docker local.

**Nota de arquitetura (2026-07-03):** ambos os ambientes Supabase (dev e prod) rodam **na nuvem**. Sem `supabase start` local, sem Docker. Ver `docs/ARQUITETURA.md` seção 8.

**Acceptance Criteria:**
1: Projeto Supabase **cloud** `keepit-dev` criado em https://supabase.com/dashboard. URL, `anon key` e `service_role key` salvos no `.env` local (já gitignored). `.env.example` referencia os placeholders correspondentes (já feito na Story 1.1).
2: `apps/supabase/config.toml` inicializado via `supabase init` e linkado ao projeto remoto via `supabase link --project-ref <ref>`.
3: Migration inicial `apps/supabase/migrations/<timestamp>_init.sql` cria uma tabela `_canary (id serial primary key, message text)` com RLS ativada e uma policy pública de SELECT (`USING (true)`) só como prova de conexão.
4: Migration aplicada no `keepit-dev` via `supabase db push --project-ref <ref>` — sucesso confirmado.
5: `supabase gen types typescript --project-id <ref>` gera tipos e salva em `packages/shared-types/src/supabase.ts`; typecheck passa.
6: `packages/supabase-client/src/index.ts` exporta uma factory `createClient()` tipada, consumindo `SUPABASE_URL` e `SUPABASE_ANON_KEY` de env. Também exporta `createServiceRoleClient()` (para uso em Edge Functions/scripts server-side).
7: Um smoke test manual: rodar um script `pnpm --filter @keepit/supabase-client tsx scripts/canary-check.ts` (ou equivalente `.mjs`) que faz `SELECT * FROM _canary` e retorna `[]` ou a linha semeada. Comprova conectividade end-to-end.
8: `apps/supabase/README.md` documenta como aplicar migrations (`supabase db push`) e como rodar `gen types` quando o schema mudar.

---

### Story 1.5 — CI básico via GitHub Actions

**As a** dev solo,
**I want** um workflow GitHub Actions rodando lint + typecheck + test em cada pull request,
**so that** eu não empurre bug óbvio pra branch main.

**Acceptance Criteria:**
1: `.github/workflows/ci.yml` roda em `pull_request` para `main`.
2: Steps: setup pnpm, install, `turbo run lint typecheck test`.
3: ~~Passa em uma PR de teste (branch dummy).~~ 🔴 **BLOQUEADO — dispensado do MVP (2026-07-30, Caio).**
4: README do repositório documenta o requisito.

> **Status: `Done` com AC3 waived.** AC1, AC2 e AC4 estão entregues (`ci.yml` correto e ativo,
> README documentado). AC3 é impossível de validar: o GitHub **não cria nenhuma run** neste
> repositório mesmo público, com Actions habilitado e workflow `active` — bloqueio a nível de
> **conta** (`caiorodrigo10`), fora do alcance do time. Diagnóstico completo em
> `.claude/agent-memory/aiox-devops/project_ci_actions_not_running.md`.
>
> **Substituto acordado:** gate de qualidade **local e obrigatório** via `pnpm qa`
> (= `turbo run lint typecheck test`, exatamente o mesmo comando do `ci.yml`), rodado antes de
> cada commit. Quando as Actions destravarem, o `ci.yml` já cobre o mesmo comando — nada muda.
>
> **Dívida conhecida:** `lint` é `echo skipped` em todos os workspaces (não há ESLint
> configurado). O gate prova **tipos e testes**, não estilo.

---

### Story 1.6 — App Cliente Expo com tela canário

> **Migrada para o [Épico 0](./0-casca-visual.md) (Story 0.1).** O boot do app Cliente e a fidelidade visual passaram a ser responsabilidade do Épico 0. O AC de "leitura da tabela `_canary`" foi removido (no Épico 0 não há Supabase); a prova de conexão real com o Supabase é coberta pela Story 1.4 (smoke test) e o consumo real de dados começa no Épico 2. Texto original mantido abaixo por rastreabilidade.

**As a** dev solo,
**I want** o `apps/cliente` bootado com Expo e uma tela "Home vazia" aplicando tokens do `ui-tokens`,
**so that** eu prove que o app roda no simulador e a fidelidade visual funciona.

**Acceptance Criteria:**
1: `apps/cliente/` bootado com `expo` (SDK mais recente estável).
2: Fontes Hanken Grotesk carregadas via `useFonts`.
3: Tela inicial exibe: fundo `#F6F7F3`, título "keepit" em Hanken Grotesk Extrabold + bolinha verde após o "t" (SVG inline), texto "Bem-vindo" abaixo em Medium.
4: `expo start` funciona; app abre no simulador iOS e emulador Android.
5: Cliente Supabase importado de `packages/supabase-client` e faz uma leitura na tabela `_canary` (exibe a mensagem retornada — prova de conexão).

---

### Story 1.7 — App Lojista Expo com tela canário no tema dark

> **Migrada para o [Épico 0](./0-casca-visual.md) (Story 0.1).** Boot do app Lojista e fidelidade visual são do Épico 0. AC de leitura `_canary` removido. Texto original mantido por rastreabilidade.

**As a** dev solo,
**I want** o `apps/lojista` bootado com Expo e uma tela "Painel vazio" no tema dark oficial,
**so that** eu prove que a paleta dark do lojista funciona.

**Acceptance Criteria:**
1: `apps/lojista/` bootado com Expo, mesma versão do cliente.
2: Fontes Hanken Grotesk carregadas.
3: Tela inicial exibe: fundo `#1B1E1C`, título "Painel do lojista" em Hanken Grotesk Bold cor `#F6F7F3`, badge verde `#75DC8D` com texto "Recebendo pedidos agora" (mock estático).
4: Leitura na tabela `_canary` funciona.

---

### Story 1.8 — Admin Next.js + Vercel

> **Boot migrado para o [Épico 0](./0-casca-visual.md) (Story 0.1); deploy Vercel permanece aqui.** A criação do app admin (Next.js + Tailwind + tela de login placeholder) é do Épico 0. O que permanece no Épico 1 é o **deploy automático na Vercel** (AC 4 e 5 abaixo) — infra de publicação, não renderização. Texto original mantido por rastreabilidade.

**As a** dev solo,
**I want** o `apps/admin` bootado com Next.js (App Router), Tailwind configurado com tokens do `ui-tokens`, e deploy automático na Vercel,
**so that** eu já tenha URL de admin funcionando desde o começo.

**Acceptance Criteria:**
1: `apps/admin/` bootado com Next.js 14+ App Router.
2: Tailwind configurado consumindo `ui-tokens/tailwind.js`.
3: Página `/` exibe tela de login placeholder (formulário e-mail + senha, sem lógica ainda) usando paleta dark do lojista/admin.
4: Repositório conectado à Vercel; commit em `main` dispara deploy automático.
5: URL Vercel pública funciona.

---

### Story 1.9 — Implementação Supabase das ports de `core-data` (esqueleto)

**As a** dev solo,
**I want** o diretório `packages/core-data/src/supabase/` com o esqueleto da implementação Supabase das ports definidas no Épico 0,
**so that** os épicos 2–9 tenham um alvo claro para substituir mock por dado real, port por port.

**Acceptance Criteria:**
1: `packages/core-data/src/supabase/` contém um arquivo por port (auth, hub, store, product, order, wallet, admin) implementando a mesma interface definida na Story 0.2, usando o `supabase-client` tipado (Story 1.4).
2: No esqueleto, cada método pode lançar `NotImplementedError` ou retornar stub — o preenchimento real é responsabilidade dos épicos 2–9. O objetivo desta story é apenas o **contrato + wiring da factory**.
3: `createDataClient({ source: 'supabase' })` resolve para essa implementação; `source: 'mock'` continua resolvendo para o mock do Épico 0.
4: A flag de fonte (`DATA_SOURCE`) é lida de env; default documentado.
5: Typecheck passa; a troca de fonte não exige mudança em nenhuma tela.

---

## Definition of Done

- [ ] Stories ativas `Done`: **1.4 (Supabase dev + client)** ✅, **1.5 (CI)** ✅ *(AC3 waived)*, **1.8-deploy (Vercel)** ⬜, **1.9 (ports Supabase esqueleto)** ✅, **1.10 (reconciliação ports)** ✅. Stories 1.1/1.2/1.3 já `Done` (herança); 1.6/1.7/1.8-boot migradas ao Épico 0.
- [ ] Projeto Supabase `keepit-dev` na nuvem, migration canário aplicada, smoke test de conexão passando.
- [ ] `createDataClient({ source: 'supabase' })` resolve para o esqueleto de ports sem quebrar nenhuma tela do Épico 0.
- [x] ~~CI verde em PR de teste.~~ **Waived (2026-07-30)** — Actions bloqueado a nível de conta. Substituído por gate local obrigatório `pnpm qa` antes de cada commit (mesma cadeia do `ci.yml`). Ver Story 1.5.
- [ ] Deploy admin na Vercel funcionando.
