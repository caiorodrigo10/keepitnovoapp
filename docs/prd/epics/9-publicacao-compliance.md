# Épico 9 — Publicação & Compliance

> **Plano vigente (2026-07-31):** publicação e compliance continuam `CORE`;
> não são removidos pela simplificação do backend. Ver
> [`../07-plano-mvp-piloto.md`](../07-plano-mvp-piloto.md).

## Expanded Goal

Preparar o Keepit para produção pública: textos legais (Termos, Política), ícones e splash screens, metadata das lojas (descrição, screenshots, categoria), teste end-to-end, migração do Supabase dev → produção, troca do Asaas sandbox → produção após aprovação comercial, e submissão inicial à App Store + Play Store.

Este é o épico do **"empurrar pra loja"**. Depende de todos os anteriores.

> **Duas fases neste épico:**
> - **Fase 0 — Piloto TestFlight iOS (mock)** — antecipada, roda ANTES dos
>   Épicos 1–8 estarem prontos. Coloca Cliente e Lojista nos iPhones do(s)
>   stakeholder(s) rodando 100% em mock, para validação visual/UX. Ver seção
>   abaixo.
> - **Fase Real — Go-live público (Stories 9.1–9.11)** — inalterada. Depende de
>   todos os épicos anteriores concluídos e do backend real. É a seção que começa
>   em `## Prerequisites`.

---

## Fase 0 — Piloto TestFlight iOS (mock)

> **Antecipada em 2026-07-31.** Esta fase NÃO espera o backend. Ela reaproveita e
> antecipa, restrito a **iOS + mock + testadores internos**, parte do escopo de
> **9.2** (ícones/splash) e **9.7** (EAS Build + Submit iOS/TestFlight), e adiciona
> a configuração de build que hoje falta no repo. Nada aqui altera as Stories
> 9.1–9.11 da Fase Real.

### Objetivo da fase

Gerar um build instalável via **TestFlight** nos iPhones do(s) stakeholder(s),
para **ambos os apps** (Cliente e Lojista), rodando **100% em dados mock**
(`DATA_SOURCE=mock`, default do `packages/core-data`), sem backend, sem Supabase,
sem Asaas. O propósito é validação de interface, navegação e fluxo percebido —
não é operação real nem release público.

### Escopo (IN)

- **Plataforma:** iOS apenas. Apple Developer Program já contratado (US$ 99/ano).
- **Distribuição:** TestFlight com **testadores INTERNOS** (até 100, adicionados
  como usuários no App Store Connect). Testadores internos **não passam pelo Beta
  App Review** da Apple — o build fica disponível assim que a Apple processa o
  upload (minutos), sem revisão de conteúdo.
- **Dados:** build fixado em `DATA_SOURCE=mock` no profile de build EAS.
- **Apps:** Cliente e Lojista, com bundle IDs distintos.
- **Correções mínimas de app** para que o piloto faça sentido: sessão mock no
  Lojista e ocultação dos componentes de dev.

### Fora de escopo (OUT) — explícito

- **Android / Google Play** (fica na Fase Real, Stories 9.8/9.10).
- **Backend real, Supabase, Asaas, webhooks** (Épicos 1–8 / Stories 9.5/9.6).
- **Beta App Review externo, testadores públicos, link público de TestFlight.**
- **Metadata de review externo:** descrição de loja, screenshots de vitrine,
  **URL de política de privacidade** (9.1/9.3) — NÃO exigidos para testadores
  internos.
- **Submissão para produção / go-live** (Stories 9.9–9.11).
- **Termos/Política hospedados** (Story 9.1).

### Data Mode (vale para todas as stories 9.0.x)

- **Entidades:** clientes, lojas, produtos, hubs, pedidos (todas as do app).
- **Modo padrão:** `mock`.
- **Modo real:** `DATA_SOURCE=supabase` — **não usado nesta fase**; o profile de
  build EAS do piloto fixa `mock` para impedir ligação acidental ao backend.
- **Compatibilidade mock:** o build é exatamente a experiência de demonstração já
  navegável hoje; nenhuma fixture é removida ou renomeada.

### Pré-requisitos da fase

- **Conta Expo (expo.dev)** criada e logada localmente — obrigatória para EAS
  Build. **[DECIDIDO 2026-07-31, Caio]** criar **org `keepithub`** no Expo (não
  conta pessoal). Criação de org é gratuita; plano EAS Free (30 builds/mês) cobre
  o piloto.
- **Apple Developer Program** ativo — OK (já contratado).
- **App Store Connect** acessível com a mesma Apple ID do programa.
- **iPhones dos testadores** e as **Apple IDs** deles — cada testador interno
  precisa ser **adicionado como usuário no App Store Connect** (não basta um
  e-mail avulso). **[DECIDIDO 2026-07-31, Caio]** testador inicial: apenas
  `caiorodrigobr@gmail.com`. Os stakeholders entram depois (podem ser adicionados
  a qualquer momento, sem novo build). Reavaliar na ocasião: interno (exige dar
  papel de usuário no App Store Connect a cada um) vs externo (link público, exige
  Beta App Review leve).
- **Bundle IDs:** **[DECIDIDO 2026-07-31, Caio]** `com.keepithub.cliente` e
  `com.keepithub.lojista` (imutáveis depois de criados no App Store Connect).

---

