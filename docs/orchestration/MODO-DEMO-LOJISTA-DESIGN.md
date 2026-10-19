# Modo Demo — App do Lojista: Design Técnico

> **Autor:** @architect (Aria) · **Data:** 2026-08-19 · **Status:** Proposta para @sm converter em Stories
> **Base de trabalho:** worktree `feat/modo-demo-mock` (`/root/projetos/keepitnovoapp/.worktrees/block-13-demo`)
> **Insumo:** `docs/orchestration/MODO-DEMO-APP-PARCEIROS-ANALISE.md` (gap analysis, ~65% pronto)
> **Natureza:** DESIGN. Nenhum código implementado. Nenhum `git push`/merge (exclusivo @devops mediante autorização).

## Resumo do approach

O demo do Lojista está bloqueado por **um dado ausente, não por lógica ausente**: no modo mock as
telas da área logada já funcionam de ponta a ponta lendo `estab-farmacia-vida`, mas o gate de login
lê um array paralelo (`db.estabelecimentosCadastrados`) que nasce vazio, então nenhum status `'ativo'`
existe e `signInLojista()` nunca dispara. O design fecha isso **semeando** — só no `createMockDb()`,
que é instanciado exclusivamente pelo DataClient mock (portanto nunca no bundle de produção supabase) —
uma conta de lojista demo (`lojista@keepit.com.br`) + um estabelecimento `'ativo'`, **espelhando exatamente
o padrão já validado do Cliente (`clientesCredenciaisFixture`) e do Admin (`admin@keepit.com.br`, Épico 10)**.
O PIN de retirada, já presente nas fixtures, ganha uma **dica visível apenas em modo mock** na tela DigitarPin,
e um PIN de fixture não-determinístico (`Math.random()`) é fixado. Zero UX nova de produto; zero regra de negócio.

---

## Isolamento production vs demo (invariante de segurança)

O ponto de isolamento é **estrutural, não condicional**, e é o mesmo que já protege `clientesCredenciaisFixture`
e `saquesFixture` hoje:

- `createMockDb()` (`packages/core-data/src/mock/db.ts`) só é chamado por `createDataClient({ source: 'mock' })`.
- Em `source: 'supabase'` (build `production`, `EXPO_PUBLIC_DATA_SOURCE=supabase`), os 10 adapters Supabase são
  usados e `createMockDb()` **nunca é instanciado** — as fixtures semeadas são dead-code para o runtime de produção.
- Logo, semear `db.lojistaContas` / `db.estabelecimentosCadastrados` com dados demo **não pode vazar** para a
  operação real. É o mesmo mecanismo pelo qual `cliente-ana`/`ana.souza@example.com` já vivem no mock sem
  contaminar produção.
- **Segurança adicional (flag para fora deste escopo):** o gap #3 (PIN) exibe `pedido.pin_texto`. Isso é seguro
  no mock (dado fake, e a dica é gated por `!isSupabaseDataSource()`), mas confirma-se aqui uma nota de segurança:
  em produção o app do **Lojista não deve receber `pin_texto`** (é o segredo que o Cliente exibe). Auditar o
  `SELECT` do `order.supabase` do lojista quanto a `pin_texto` é carry-forward do Épico 6+/segurança — **não** faz
  parte destas stories, mas fica registrado.

---

## Gap 1 (🔴 Bloqueador) — Entrada na área logada no modo demo

### Diagnóstico preciso (confirmado no código)

- `Login.tsx` (`apps/lojista/src/screens/auth/Login.tsx`) chama `lojistaAuth.signIn(email, senha)` e, com sucesso,
  lê `estabelecimentoCadastro.getMeuEstabelecimento()`. Só o ramo `status === 'ativo'` chama `signInLojista()`
  (`apps/lojista/src/navigation/lojistaSession.ts`), único gatilho de `Main`/MainTabs.
- Em mock: `signIn` (`lojista-auth.mock.ts`) procura a conta por e-mail em `db.lojistaContas` (senha nunca validada,
  igual Cliente/Admin) e grava `db.sessionLojistaUserId`. `getMeuEstabelecimento` (`estabelecimento-cadastro.mock.ts`)
  procura em `db.estabelecimentosCadastrados` pelo `donoUserId === db.sessionLojistaUserId` e devolve o `status`.
- `db.ts` inicializa **ambos vazios** (`lojistaContas: []`, `estabelecimentosCadastrados: []`). Resultado: e-mail
  desconhecido → `signIn` falha → banner de erro; e um cadastro feito no app nasce `'em_analise'` → tela EmAnalise,
  nunca `'ativo'`. A porta fica trancada.