### Story 9.0.1 — Identidade de build iOS e versionamento

- **Classificação:** UI_ONLY (config de build; sem regra de negócio).
- **Executor:** @dev.

**As a** dev,
**I want** os dois apps com bundle identifier, versão válida e usage descriptions
mínimas de iOS,
**so that** o EAS Build gere um IPA aceitável pelo App Store Connect.

**Acceptance Criteria:**
1: `apps/cliente/app.json` recebe `ios.bundleIdentifier = "com.keepithub.cliente"`
   e `apps/lojista/app.json` recebe `ios.bundleIdentifier = "com.keepithub.lojista"`
   (valores confirmados com Caio antes de commitar).
2: `version` de `"0.0.0"` → `"1.0.0"` nos dois apps, e `ios.buildNumber = "1"`
   declarado (App Store Connect rejeita `0.0.0`).
3: `infoPlist` declara **apenas** o que o build realmente usa em mock. Se o app
   não dispara permissão de câmera/localização/notificação de verdade no mock,
   **não** adicionar usage description correspondente (evita ruído até no fluxo
   interno). Se `ModalPermissaoPush` chega a solicitar push nativo, declarar o
   mínimo necessário; caso contrário, não declarar.
4: `expo-doctor` (ou `eas build` em dry-run/local) não acusa campo iOS obrigatório
   ausente para os dois apps.
5: Nenhuma fixture mock alterada; app continua abrindo em `DATA_SOURCE=mock`.

---

### Story 9.0.2 — Perfil EAS Build do piloto (eas.json, mock fixado)

- **Classificação:** UI_ONLY (infra de build).
- **Executor:** @dev escreve a config; **@devops** executa/valida credenciais e
  conta Expo.

**As a** dev,
**I want** um `eas.json` com um profile de build de piloto que fixe dados mock e
distribua internamente,
**so that** o build subido ao TestFlight nunca aponte para backend real.

**Acceptance Criteria:**
1: `eas.json` criado (na raiz de cada app ou na raiz do monorepo, conforme layout
   pnpm+Turbo) com um profile nomeado (ex.: `pilot`).
2: O profile `pilot` define `distribution: "internal"` e injeta
   `DATA_SOURCE=mock` como variável de ambiente do build (via `env` do profile ou
   EAS env), de forma que o app **não** possa subir apontando para Supabase.
3: O profile alveja **iOS** (Android não configurado nesta fase).
4: Documentado no arquivo (comentário ou `docs`) que este profile é do piloto
   interno e não serve para produção.
5: Pré-requisito registrado: conta Expo logada (`eas whoami` responde) — validação
   é de @devops.

**Nota de autoridade:** a execução de `eas build`/`eas submit`, geração de
credenciais e vínculo com a conta Apple é de **@devops** (Story 9.0.7). Aqui o
@dev apenas versiona a configuração.

---

### Story 9.0.3 — Ícones e splash iOS (antecipa parte de 9.2)

- **Classificação:** UI_ONLY.
- **Executor:** @dev.

**As a** dev,
**I want** ícone e splash configurados para o build iOS,
**so that** o app instalado no iPhone não apareça genérico e abra com a marca.

**Acceptance Criteria:**
1: Ícones iOS (1024x1024) verificados/configurados nos dois `app.json` — reaproveita
   os assets já existentes; não precisa refazer os vetores da 9.2.
2: Plugin `expo-splash-screen` adicionado e bloco de splash configurado em cada
   app: fundo `#F6F7F3` (cliente) e `#1B1E1C` (lojista), logo centralizado,
   usando `splash-icon.png` já presente.
3: Build iOS abre exibindo a splash correta em cada app.
4: **Escopo restrito ao necessário para instalar/abrir em iOS.** Screenshots de
   vitrine e wordmark opcional da 9.2 **permanecem na Fase Real** (não fazem parte
   desta story).
5: A Story 9.2 da Fase Real fica marcada como **parcialmente antecipada** por esta
   (ver "Reconciliação" ao fim da fase).

---

### Story 9.0.4 — Sessão mock no app Lojista (corrige authGuard stub)

- **Classificação:** UI_ONLY / mock.
- **Executor:** @dev.

**As a** stakeholder testando o piloto,
**I want** o app Lojista entrar pela tela de login e reagir à sessão mock,
**so that** o fluxo percebido seja o real (não cair direto na home sem login).

**Acceptance Criteria:**
1: `apps/lojista/src/navigation/RootNavigator.tsx` passa a decidir Auth vs Main
   observando `getDataClient().auth.onAuthStateChange(...)`, no mesmo padrão do
   Cliente (`apps/cliente/src/navigation/RootNavigator.tsx`, entregue na Story
   2.3.1).
2: O bypass `AUTH_GUARD_ENABLED = false` do stub
   `apps/lojista/src/navigation/authGuard.ts` deixa de forçar entrada direta na
   `MainTabs`; o app abre deslogado na `AuthStack`.
3: Login/cadastro do Lojista funciona **contra o adapter mock** (sem Supabase),
   estabelecendo sessão que leva à `MainTabs`; logout retorna à `AuthStack`.
4: A subscription trata erro síncrono de `onAuthStateChange` sem crashar
   (mesmo cuidado documentado no RootNavigator do Cliente).
5: `DATA_SOURCE=mock` preservado como default; nenhuma fixture removida.

**Nota:** o app Lojista hoje entra direto na home (stub Épico 0). Esta story é o
delta de sessão mock, não UI nova — as telas de auth do Lojista já existem.

---

### Story 9.0.5 — Ocultar componentes de dev no build de validação

- **Classificação:** UI_ONLY.
- **Executor:** @dev.

**As a** stakeholder testando o piloto,
**I want** que os controles de desenvolvimento não apareçam,
**so that** eu veja a interface como um usuário final veria.

**Acceptance Criteria:**
1: `DevStateToggle` (usado em Home, Hub, Loja, BuscaLoja, BuscaProduto,
   DetalheProduto, EscolhaRetirada, MeusPedidos do Cliente) **não é renderizado**
   no build do piloto.
2: `OrderStatusDevAdvancer` (usado em `ModalConfirmarPin`, Cliente) **não é
   renderizado** no build do piloto.
3: A ocultação usa um gate consistente (ex.: `__DEV__` — que já é usado em
   `apps/cliente/src/screens/perfil/Configuracoes.tsx` — ou flag equivalente),
   garantindo que o build EAS de release (não-dev) não exiba esses controles.
4: Os componentes **permanecem no código** (não são apagados) para uso em
   desenvolvimento; apenas ficam fora do caminho ativo do build de piloto.
5: Verificado no build TestFlight que nenhum controle de dev está visível em
   nenhuma das telas listadas.

**CONSEQUÊNCIA (registrar no plano de validação):** sem o `OrderStatusDevAdvancer`,
não é possível auto-avançar um pedido num único aparelho. Validar um pedido
ponta-a-ponta (compra → aceite → PIN → conclusão) passa a exigir **DOIS aparelhos
coordenados** (um com o app Cliente, um com o app Lojista), OU a introdução
posterior de um auto-avanço do mock. Ver Riscos.

---

### Story 9.0.6 — App records no App Store Connect + testadores internos

- **Classificação:** CORE (habilita distribuição; sem código de app).
- **Executor:** **@devops** (credenciais Apple e configuração de conta).

**As a** devops,
**I want** os dois apps registrados no App Store Connect com testadores internos,
**so that** o build EAS tenha destino e os iPhones do stakeholder recebam via
TestFlight sem Beta App Review.

**Acceptance Criteria:**
1: Dois app records criados no App Store Connect com os bundle IDs de 9.0.1
   (`com.keepithub.cliente`, `com.keepithub.lojista`).
2: Testadores adicionados como **usuários internos** no App Store Connect (até
   100), a partir das Apple IDs fornecidas por Caio/stakeholder.
3: Grupo(s) de TestFlight interno configurado(s); confirmado que **não há Beta App
   Review** para testadores internos.
4: **Sem** preenchimento de metadata de review externo (descrição de vitrine,
   screenshots, URL de política) nesta fase.
5: Pré-requisitos de conta (Apple Developer, papéis no App Store Connect) validados.

---

### Story 9.0.7 — EAS Build + upload TestFlight interno (Cliente e Lojista)

- **Classificação:** CORE.
- **Executor:** **@devops** (execução de build/submit e credenciais).

**As a** devops,
**I want** gerar os IPAs iOS via EAS e enviá-los ao TestFlight interno,
**so that** ambos os apps fiquem instaláveis nos iPhones dos testadores.

**Acceptance Criteria:**
1: `eas build --platform ios --profile pilot` gera IPA do Cliente e do Lojista
   (credenciais/provisioning via `eas credentials`).
2: `eas submit --platform ios` (ou upload equivalente) envia ambos ao App Store
   Connect / TestFlight interno.
3: Após processamento da Apple, os dois apps aparecem para os testadores internos
   **sem Beta App Review**.
4: Build confirmado rodando em `DATA_SOURCE=mock` (profile de 9.0.2), sem qualquer
   chamada a Supabase/Asaas.
5: Depende de 9.0.1–9.0.6 concluídas.

**Nota de autoridade:** `eas submit`, credenciais Apple e release são exclusivos
de **@devops** (ver `.claude/rules/agent-authority.md`).

---

### Story 9.0.8 — Smoke test do piloto mock em device

- **Classificação:** SIMPLE (roteiro manual, sem automação).
- **Executor:** @dev escreve o roteiro; stakeholder executa nos iPhones.

**As a** dev solo,
**I want** um roteiro curto de smoke test do build mock em iPhone,
**so that** o stakeholder valide o essencial sem se frustrar com limites conhecidos.

**Acceptance Criteria:**
1: Documento `docs/tests/smoke-pilot-ios-mock.md` (ou seção equivalente) com passo
   a passo dos dois apps rodando em mock: Cliente (onboarding → login mock → hub →
   loja → produto → checkout → PIN → recibo) e Lojista (login mock → dashboard →
   pedido → PIN → carteira).
2: Cada passo tem critério de "OK" visual.
3: O roteiro declara explicitamente que é **mock**: sem cobrança PIX real, sem
   push real, cartão inativo.
4: O roteiro registra a **necessidade de dois aparelhos** (ou auto-avanço do mock)
   para exercitar um pedido ponta-a-ponta, já que os controles de dev foram
   ocultados (9.0.5).
5: Distinto da Story 9.4 (smoke da Fase Real, que cobre backend/produção); este é
   o smoke enxuto do piloto mock.