- As telas de MainTabs leem `CURRENT_ESTABELECIMENTO_ID = 'estab-farmacia-vida'` fixo
  (`apps/lojista/src/screens/catalogo/currentStore.ts`) de `db.estabelecimentos` (domínio de Descoberta, já `'ativo'`
  e rico). Ou seja: **a loja "existe e está ativa" para as telas; o que falta é só destravar o gate de login.**

### Solução técnica proposta

Semear, **apenas no `createMockDb()`**, uma conta de lojista demo + um cadastro `'ativo'` cujo `donoUserId`
coincide com o `id` da conta e cujo `id` coincide com `estab-farmacia-vida` (robustez: alinha o domínio do wizard
ao domínio de Descoberta, então mesmo telas que resolvam por `getMeuEstabelecimentoId()` — hoje só
`ProductCatalogContext` em modo supabase — batem no dataset rico).

**Credencial de demo (documentar):** e-mail `lojista@keepit.com.br`, senha **qualquer** (mock não valida senha —
paridade exata com `admin@keepit.com.br` do Admin e `ana.souza@example.com` do Cliente).

Três opções avaliadas (trade-offs) — recomendo **A**:

| Opção | Como | Prós | Contras |
|-------|------|------|---------|
| **A — Seed + login normal (RECOMENDADA)** | Semear conta+estab ativo; o apresentador digita `lojista@keepit.com.br` + senha qualquer e entra | Espelha **exatamente** Cliente e Admin (padrão já validado, REL-008); **zero UI nova** (fidelidade ao protótipo, princípio nº1); demonstra a própria tela de Login; nada além do necessário (princípio nº4) | Apresentador precisa saber o e-mail (mitigado: documentar na tela/README de demo) |
| B — Seed + prefill mock-only dos campos | Além do seed, pré-preencher `identificador`/`senha` no `Login.tsx` quando `!isSupabaseDataSource()` | Login "1 toque"; apresentador não decora e-mail | Micro-UI a mais (afford de dev); levemente menos fiel; gating extra |
| C — Auto-sessão no boot | `signInLojista()` no boot em mock, pulando o Login | Entra direto | Pula Login/onboarding (não dá para demonstrá-los); **diverge** de Cliente/Admin; bypassa o gate real `getMeuEstabelecimento` (perde fidelidade do fluxo); pior para "parece pronto" |

**Recomendação:** **A** como baseline (paridade, zero UI). **B** fica como afford opcional de conveniência
(decisão do Caio); se adotada, é um `[AUTO-DECISION]` pequeno e gated por `!isSupabaseDataSource()`, sem tocar
produção. **C descartada** (fere fidelidade e diverge do padrão dos apps irmãos).

### Arquivos-alvo exatos

- **CRIAR** `packages/core-data/src/mock/fixtures/lojista-contas.ts` — exporta duas fixtures (mesmas shapes de
  `MockDb.lojistaContas` e `MockDb.estabelecimentosCadastrados`):
  - `lojistaContasFixture`: `[{ id: 'lojista-demo-farmacia-vida', email: 'lojista@keepit.com.br', criado_em, nome_fantasia: 'Farmácia Vida', cnpj: <cnpj-valido-demo>, telefone, responsavel_nome }]`.
  - `estabelecimentosCadastradosFixture`: `[{ id: 'estab-farmacia-vida', donoUserId: 'lojista-demo-farmacia-vida', cnpj: <mesmo cnpj>, status: 'ativo', motivoRejeicao: null, nomeFantasia: 'Farmácia Vida', categoria, descricao, fotoFachadaUrl: null, horarios: <7 dias, amplos 00:00–23:59 p/ coerência com o dataset de demo> }]`.
  - **Invariantes obrigatórias:** `conta.id === cadastro.donoUserId` (senão `getMeuEstabelecimento` devolve `null` → retomada de wizard, não `ativo`); `cadastro.status === 'ativo'`; `cnpj` idêntico entre os dois (coerência com a idempotência por CNPJ); `cadastro.id === 'estab-farmacia-vida'`.
- **EDITAR** `packages/core-data/src/mock/db.ts` — importar as fixtures; trocar `lojistaContas: []` → `structuredClone(lojistaContasFixture)` e `estabelecimentosCadastrados: []` → `structuredClone(estabelecimentosCadastradosFixture)`; **manter `sessionLojistaUserId: null`** (o login é quem estabelece a sessão — não auto-logar). Atualizar o JSDoc de ambos os campos (hoje diz "piloto sempre começa vazio").
- **EDITAR** `packages/core-data/src/mock/fixtures/index.ts` — re-exportar o novo módulo (barrel).
- **(Opção B, opcional)** `apps/lojista/src/screens/auth/Login.tsx` — prefill inicial dos `useState` gated por `!isSupabaseDataSource()` (`apps/lojista/src/lib/dataSource.ts`).