---

### Sequência recomendada de execução (Fase 0)

1. **9.0.1** identidade/versionamento iOS (desbloqueia qualquer build).
2. **9.0.2** eas.json com profile `pilot` (mock fixado).
3. **9.0.3** ícones/splash iOS.
4. **9.0.4** sessão mock no Lojista *(paralelizável com 9.0.3/9.0.5)*.
5. **9.0.5** ocultar componentes de dev *(paralelizável com 9.0.4)*.
6. **9.0.6** app records + testadores internos (@devops) *(paralelizável com
   9.0.1–9.0.5, mas antes de 9.0.7)*.
7. **9.0.7** EAS Build + submit TestFlight interno (@devops) — depende de todas.
8. **9.0.8** smoke test em device (roteiro pode ser escrito antes; execução após
   9.0.7).

### Riscos e notas (Fase 0)

- **[ALTO — validação] Pedido ponta-a-ponta exige dois aparelhos.** Ocultar
  `OrderStatusDevAdvancer` (9.0.5) remove o auto-avanço num único device. Para o
  stakeholder validar compra→aceite→PIN→conclusão será preciso **um iPhone com o
  Cliente e outro com o Lojista, coordenados**, OU aceitar reintroduzir um
  auto-avanço mock em story futura. Comunicar isso ANTES do teste para evitar
  frustração. Mitigação possível: manter um build "dev" paralelo com os toggles,
  só para o operador.
- **[MÉDIO] Testadores internos exigem conta no App Store Connect.** Não basta um
  e-mail: cada testador precisa ser usuário com papel no App Store Connect. Coletar
  Apple IDs com antecedência (pré-requisito de 9.0.6).
- **[MÉDIO] Bundle IDs são imutáveis.** Confirmados `com.keepithub.cliente` /
  `com.keepithub.lojista` (DECIDIDO 2026-07-31) — trocar depois obriga recriar o app
  record.
- **[BAIXO] Processamento Apple do upload.** "Sem Beta App Review" não significa
  instantâneo: a Apple ainda processa o binário (minutos, ocasionalmente mais)
  antes de o build aparecer no TestFlight.
- **[BAIXO] `version 0.0.0` inválida.** Já tratado em 9.0.1; se esquecido, o submit
  falha.
- **[BAIXO] Permissões iOS em mock.** Declarar usage descriptions apenas do que o
  build realmente aciona (9.0.1 AC3); em mock provavelmente nenhuma permissão real
  é disparada.
- **[SEM PENDÊNCIA de negócio]** Nenhuma regra de negócio nova é introduzida por
  esta fase (é build+config). Bundle IDs, conta Expo e testador inicial foram
  decididos por Caio em 2026-07-31 (ver Pré-requisitos), não são defaults
  inventados. Única decisão adiada: interno vs externo quando os stakeholders
  forem incluídos.

### Critério de pronto da Fase 0

- [ ] **Cliente** e **Lojista** instaláveis via **TestFlight** nos iPhones do(s)
      stakeholder(s), como testadores internos, **sem Beta App Review**.
- [ ] Ambos abrem com ícone/splash corretos e rodam **100% em `DATA_SOURCE=mock`**
      (sem Supabase/Asaas).
- [ ] App Lojista abre **deslogado** e entra via login mock (não cai direto na
      home).
- [ ] Nenhum controle de dev (`DevStateToggle`, `OrderStatusDevAdvancer`) visível.
- [ ] Roteiro de smoke mock disponível, com a nota dos dois aparelhos.

### Reconciliação com as Stories 9.1–9.11 (Fase Real)

- **9.2 (ícones/splash):** *parcialmente antecipada* por **9.0.3**, restrita a iOS
  e ao mínimo para instalar/abrir. Assets vetoriais completos, wordmark opcional e
  Android permanecem na 9.2.
- **9.7 (EAS Build + Submit iOS/TestFlight):** *parcialmente antecipada* por
  **9.0.2 + 9.0.6 + 9.0.7**, restrita a **mock + testadores internos**. A 9.7 da
  Fase Real cobre o build de **produção** apontando para backend real, ainda
  necessário para o go-live.
- **9.8, 9.9, 9.10, 9.11 (Android, produção, go-live):** **inalteradas**, fora da
  Fase 0.
- **9.1, 9.3, 9.5, 9.6 (Termos/Política, metadata de vitrine, Supabase prod, Asaas
  prod):** **inalteradas**, não exigidas pelo piloto interno.

---

### Validação PO — Fase 0 (Pax, 2026-07-31)

**Veredito: GO — Implementation Readiness 9/10 (confiança ALTA).** A Fase 0 está
coerente, bem sequenciada, com escopo IN/OUT explícito, riscos cobertos e
autoridade de agente correta. Todas as referências de código citadas nas ACs
foram verificadas contra o repositório e conferem (sem invenção). O @sm está
liberado para draftar as stories 9.0.1–9.0.8 em `docs/stories/`, **desde que**
resolva as clarificações abaixo ao draftar 9.0.4 e 9.0.3.

**Bloqueadores:** nenhum a nível de fase.

**Should-Fix antes/durante o draft (não bloqueiam o GO da fase):**

1. **[9.0.4 — AC1/AC3, representação da sessão do Lojista]** As ACs mandam o
   Lojista observar `getDataClient().auth.onAuthStateChange(...)` "no mesmo padrão
   do Cliente", mas o `AuthPort` (e o `auth.mock.ts`) é **inteiramente tipado em
   `Cliente`**: `signIn`/`signUp`/`onAuthStateChange` retornam `Cliente`, a sessão
   é a global `db.sessionClienteId` e o `signIn` busca em `db.clientes` por e-mail.
   **Não existe conceito de sessão de Lojista no core-data.** Reusar o port
   literalmente faz a "sessão do lojista" ser uma sessão de *Cliente*,
   compartilhando a mesma chave global de sessão do mock entre os dois apps —
   semanticamente errado e acoplando o estado mock dos dois apps. **Ação p/ @sm/@pm:**
   antes de draftar 9.0.4, decidir e fixar na AC **como** a sessão mock do Lojista
   é representada — opções: (a) método/port de auth de lojista próprio no core-data
   (mock keyed em algo como `db.sessionLojistaId`), (b) estado de sessão mock local
   ao app Lojista (fora do core-data), ou (c) documentar explicitamente que em mock
   o Lojista reusa a sessão tipada em Cliente só para efeito de UX, aceitando o
   acoplamento. A regra do README ("rejeitar sucesso fictício / botões sem destino")
   é atendida por qualquer opção que crie estado observável de sessão; o que **não**
   pode é a AC ficar prescrevendo um port que não modela o domínio do Lojista.

2. **[9.0.3 — AC2, dependência `expo-splash-screen`]** Confirmado que
   `expo-splash-screen` **não** é dependência de nenhum dos dois apps hoje. A AC já
   pede "adicionar o plugin", então é trabalho válido — mas o @sm deve tratar a
   adição do pacote como tarefa explícita (dependência de build adicionada cedo),
   não como config pré-existente.

**Notas para o @sm ao converter em stories (não são findings de mérito):**

- Cada 9.0.x traz a linha `Classificação` e a fase inteira traz um bloco `Data
  Mode` compartilhado; ao draftar, expandir para o **cabeçalho por-story completo**
  do `docs/stories/README.md` (`## MVP Pilot Classification` com `Backend esperado`
  e `Retomada futura`, e `## Data Mode` quando a story tocar entidades — caso de
  9.0.4).
- Declarar `quality_gate` por story (o épico só nomeia `Executor`). Fluxo do
  CLAUDE.md: stories de código do @dev → gate @qa; stories de infra/credenciais do
  @devops (9.0.6/9.0.7) → verificação por @architect/@devops, sem QA de código.
- 9.0.5: a lista de telas com `DevStateToggle` na AC1 confere exatamente com o
  repositório (Home, Hub, Loja, BuscaLoja, BuscaProduto, DetalheProduto,
  EscolhaRetirada, MeusPedidos); `OrderStatusDevAdvancer` está em `ModalConfirmarPin`
  como a AC2 afirma. Manter essa precisão no draft.

**Nice-to-have:** a 9.2 (Fase Real) é referenciada como "parcialmente antecipada"
na seção Reconciliação, mas o texto da própria Story 9.2 não recebeu marcador. Se
quiser rastreabilidade bidirecional, o @pm pode anotar isso na 9.2 — cosmético.

---

## Fase 0-Android — Piloto Google Play Internal Testing (mock)

> **Antecipada em 2026-08-09.** Espelha a Fase 0 iOS acima, trocando apenas a
> plataforma: **Android / Google Play Internal Testing**, restrita a **mock +
> testadores internos**. Baseada na análise de arquitetura
> `docs/architecture/08-mvp-pilot-android.md` (@architect Aria, 2026-08-09).
> Nada aqui altera as Stories 9.1–9.11 da Fase Real nem a Fase 0 iOS.

### Objetivo da fase

Gerar um **AAB** de cada app (Cliente e Lojista) instalável via faixa
**Internal Testing** do Google Play Console, rodando **100% em dados mock**
(`DATA_SOURCE=mock`, o mesmo profile `pilot` já usado no iOS), sem backend, sem
Supabase, sem Asaas. Mesmo propósito da Fase 0 iOS — validação de interface,
navegação e fluxo percebido — agora em device Android real. O código já é
cross-platform: o gap é **config de build (`app.json`/`eas.json`) + conta e
provisionamento no Google Play**, não novo código de aplicação.

### Escopo (IN)

- **Plataforma:** Android apenas, faixa **Internal Testing** do Google Play
  (equivalente ao TestFlight interno do iOS).
- **Distribuição:** lista de **e-mails de testadores** (contas Google) na
  faixa Internal Testing (até 100), sem Beta App Review — disponível em
  minutos após o processamento do Google (assim como no iOS, "sem review" não
  é sinônimo de "instantâneo").
- **Dados:** build fixado em `DATA_SOURCE=mock` no **mesmo** profile `pilot`
  do EAS já usado pelo iOS — não criar um `env` separado por plataforma.
- **Apps:** Cliente e Lojista, com `android.package` distintos.
- **Formato do binário:** AAB (`app-bundle`), formato exigido pelo Google Play
  (diferente do IPA do iOS).
- **Reaproveitamento:** ícones/splash (9.0.3), sessão mock do Lojista (9.0.4) e
  ocultação dos componentes de dev (9.0.5) já valem para Android sem nova
  story — mesmo código/assets cross-platform.