### Pontos de atenção

- **Isolamento:** ver seção "Isolamento" acima — semear em `createMockDb()` é inerentemente mock-only. **Não**
  semear em nenhum ponto que rode em `source: 'supabase'`.
- **Compatibilidade de testes (risco principal):** vários testes assumem esses arrays vazios ao criar um `MockDb`
  (o JSDoc atual até diz "piloto sempre começa vazio"; `lojista-auth.mock.test.ts` e
  `estabelecimento-cadastro.mock.test.ts` semeiam esses campos manualmente). Semear pode quebrar asserts de
  contagem/vazio. **Mesmo precedente já resolvido com `saquesFixture`** (migrou de `[]` para semeado e ajustou os
  testes). O @dev deve rodar a suíte inteira de `core-data` e ajustar asserts afetados — é parte da story.
- **Wizard ainda demonstrável:** um `signUp` com e-mail DIFERENTE cria outra conta/`donoUserId` → `em_analise` →
  telas EmAnalise/Rejeitado seguem funcionando. O seed `'ativo'` é uma conta à parte, não colide.
- **CNPJ válido:** usar um CNPJ que passe em `apps/lojista/src/lib/cnpj.ts` para coerência (não é exercido no login,
  mas evita dado inconsistente se alguém abrir Perfil/Configurações).

### Critérios de aceite sugeridos (para o @sm converter em AC)

1. Em build mock, abrir o app → Login → digitar `lojista@keepit.com.br` + qualquer senha → **entra direto nas 4 abas** (Pedidos/Catálogo/Financeiro/Perfil).
2. As 4 abas abrem **cheias** (21 pedidos na esteira, produtos com foto, saldo/extrato não-vazios, horários) — o dataset `estab-farmacia-vida` está ligado.
3. `db.lojistaContas` e `db.estabelecimentosCadastrados` nascem com **exatamente 1** entrada demo cada; `sessionLojistaUserId` continua `null` até o login.
4. `conta.id === cadastro.donoUserId` e `cadastro.status === 'ativo'` (teste de fixture).
5. `signUp` com um e-mail diferente ainda cria conta `em_analise` (fluxo do wizard preservado).
6. A suíte de `packages/core-data` passa (asserts de vazio/contagem ajustados).
7. Nenhum caminho semeia contas/estabelecimentos em `source: 'supabase'` (o seed vive só em `createMockDb`).
8. Credencial de demo documentada (no JSDoc da fixture e/ou README de demo).

---

## Gap 3 (🟡) — PIN de retirada descobrível na demo

### Diagnóstico preciso (confirmado no código)

- `DigitarPin.tsx` (`apps/lojista/src/screens/pedidos/DigitarPin.tsx`) obtém o `pedido` via `getById(pedidoId)` e
  compara o PIN digitado; a instrução diz "Peça o código de 4 dígitos ao cliente". Numa demo só com o app do
  Lojista, o apresentador não tem de onde tirar o PIN.