### Fora de escopo (OUT) — explícito

- **Produção / faixas Closed, Open, Production do Google Play** (fica na Fase
  Real, Stories 9.8/9.10).
- **Backend real, Supabase, Asaas, webhooks** (Épicos 1–8 / Stories 9.5/9.6).
- **Metadata de vitrine completa** (descrição, screenshots, categoria — Story
  9.3), **URL de política de privacidade publicada** (provável não-exigida em
  Internal Testing; confirmar no Console no momento — não presumir isenção).
- **Keystore local gerenciado manualmente.** Recomendação do arquiteto: EAS
  managed keystore (Opção A) para o piloto — Google Play App Signing assume a
  chave de assinatura final. Nenhum `.jks` no repositório.
- **Submissão para produção / go-live** (Stories 9.9–9.11).
- **Termos/Política hospedados** (Story 9.1).

### Data Mode (vale para as stories que tocam entidades — 9.0.13)

- **Entidades:** clientes, lojas, produtos, hubs, pedidos (todas as do app).
- **Modo padrão:** `mock`.
- **Modo real:** `DATA_SOURCE=supabase` — **não usado nesta fase**; o mesmo
  profile `pilot` do EAS (compartilhado com o iOS) fixa `mock` para impedir
  ligação acidental ao backend, em qualquer plataforma.
- **Compatibilidade mock:** o AAB é exatamente a experiência de demonstração
  já navegável hoje; nenhuma fixture de `packages/core-data/src/mock` é
  removida, renomeada ou alterada.

### Pré-requisitos da fase

- **[NEGÓCIO — BLOQUEIO, PENDENTE] Conta Google Play Developer (US$25,
  pagamento único).** Diferente do Apple Developer Program (já contratado),
  **esta conta ainda não existe/está confirmada**. É custo + decisão do
  stakeholder/Caio de publicar no Android agora — **não está aprovado por
  padrão**. Bloqueia as stories de @devops/ops (9.0.11 e 9.0.12). **Não
  bloqueia** as stories de @dev (9.0.9 e 9.0.10), que podem ser feitas em
  paralelo enquanto a conta é decidida/criada.
- **[A CONFIRMAR com Caio antes de commitar] `android.package`.** Propostos
  por paralelismo com os bundle IDs iOS já decididos: `com.keepithub.cliente`
  e `com.keepithub.lojista`. **Imutáveis após o primeiro upload ao Play
  Console** — trocar depois exige recriar o app na loja (perde faixa,
  testadores e histórico). Mesma restrição de irreversibilidade dos bundle IDs
  iOS, mas em namespace próprio do Android — não é herdado automaticamente do
  iOS só por usar a mesma string.
- **`EXPO_ACCESS_TOKEN` válido.** A Story 9.0.7 (iOS) registrou que o token do
  `.env` estava inválido e bloqueou o build do Lojista. O mesmo token é
  necessário para `eas build`/`eas submit` Android — renovar antes de
  iniciar a Story 9.0.12, senão o build Android trava pelo mesmo motivo.
- **Service account do Google Play** (Google Cloud + papel de acesso à API do
  Play) e **e-mails Google dos testadores internos** — insumos de ops/@devops
  e de Caio/stakeholder, equivalentes às Apple IDs e à ASC API key do iOS.
  Caio já é testador iOS com `caiorodrigobr@gmail.com` — confirmar se o mesmo
  e-mail Google serve para o Play.
- **Conta Expo `keepithub`** — já criada e logada para o iOS (Fase 0 iOS);
  reaproveitada sem trabalho adicional para Android.

### Plano de stories

| Story | Título | Executor | Classificação | Espelha (iOS) |
|---|---|---|---|---|
| **9.0.9** | Identidade de build Android e versionamento | @dev (gate @qa) | UI_ONLY | 9.0.1 |
| **9.0.10** | Perfil EAS Android no profile `pilot` | @dev escreve / @devops executa (gate @devops) | UI_ONLY | 9.0.2 |
| **9.0.11** | App records no Play Console + faixa Internal + service account + testadores | @devops (gate @architect) | CORE | 9.0.6 |
| **9.0.12** | EAS Build (AAB) + `eas submit` track internal | @devops (gate @architect) | CORE | 9.0.7 |
| **9.0.13** | Smoke test do piloto mock em device Android | @dev escreve / stakeholder executa (gate @qa) | SIMPLE | 9.0.8 |

**Dependências:** 9.0.9 → 9.0.10 (config, sequencial recomendado mas não
bloqueante tecnicamente); 9.0.11 depende da conta Google Play Developer e pode
correr em paralelo com 9.0.9/9.0.10; 9.0.12 depende de **todas** (9.0.9–9.0.11)
+ `EXPO_ACCESS_TOKEN` válido; 9.0.13 depende de 9.0.12 (o roteiro em si pode
ser escrito antes).

### Riscos específicos desta fase (resumo — detalhe completo em `08-mvp-pilot-android.md` §10)

- **[ALTO] `android.package` imutável após publish.** Confirmar com Caio antes
  do commit e antes do primeiro `eas submit`.
- **[ALTO] Pedido ponta-a-ponta exige dois aparelhos** (herdado da 9.0.5 —
  `OrderStatusDevAdvancer` oculto — vale igual no Android).
- **[MÉDIO] `versionCode` não auto-incrementa** (`appVersionSource: local`) —
  reenvio com o mesmo `versionCode` é rejeitado pelo Play; declarar `1` e
  incrementar manualmente a cada upload.
- **[MÉDIO] Conta Google Play não existe** — bloqueia @devops/ops, não bloqueia
  @dev; adiantar stories de config em paralelo à abertura da conta.
- **[MÉDIO] `EXPO_ACCESS_TOKEN` inválido** (histórico da 9.0.7 iOS) — renovar
  antes de qualquer build Android.
- **[BAIXO]** Formulários do Play Console (Content rating/Data Safety) e
  política de privacidade podem ser exigidos mesmo em Internal — verificar no
  Console, não presumir isenção.

### Reconciliação com as Stories 9.1–9.11 (Fase Real)

- **9.8 (EAS Build + Submit Google Play Internal Testing):** fica
  *parcialmente antecipada* por **9.0.10 + 9.0.11 + 9.0.12**, restrita a
  **mock + testadores internos** — mesmo padrão de 9.7↔9.0.x no iOS. A 9.8 da
  Fase Real cobre o build de **produção** apontando para backend real, ainda
  necessário para o go-live.
- **9.2 (ícones/splash), 9.0.3 (Fase 0 iOS):** já cobrem Android — os assets
  adaptive icon já existem e são referenciados nos dois `app.json`; nenhuma
  story nova de ícone/splash é necessária nesta fase.
- **9.0.4, 9.0.5 (sessão mock Lojista, ocultação de dev):** já valem para
  Android sem alteração — código cross-platform, sem `Platform.OS`.
- **9.9, 9.10, 9.11 (produção, go-live):** **inalteradas**, fora desta fase.

---

## Prerequisites

- Épicos 1-8 concluídos.
- Contador de marketplace contratado (item externo bloqueante).
- Textos finais de Termos e Política do stakeholder/advogado.
- Aprovação comercial Asaas produção.

## Stories

### Story 9.1 — Termos de Uso e Política de Privacidade (stubs)

**As a** dev,
**I want** páginas web hospedadas em `keepit.app/termos` e `keepit.app/privacidade`,
**so that** os apps possam linkar textos oficiais.

**Acceptance Criteria:**
1: Duas rotas no admin Next.js: `/termos` e `/privacidade` — públicas, sem login.
2: Conteúdo em Markdown renderizado; texto final chega do advogado do stakeholder — no MVP, versão stub com estrutura correta (partes obrigatórias: dados coletados, finalidade, base legal LGPD, direitos do titular, contato do controlador).
3: Botão de contato/DPO exibido na Política.
4: Data de última atualização visível.
5: Links dos apps mobile apontam para essas URLs.

---

### Story 9.2 — Ícones e splash screens dos apps mobile

**As a** dev,
**I want** os apps com ícone oficial do Keepit e splash screen bonita,
**so that** a app store não rejeite por "generic icon".

**Acceptance Criteria:**
1: Ícone do app cliente: círculo verde `#75DC8D` com casinha branca central + wordmark opcional. Gerado em todas as resoluções obrigatórias (iOS 1024x1024 + variantes, Android adaptive icon).
2: Ícone do app lojista: pode ser variante (fundo dark, mesma casinha) para diferenciar visualmente na lista de apps.
3: Splash screen: fundo `#1B1E1C` (lojista) / `#F6F7F3` (cliente) com logo centralizado. Configurado no `app.json` de cada app Expo.
4: Assets vetoriais versionados em `packages/ui-tokens/logos/`.

---

### Story 9.3 — Metadata das lojas + screenshots

**As a** dev,
**I want** descrição, palavras-chave, screenshots e categoria configurados nas lojas,
**so that** os apps sejam encontráveis e passem revisão.

**Acceptance Criteria:**
1: Descrição do app cliente e do lojista em pt-BR (dois apps distintos na store).
2: Categoria: "Shopping" para o cliente, "Business" ou "Food & Drink" para o lojista (revisar melhor).
3: Screenshots obrigatórios (iPhone 6.5", 5.5"; Android phone) — 4 a 6 por app cobrindo: onboarding, home hub, catálogo, checkout, PIN, recibo (cliente); dashboard, pedido, PIN, carteira (lojista).
4: Screenshots com moldura ou texto explicativo curto ("Compre local, retire no hub").
5: Configurado em `apps/cliente/app.json` e `apps/lojista/app.json` (bundle IDs distintos: `com.keepithub.cliente` e `com.keepithub.lojista`).

---

### Story 9.4 — Suite de teste manual end-to-end

**As a** dev solo,
**I want** um roteiro documentado de smoke test dos 3 apps,
**so that** eu não esqueça de testar algo antes do release.

**Acceptance Criteria:**
1: Documento `docs/tests/smoke-manual.md` com passo a passo:
   - Cliente: cadastro (e-mail + senha, telefone opcional) → **home** → logout → login → escolher hub → escolher loja → adicionar produto → checkout PIX (CPF no 1º checkout) → aguardar aceite (simular pelo lojista em outro device) → mostrar PIN → confirmar (pelo lojista) → recibo → cancelar novo pedido → "esqueci a senha" (redefinição por e-mail) → excluir conta.
   - Lojista: cadastro (e-mail + senha, 3 passos, **sem etapa de SMS**) → tela "Em análise" → aprovação admin → login → cadastrar produto → configurar horário → aceitar pedido → marcar "saindo" → digitar PIN → ver carteira → solicitar saque.
   - Admin: login (e-mail + senha) → aprovar lojista → processar reembolso → suspender lojista → dashboard.