- O PIN está no dado: `Pedido.pin_texto` **já existe no tipo** (`order.port.ts` linha 54 — "expõe apenas `pin_texto`,
  exibição ao cliente; `pin_hash` NUNCA") e está populado nas fixtures (ex.: pedido `no_hub` = `4567`). Logo,
  `pedido.pin_texto` é acessível no `DigitarPin` **sem mudar contrato**.
- **Gap #5 (🟢) embutido:** `packages/core-data/src/mock/fixtures/pedidos.ts` linha 40 gera
  `pin_texto: String(1000 + Math.floor(Math.random() * 9000))` — não-determinístico entre boots.

### Solução técnica proposta

Três opções (trade-offs) — recomendo **A** + fixar o PIN aleatório:

| Opção | Como | Prós | Contras |
|-------|------|------|---------|
| **A — Dica mock-only na tela (RECOMENDADA)** | Em `DigitarPin.tsx`, quando `!isSupabaseDataSource()`, renderizar uma linha discreta "Demo — PIN esperado: {pedido.pin_texto}" | Menor mudança útil; ponta-a-ponta na própria tela; gated → **nunca aparece em produção**; fidelidade ao protótipo preservada (é afford de dev, não repropõe UX) | Uma linha de UI condicional a mais |
| B — Documentar PINs num roteiro de demo | Cheat-sheet externo (README/handoff) mapeando pedido→PIN | Zero código | Frágil (apresentador precisa casar pedido↔PIN manualmente); não "brilha" |
| C — Pré-preencher os 4 dígitos em mock | Auto-preencher `digitos` com `pin_texto` | 1 toque para confirmar | Descaracteriza a tela (cujo propósito é digitar o código); menos fiel |

**Recomendação:** **A** (dica gated) — o apresentador vê o PIN esperado, digita e confirma, demonstrando o fluxo
real. Somar a correção do gap #5 (fixar o PIN da fixture) para determinismo. **B** pode acompanhar como
documentação de apoio; **C** descartada.

### Arquivos-alvo exatos

- **EDITAR** `apps/lojista/src/screens/pedidos/DigitarPin.tsx` — adicionar bloco condicional
  `!isSupabaseDataSource()` (import de `../../lib/dataSource`) exibindo `pedido.pin_texto` como dica de demo,
  próximo à instrução existente. **Sem** alterar a lógica de `confirmPin` nem os estilos do protótipo.
- **EDITAR** `packages/core-data/src/mock/fixtures/pedidos.ts` — substituir o `Math.random()` da linha 40 por um
  PIN fixo determinístico (ex.: derivado do `pedidoId` ou uma constante por pedido), preservando os PINs já fixos
  (ex.: `4567` no `no_hub`).

### Pontos de atenção

- **Gating obrigatório:** a dica deve depender de `!isSupabaseDataSource()`. Em produção não renderiza — e, se o
  `SELECT` de produção do lojista não trouxer `pin_texto`, o ramo gated nunca executa (sem crash).
- **Segurança (nota, fora de escopo):** confirmar em outra frente que o app do Lojista **não** recebe `pin_texto`
  em produção (segredo do Cliente). Não é tarefa desta story.
- **Fidelidade:** manter o texto/estilo do protótipo; a dica é claramente um afford de demo, não parte da UX real.

### Critérios de aceite sugeridos

1. Em build mock, na tela DigitarPin de um pedido `no_hub`, aparece a dica com o PIN esperado (`pedido.pin_texto`).
2. Digitar o PIN mostrado confirma a retirada de ponta a ponta (`ConfirmarRetirada`).
3. Em build supabase (`isSupabaseDataSource()` true), a dica **não** é renderizada.
4. Nenhum PIN de fixture usa `Math.random()`; PINs são determinísticos entre boots (teste de fixture).
5. A lógica de `confirmPin` (tentativas/bloqueio) permanece inalterada.

---

## Lista sugerida de Stories (ordenada por dependência)

Épico recomendado: **Épico 10 — Demo Mock** (`docs/prd/epics/10-admin-demo-mock.md`). É o épico de modo demo:
10.1 = auth mock do Admin, 10.2 = dados de demonstração do Admin. As stories abaixo são a **contrapartida para o
Lojista**, mesmo espírito aditivo e mock-only. Próximos IDs livres: **10.3** e **10.4**.

> Sugestão ao @sm/@pm: atualizar o título do Épico 10 de "Admin: ..." para algo como "Demo Mock (Admin + Lojista)"
> ao adicionar estas stories, já que passa a cobrir os dois apps. (Decisão de @pm/@po — não bloqueia.)

### Story 10.3 — Semear conta + estabelecimento ativo do Lojista para o modo demo `[🔴 desbloqueador]`

- **Objetivo:** destravar a entrada na área logada (4 abas) no build mock, espelhando `clientesCredenciaisFixture`/Admin.
- **Arquivos:** CRIAR `packages/core-data/src/mock/fixtures/lojista-contas.ts`; EDITAR `packages/core-data/src/mock/db.ts`, `packages/core-data/src/mock/fixtures/index.ts`; (opcional B) `apps/lojista/src/screens/auth/Login.tsx`; testes de fixture + ajustes nos testes afetados de `core-data`.
- **AC resumidos:** login `lojista@keepit.com.br` + senha qualquer → MainTabs cheias; 1 entrada demo em cada array; `conta.id === donoUserId`; `status: 'ativo'`; `cadastro.id === 'estab-farmacia-vida'`; `sessionLojistaUserId` inicia `null`; wizard (signUp com outro e-mail) preservado; seed nunca em `source: 'supabase'`; suíte core-data verde; credencial documentada.
- **Estimativa:** ~0,5 dia (@dev fixtures/seed + ajuste de testes) + @qa. Sem lógica de negócio nova.
- **Depende de:** nada (é a fundação).

### Story 10.4 — PIN de retirada descobrível na demo `[🟡 polish]`

- **Objetivo:** tornar o PIN esperado visível/utilizável numa demo só-lojista, e fixar o PIN não-determinístico.
- **Arquivos:** EDITAR `apps/lojista/src/screens/pedidos/DigitarPin.tsx`; EDITAR `packages/core-data/src/mock/fixtures/pedidos.ts` (linha 40, remover `Math.random()`); teste de fixture.
- **AC resumidos:** dica mock-only mostra `pedido.pin_texto` no `no_hub`; digitar o PIN confirma a retirada; dica ausente em supabase; nenhum PIN usa `Math.random()`; lógica de `confirmPin` inalterada.
- **Estimativa:** ~0,25 dia (@dev) + @qa.
- **Depende de:** 10.3 (sem entrar na área logada não se alcança a tela DigitarPin).

**Ordem de execução:** 10.3 → 10.4. Cada uma segue o fluxo obrigatório `@dev` (Sonnet) → `@qa` (Opus).

---

## Fora de escopo de código

- **Credenciais de assinatura iOS do Lojista `[🔴 pré-requisito de build — @devops]`** (gap #2 do análise).
  `apps/lojista/` não tem `credentials/` (o Cliente tem `AuthKey.p8` + `dist.p12` + `profile.mobileprovision`,
  provisionados hoje). `eas.json` do Lojista referencia `credentials/AuthKey.p8` (submit) e usa
  `credentialsSource: local` (build iOS). **Tarefa de ops:** colocar `AuthKey.p8` (mesma chave ASC, reusável) em
  `apps/lojista/credentials/` e gerar `dist.p12` + `profile.mobileprovision` para o bundle `com.keepithub.lojista`
  (mesmo processo já feito no Cliente). `credentials/` é gitignored → provisionar localmente. **Não é Story de
  código; não bloqueia 10.3/10.4** (que são testáveis em mock via Metro/EAS Android APK), mas bloqueia
  `eas build/submit --platform ios`.
- **Ícone/splash próprios do Lojista** (gap #4, 🟢 cosmético) — cópia do Cliente hoje. Polish pré-submissão pública;
  não bloqueia TestFlight interno. Fora destas stories (candidato a @ux-design-expert).
- **Reconciliação de `CURRENT_ESTABELECIMENTO_ID` → identidade real do lojista logado** — débito já documentado em
  `lojistaSession.ts` ("carry-forward Épico 6+"). Não necessário para a demo.
- **Auditar `pin_texto` no `SELECT` de produção do lojista** (nota de segurança) — frente separada, fora do demo.

---

## Apêndice — Fatos verificados neste design

- `createMockDb()` (`mock/db.ts`) só roda em `source: 'mock'` → seed é intrinsecamente isolado de produção (mesmo mecanismo de `clientesCredenciaisFixture`/`saquesFixture`).
- `db.lojistaContas` e `db.estabelecimentosCadastrados` nascem `[]` (linhas 147/149 de `db.ts`).
- `Login.tsx` só chama `signInLojista()` no ramo `status === 'ativo'` (linha 138-141), resolvido por `resolveRotaPosLogin` (`lib/loginRouting.ts`).
- `lojista-auth.mock.ts#signIn` procura conta por e-mail em `db.lojistaContas`, senha nunca validada (paridade Cliente/Admin).
- `estabelecimento-cadastro.mock.ts#getMeuEstabelecimento` resolve por `donoUserId === sessionLojistaUserId` em `db.estabelecimentosCadastrados`.
- MainTabs usa `CURRENT_ESTABELECIMENTO_ID = 'estab-farmacia-vida'` fixo (`currentStore.ts`) de `db.estabelecimentos` (Descoberta, já ativo/rico). Único consumo de `getMeuEstabelecimentoId()` é `ProductCatalogContext`, e só em modo supabase.
- `Pedido.pin_texto` existe no tipo (`order.port.ts` linha 54) e está populado nas fixtures; acessível em `DigitarPin` via `getById`.
- `fixtures/pedidos.ts` linha 40 usa `Math.random()` para um `pin_texto` (gap #5).
- Épico 10 (`docs/prd/epics/10-admin-demo-mock.md`) é o épico de demo mock; 10.1/10.2 Done; próximos IDs livres 10.3/10.4.
- Precedente `saquesFixture`: migrou `db.saques` de `[]` para semeado e ajustou testes — o mesmo padrão se aplica ao seed do Lojista.
</content>
</invoke>