2: Cada passo tem critério de "OK".
3: Rodar a suite inteira antes de submissão.
4: **Nenhum passo do roteiro depende de recebimento de SMS** (decisão 10.4 — sem confirmação por SMS no MVP). O único canal de e-mail exercitado é o de redefinição de senha (Story 2.7).

---

### Story 9.5 — Migração Supabase dev → produção

**As a** dev,
**I want** um projeto Supabase de produção separado com o mesmo schema,
**so that** dev e produção não misturem dados.

**Acceptance Criteria:**
1: Novo projeto Supabase criado em conta de produção da Keepit.
2: `supabase db push --project-ref <prod>` aplica todas as migrations.
3: `.env.production` com URL/keys de produção (nunca committado).
4: Config de produção nos apps Expo (via EAS Secret ou variável de ambiente por build profile).
5: Admin em Vercel configurado com variáveis de produção.
6: Cliente de teste consegue criar conta em prod e o fluxo mínimo funciona.

---

### Story 9.6 — Troca Asaas sandbox → produção

**As a** dev,
**I want** o Asaas produção configurado após aprovação comercial,
**so that** pagamentos reais entrem.

**Acceptance Criteria:**
1: `ASAAS_ENVIRONMENT=production` em prod.
2: `ASAAS_API_KEY` da conta real da Keepit.
3: Webhook URL apontando para prod Supabase Edge Function.
4: `ASAAS_WEBHOOK_TOKEN` novo gerado e configurado nos dois lados.
5: Teste com uma cobrança real de R$ 5 (assumindo lojista de teste com CNPJ real da Keepit) validando ciclo completo.

---

### Story 9.7 — EAS Build + Submit para App Store (TestFlight)

**As a** dev,
**I want** o app cliente e app lojista subidos ao TestFlight,
**so that** eu teste em device real antes de publicar.

**Acceptance Criteria:**
1: EAS Build configurado para iOS ambos os apps.
2: Certificados/provisioning gerados via EAS (`eas credentials`).
3: `eas build --platform ios --profile production` gera IPAs.
4: `eas submit --platform ios` envia ao App Store Connect.
5: Ambos os apps entram em TestFlight review; aguardar aprovação (Apple aprova TestFlight em ~24h geralmente).

---

### Story 9.8 — EAS Build + Submit para Google Play (Internal Testing)

**As a** dev,
**I want** os apps subidos ao Google Play Internal Testing,
**so that** eu valide em Android real.

**Acceptance Criteria:**
1: Google Play Console conta paga (US$ 25) criada.
2: EAS Build para Android profile production.
3: `eas submit --platform android` envia AAB para Play Console.
4: Configurado track "Internal testing" com testers definidos.
5: App instalável via link do Play para testadores.

---

### Story 9.9 — Submissão para produção (Apple)

**As a** dev,
**I want** enviar app cliente e app lojista para revisão da App Store,
**so that** possam ser publicados para o público.

**Acceptance Criteria:**
1: Notas de revisão detalhadas para Apple: explicar modelo do Keepit, indicar credenciais de teste (cliente demo + lojista demo em prod), destacar botão de exclusão de conta.
2: URL de política de privacidade preenchida.
3: Idade indicativa 4+ (não tem conteúdo restrito).
4: Submissão para "Manual Release" para controlar go-live.
5: Ambos os apps passam na revisão (pode exigir 1-2 rodadas de retorno).

---

### Story 9.10 — Submissão para produção (Google Play)

**As a** dev,
**I want** publicar cliente e lojista na Play Store,
**so that** usuários Android instalem.

**Acceptance Criteria:**
1: Todas as declarações de privacidade preenchidas (Data Safety form): coletamos e-mail, telefone (**opcional no app Cliente, obrigatório no app Lojista** — decisão 10.4; em nenhum dos dois é verificado), localização, dados de pedido.
2: Content rating questionnaire respondido.
3: URL de política de privacidade preenchida.
4: Trilha "Production" com 100% rollout.
5: Aprovado pela Google (24-48h típico).

---

### Story 9.11 — Go-live

**As a** dev,
**I want** liberar os apps para o público no momento certo,
**so that** o MVP entre em ar controladamente.

**Acceptance Criteria:**
1: Todas as stories anteriores `Done`.
2: Suite manual (Story 9.4) rodada uma última vez em produção.
3: Lojistas piloto (curados manualmente pela Keepit) cadastrados e aprovados em produção.
4: Hubs criados no admin de produção.
5: Botão "Release" no App Store Connect e "Rollout" no Play Console clicados.
6: Monitorar métricas nas primeiras 24h (Supabase logs, Vercel logs, dashboard admin).

---

## Definition of Done

- [ ] Todas as 11 stories `Done`.
- [ ] Ambos os apps publicados nas duas lojas.
- [ ] Admin acessível em domínio próprio (`admin.keepit.app` ou similar).
- [ ] Pelo menos 3-5 lojistas piloto cadastrados em produção.
- [ ] Primeiro pedido real processado end-to-end.
- [ ] Contador de marketplace ativo, ciente de que a operação começou.
