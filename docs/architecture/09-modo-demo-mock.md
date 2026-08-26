# 09 — Modo Demo (Mock) e Consolidação das Telas

> **Autor:** @architect (Aria) · **Status:** Proposta para aprovação do Caio · **Data:** 2026-08-13
> **Natureza:** ANÁLISE + PROPOSTA. Nenhum código foi implementado. Nenhum `git push`/merge foi executado (exclusivo do @devops mediante autorização).
> **Base de trabalho:** worktree `feat/higiene-tipos-docs` (`/root/projetos/keepitnovoapp/.worktrees/block-12-higiene`), tip cumulativo com TODAS as telas dos blocos 01–12.

## Objetivo do Caio (reformulado)

Os donos da Keepit precisam testar o app "como se estivesse pronto", com **dados mock realistas**, controlado por **uma flag única**:

- **Flag LIGADA** → modo teste/demo (100% mock, sem backend real, nada quebra).
- **Flag DESLIGADA** → produção (Supabase real, sem mock no bundle).

E a pergunta: dá para **consolidar os worktrees** numa única versão que contenha **todas as telas**?

**Resposta curta:** Sim para os dois. A arquitetura atual (Épico 0 — camada `core-data` com ports trocáveis mock/supabase) já foi desenhada exatamente para isto, e a flag já existe em build-time. A consolidação é um **fast-forward linear, zero conflito**. Faltam: (1) um **perfil de build** que dê nome à flag, (2) **corrigir o nome da env var no `eas.json`** (bug latente), e (3) **enriquecer as fixtures** para o demo "brilhar" e não aparecer "sempre fechado".

---

## 1. Auditoria de prontidão de demo (matriz por app)

### 1.1 Visão geral

| App | Telas | Roteadas/funcionais em MOCK | Órfãs | Apontam p/ `ScreenStub` | Dependentes de Bloco 10 (mas OK em mock) |
|-----|-------|------------------------------|-------|--------------------------|-------------------------------------------|
| **Cliente** | ~30 | ✅ Todas | 0 | 0 (stub não roteado) | ChegueiAoHub, CancelarPedido, LojistaNaoVeio |
| **Lojista** | ~40 | ✅ Todas | 0 | 0 (stub não roteado) | ClienteNaoApareceu, RecusarPedido |
| **Admin (web)** | 18 rotas | ✅ Todas | 0 | n/a | — |

### 1.2 `ScreenStub` — NÃO é ponta solta

`apps/cliente/src/screens/ScreenStub.tsx` e `apps/lojista/src/screens/ScreenStub.tsx` são um **factory** (`createScreenStub(nome)`) do Épico 0, Story 0.3 — geravam uma tela mínima até o conteúdo real chegar. **Verificado por grep:** nenhum navigator (`apps/*/src/navigation/*`) importa ou registra `ScreenStub` como rota. É código morto residual, não uma parede. Nenhuma rota de demo cai num stub.

> **Recomendação (não bloqueante):** remover os dois `ScreenStub.tsx` na varredura de higiene (Fase 3). Não afeta o demo.

### 1.3 Telas de ocorrência (Bloco 10) — funcionam em MOCK

As telas de exceção existem em UI **e estão roteadas** (verificado em `apps/cliente/src/navigation/PedidosStack.tsx` e `apps/lojista/src/navigation/PedidosStack.tsx`). O "Bloco 10 não construído" refere-se ao **backend real** dessas ocorrências — **irrelevante para o demo**, que roda em mock. Os métodos mock correspondentes **já estão implementados** em `packages/core-data/src/mock/order.mock.ts`:

| Tela | App | Método `OrderPort` | Implementado no mock? |
|------|-----|--------------------|------------------------|
| CancelarPedido | Cliente | `cancel(pedidoId, motivo)` | ✅ (linha ~220, já gera reembolso) |
| ChegueiAoHub | Cliente | `markClienteChegou` / `markArrivedAtHub` | ✅ |
| LojistaNaoVeio | Cliente | (fluxo de reclamação sobre pedido `no_hub`) | ✅ transições existem |
| RecusarPedido | Lojista | `refuse(pedidoId, motivo)` | ✅ (linha ~163) |
| ClienteNaoApareceu | Lojista | `markCustomerNoShow(pedidoId, motivo)` | ✅ (linha ~299) |

**Conclusão:** em modo mock, essas telas **funcionam de ponta a ponta** contra o "banco" in-memory. O gap de Bloco 10 é só de produção real.

### 1.4 Login/entrada de cada app em modo mock

- **Cliente:** `auth.mock` — `signIn` por e-mail contra `clientesCredenciaisFixture`; `signUp` cria conta na sessão. Onboarding persistido (Épico 2).
- **Lojista:** `lojistaAuth.mock` (`signUp`) + `lojistaSession.ts` (sessão mock local). Login real é Story 3.10 (fora do lote); em mock o wizard de cadastro e as telas de estado (EmAnalise/CadastroRejeitado/ContaIndisponivel) funcionam.
- **Admin:** `apps/admin/src/lib/adminAuth.ts` — modo mock faz `signIn` **por e-mail ignorando a senha** (`admin@keepit.com.br`), `sessionStorage`. Ideal para demo: o dono entra sem provisionar credenciais.

### 1.5 Pontas soltas concretas a tratar antes do demo (nenhuma é bloqueante-arquitetural)

1. **Cobertura de status de pedido no dataset** (ver §3): faltam alguns estágios (ex.: `aceito`, `saindo_hub`, `aguardando_retirada`) para a jornada mostrar TODA a esteira. Dado, não código.
2. **`eas.json` usa o nome de env var errado para Expo** (ver §2.4): `DATA_SOURCE` em vez de `EXPO_PUBLIC_DATA_SOURCE`. Hoje passa despercebido porque mock é o default — mas o perfil `production` **não vai trocar para supabase** se não for corrigido.
3. **Carteira do Lojista** parte de `saques: []` — extrato/saldo derivam dos pedidos `entregue`/`concluído`; garantir massa suficiente + 1 saque semeado para o extrato não ficar vazio (ver §3.4).

---

## 2. Design da FLAG de modo demo

### 2.1 O que já existe (não reinventar)

A flag **já existe em build-time** e foi desenhada no Épico 0/1.9/2.5.1:

- `packages/core-data/src/index.ts` → `createDataClient({ source })` + `resolveDataSource()`; **default `'mock'`**; só `'supabase'` (exato) ativa o backend real.
- **Cliente:** `apps/cliente/src/lib/dataClientBootstrap.ts` — lê `EXPO_PUBLIC_DATA_SOURCE`; fallback gracioso p/ mock se `createClient()` falhar (sem tela branca).
- **Lojista:** `apps/lojista/src/lib/dataClientBootstrap.ts` — **simétrico** ao Cliente (verificado). Mesmo gate `EXPO_PUBLIC_DATA_SOURCE`, mesmo fallback.
- **Admin (Next.js):** `apps/admin/src/lib/dataClientBootstrap.ts` — lê `DATA_SOURCE` **sem prefixo** (Next não expõe `EXPO_PUBLIC_*`).
- Helpers de leitura já existem: `apps/cliente/src/lib/dataSource.ts`, `apps/lojista/src/lib/dataSource.ts`.

> **Semântica exata da flag hoje:** ausente / vazia / qualquer valor ≠ `'supabase'` → **mock**. Só `EXPO_PUBLIC_DATA_SOURCE=supabase` (apps) ou `DATA_SOURCE=supabase` (admin) → **produção**. Ou seja: **o default seguro já é demo**; produção é opt-in explícito. Isso encaixa perfeitamente no pedido "desligada = produção" apenas invertendo a leitura mental: **não configurar nada = modo teste**.

### 2.2 Opção A — Perfil de build EAS (RECOMENDADA)

Dois perfis em `eas.json`, um por semântica de flag:

```jsonc
// apps/cliente/eas.json e apps/lojista/eas.json
"build": {
  "demo":       { "env": { "EXPO_PUBLIC_DATA_SOURCE": "mock" },     "android": { "buildType": "app-bundle" } },
  "production":  { "env": { "EXPO_PUBLIC_DATA_SOURCE": "supabase" }, "android": { "buildType": "app-bundle" } }
}
```

Gera **2 APKs**: `demo` (mock) e `production` (supabase). O código mock **não entra** no bundle de produção via tree-shaking (o `if (dataSource === 'supabase')` isola o import do supabase-client; o ramo mock é o default e o supabase é dead-code no build demo, e vice-versa na medida em que o bundler elimina o ramo não usado — ganho de segurança + peso).

**Trade-offs:**

| | Prós | Contras |
|---|------|---------|
| **A — Build profile** | Mock fora do bundle de produção (segurança + peso); alinhado à arquitetura atual (build-time); zero UI nova (fidelidade ao protótipo); casa com o piloto Android via EAS; "banco" mock recomeça limpo a cada build/instalação | Precisa gerar 2 builds; trocar de modo = reinstalar o APK (aceitável: o dono usa o APK `demo`, a loja recebe o `production`) |

### 2.3 Opção B — Toggle runtime in-app (NÃO recomendada)

Uma tela/gesto de dev troca mock↔prod em runtime; 1 APK só.

**Trade-offs:**

| | Prós | Contras |
|---|------|---------|
| **B — Toggle runtime** | 1 APK único; troca sem reinstalar | **Mock vai no bundle de produção** (peso + superfície de risco: um gesto acidental liga mock em produção); o "banco" mock é in-memory e **reseta a cada reload**; exige UI/estado novos (fere princípio nº2 "backend simples" e nº1 "fidelidade ao protótipo"); `getDataClient()` **memoiza a 1ª chamada** — trocar em runtime exigiria resetar o singleton e re-montar toda a árvore (complexidade real) |

### 2.4 BUG latente a corrigir (independe da opção)

O perfil `pilot` atual em `apps/cliente/eas.json` e `apps/lojista/eas.json` define:

```jsonc
"env": { "DATA_SOURCE": "mock" }   // ❌ nome sem prefixo
```

Mas os apps Expo leem **`EXPO_PUBLIC_DATA_SOURCE`** (só vars com esse prefixo são inlineadas no bundle nativo RN). Hoje "funciona" **por acidente** — mock é o default quando a var esperada está ausente. **Consequência:** se criarem um perfil `production` com `DATA_SOURCE=supabase` (sem prefixo), **o app continuará em mock**. A correção (`EXPO_PUBLIC_DATA_SOURCE`) é obrigatória para a flag ser confiável nos dois sentidos. (O admin está correto: usa `DATA_SOURCE` sem prefixo, que é o certo para Next.js.)

### 2.5 Recomendação

**Opção A (perfis de build EAS)**, pelos motivos: segurança (mock fora de produção), simplicidade (nenhuma UI/estado novo — respeita princípios nº1 e nº2 do `CLAUDE.md`), e aderência ao piloto Android já em EAS. A flag "mora" em `eas.json` (`env.EXPO_PUBLIC_DATA_SOURCE` nos apps; `env.DATA_SOURCE` no admin). Semântica: perfil `demo`=mock (ligada), perfil `production`=supabase (desligada).

---

## 3. Plano de MOCK REALISTA (resolve o "sempre fechado")

### 3.1 Diagnóstico do "sempre fechado"

`deriveLojaEstado(estabelecimento, now = new Date())` em `packages/core-data/src/ports/store.port.ts`:

- `pausado_manualmente = true` → **sempre 'pausada'**.
- Senão, usa **hora/dia do device** (`now.getDay()`, `now.getHours()`): fora de `hora_abre ≤ agora < hora_fecha` → **'fechada'**.

As fixtures atuais usam `09:00–19:00` (`horarioPadrao`) e há casos propositais fechados (Bem Vestir `pausado_manualmente=true`; Conveniência 24h fecha domingo). **Fazer o demo fora do horário comercial → maioria aparece Fechada.** Isso NÃO é bug de lógica (a regra temporal é correta e fail-closed, herdada do Bloco 05) — é **realismo de DADO de teste** inadequado para demo.

### 3.2 Solução: ajustar o DADO, não a regra (nem inventar regra de negócio)

> **Importante (governança):** ampliar horário de fixtures de demonstração é **dado de teste**, não regra de negócio. Não muda taxa, prazo, política nem a lógica de `deriveLojaEstado`. Portanto **não requer decisão do stakeholder** e não vai para `PERGUNTAS_REGRAS_NEGOCIO.md`.

**Estratégia "sempre parecer no ar, sem perder realismo":**

- **Maioria das lojas de demo** com horário amplo `00:00–23:59` nos 7 dias → sempre **'aberta'** independentemente da hora/dia do device. Naturalidade preservada: são lojas "sempre abertas" plausíveis (conveniência, farmácia 24h, etc.).
- **1–2 exemplos propositais** de estado não-aberto, para o dono ver os 3 estados (fidelidade ao protótipo, que mostra Aberta/Fechada/Pausada): manter **uma** loja `pausado_manualmente=true` (Pausada) e **uma** com horário estreito ou fechada em um dia (Fechada). Assim o demo exibe a variedade sem "tudo quebrado".
- **Zero alteração** em `deriveLojaEstado` ou na validação temporal do Bloco 05.

### 3.3 Estado atual das fixtures (melhor do que o esperado)

Auditoria (worktree block-12) — as fixtures **já foram enriquecidas** além do que o briefing supunha:

| Fixture | Conteúdo atual | Suficiente p/ demo? |
|---------|----------------|----------------------|
| `estabelecimentos.ts` | **7 lojas**: Farmácia Vida (ativa), Bem Vestir (pausada), Conveniência 24h (fecha dom), Mercadinho Noturno (suspenso), + 3 `em_analise` (Padoca, Mercado do Bairro, Pet Shop) | Cobre status; **falta ampliar horários** e variedade de categoria "aberta agora" |
| `hubs.ts` | 3 hubs (Centro/Jardins/Vila Nova), 08:00–20:00 | OK; ampliar p/ 00:00–23:59 evita "hub fechado" no demo noturno |
| `produtos.ts` | 15 produtos com foto (Unsplash) + preço | OK; distribuir entre mais lojas |
| `pedidos.ts` | Vários status: `aguardando_aceite`, `em_preparo`, `no_hub`, `entregue`, `recusado` | **Falta** `aceito`, `saindo_hub`, `aguardando_retirada`, `cancelado`, `concluido` p/ esteira completa |
| `reembolsos.ts`, `falhas.ts` | Semeados (fila do admin não-vazia) | OK |
| `saques` | `[]` (vazio) | **Semear** 1–2 p/ extrato do lojista e fila de saques do admin |

### 3.4 Escopo do enriquecimento (dado estático, não engine de seed)

**Decisão de arquitetura:** manter **fixtures estáticas** carregadas via `structuredClone` na criação do `MockDb` (`createMockDb()`), **não** um "seed engine" runtime. Justificativa (princípio nº2 — backend simples): o padrão atual já entrega estado pré-populado determinístico; o `MockDb` é in-memory e **recomeça do estado rico a cada abertura do app** — o que para um demo é **desejável** (start previsível, "reset" grátis). Nada de sofisticação.

**Trabalho proposto (fixtures + eventuais ajustes mock):**
1. **Horários amplos** (`00:00–23:59`) na maioria das lojas/hubs; manter 1 Pausada + 1 Fechada intencionais.
2. **Mais lojas por categoria** (farmácia, mercado, alimentação, pet, conveniência, vestuário) — dataset de ~8–12 lojas ativas "abertas agora" para a Home/Descoberta parecer um marketplace de verdade.
3. **Produtos** com foto/preço distribuídos entre as lojas ativas (reusar o padrão Unsplash já existente).
4. **Pedidos cobrindo TODA a esteira** (novo/aceito/em preparo/saindo/no hub/entregue/concluído/cancelado) para Cliente e Lojista — a jornada "brilha".
5. **Carteira**: massa de pedidos `entregue`/`concluído` suficiente para saldo/extrato não-trivial + **1 saque semeado** (extrato do lojista + fila de saques do admin).
6. **Filas do admin** (reembolso/saque/aprovação/qualidade) já têm itens; confirmar que cada uma abre com ≥2 itens.

**Esforço estimado:** ~1–1,5 dia de @dev (é edição de fixtures + testes de fixture; sem lógica nova), + @qa. Nada aqui toca ports nem regra de negócio.

---

## 4. Plano de consolidação (merge) dos worktrees

### 4.1 Topologia verificada (cadeia linear)

```
main (702f4c5)
  └─ 3af1c37  blocos 01–03 (auth cliente/lojista/admin, hubs, catálogo)  [feat/keepit-real-backend]
      └─ 49a8320  Bloco 04 Descoberta
          └─ 7a5a070  Bloco 05 Carrinho+Checkout
              └─ 0f3ef17  Bloco 06 Pedido
                  └─ 4e787df  Bloco 07 Retirada c/ PIN
                      └─ 71af8ec  Épico 7 Carteira & ledger
                          └─ f2f8b3d  Épico 8 Admin Ops
                              └─ f5a7d26  higiene tipos+docs  [feat/higiene-tipos-docs] ← TIP
```

- **Verificado:** `git merge-base --is-ancestor main feat/higiene-tipos-docs` = **true**. `git merge-base main feat/higiene-tipos-docs` = `702f4c5` (= o próprio `main`). São **8 commits lineares** acima de `main`. Cada bloco ⊂ o próximo.
- **Logo:** consolidar tudo numa única versão com TODAS as telas = **fast-forward de `main` até `f5a7d26`. Zero conflito.**

### 4.2 Ressalva importante — `main` não é 3af1c37

O briefing dizia "main (3af1c37)". **Correção factual verificada:** `main` = **702f4c5**; `3af1c37` é o tip de `feat/keepit-real-backend` (blocos 01–03) e é o branch atualmente **checked-out no worktree primário** (`/root/projetos/keepitnovoapp`). Ambos são ancestrais de `feat/higiene`, então o ff continua válido — mas o alvo do ff é `main`→`f5a7d26` (8 commits), não `3af1c37`→`f5a7d26` (7 commits).

> O header de sessão dizia "Current branch: main", mas `git worktree list` mostra o worktree primário em `feat/keepit-real-backend @ 3af1c37`. **@devops deve reconciliar** qual branch o worktree primário deve apontar antes do ff (fora do meu escopo — não faço checkout/merge/push).

### 4.3 Os ~10 arquivos uncommitted do worktree primário — já refletidos

**Verificado (6/6 spot-checks):** todos os arquivos listados como untracked/modificados no worktree primário **já estão committados** no tip do block-12:

| Arquivo (uncommitted no primário) | Está no tip f5a7d26? |
|-----------------------------------|----------------------|
| `apps/cliente/eas.json` | ✅ TRACKED |
| `apps/lojista/eas.json` | ✅ TRACKED |
| `apps/admin/src/lib/adminAuth.ts` | ✅ TRACKED |
| `apps/lojista/src/navigation/lojistaSession.ts` | ✅ TRACKED |
| `apps/admin/src/components/RequireAdminSession.tsx` | ✅ TRACKED |
| `docs/architecture/08-mvp-pilot-android.md` | ✅ TRACKED |

Motivo: o worktree primário está em `feat/keepit-real-backend` (blocos 01–03); esses arquivos foram committados em branches de blocos posteriores, por isso aparecem "untracked/modificados" lá. **Conclusão:** os uncommitted do primário são cópias iguais ou mais antigas do que já está no tip — **seguros de descartar/stash**. Recomendação: `git stash` (ou descartar após diff de confirmação) no worktree primário antes do ff, para não arrastar versões velhas. Confirmar com `git diff feat/higiene-tipos-docs -- <arquivo>` cada um (@devops).

### 4.4 Worktrees órfãos (lixo a limpar)

`git worktree list` mostra 3 órfãos de stories já mergeadas na cadeia: `story-2.5.1`, `story-2.6`, `story-2.7`. **Remover** com `git worktree remove` (@devops). Também há worktrees por-bloco (`block-04`…`block-09`) — manter até a consolidação, remover depois.

### 4.5 Sequência segura proposta (executada pelo @devops, com autorização do Caio)

1. No worktree primário: `git stash` (ou descartar) os ~10 uncommitted após confirmar por diff que já estão no tip.
2. `git checkout main` (no worktree que deve carregar `main`) → `git merge --ff-only feat/higiene-tipos-docs`. Se `--ff-only` falhar, PARAR (significaria que a topologia mudou) — não forçar.
3. Rodar `pnpm qa` (gate local; CI está waived na conta — ver memória do projeto) nos 3 apps.
4. `git worktree remove` dos 3 órfãos (2.5.1/2.6/2.7).
5. **`git push` / PR = @devops, mediante autorização explícita do Caio.**

### 4.6 Mergear TUDO agora ou só até block-12?

**Recomendo mergear TUDO até `f5a7d26` (block-12) agora.** É o tip cumulativo, contém todas as telas dos blocos 01–12, é ff puro (zero risco de conflito), e é exatamente "a versão com todas as telas" que o Caio pediu. Não há ganho em parar antes: cada bloco é ancestral do próximo, então um merge parcial só adiaria o resto sem reduzir risco.

---

## 5. Proposta final para o Caio (GO / ajustar)

Plano faseado. Cada fase é independente e entrega valor sozinha.

### Fase 1 — Consolidar + flag + smoke (fundação)
**O quê:** ff-merge `main`→block-12 (§4.5); adicionar perfis `demo`/`production` no `eas.json` dos 2 apps + corrigir `EXPO_PUBLIC_DATA_SOURCE` (§2.4); smoke test de abertura dos 3 apps em modo mock.
**Esforço:** ~0,5 dia (@devops merge + @dev config + @qa smoke).
**Entrega:** 1 build `demo` instalável com todas as telas, tudo em mock.
**Risco:** baixíssimo (ff puro; flag já existe). Único risco real: reconciliar branch do worktree primário (§4.2) — @devops.

### Fase 2 — Fixtures realistas (o "brilho")
**O quê:** enriquecer dataset (§3.4): horários amplos, ~8–12 lojas abertas, produtos distribuídos, pedidos cobrindo toda a esteira, carteira com saldo/extrato + saque, filas do admin com itens.
**Esforço:** ~1–1,5 dia (@dev fixtures + testes de fixture) + @qa.
**Entrega:** demo que parece produto pronto; some o "sempre fechado".
**Risco:** baixo (só dado; não toca ports nem regra de negócio).

### Fase 3 — Varredura de pontas soltas (polimento)
**O quê:** remover `ScreenStub.tsx` (×2) mortos; confirmar cada fila/tela abre com conteúdo; limpar worktrees por-bloco após consolidação; checklist de "clicar em tudo" nos 3 apps.
**Esforço:** ~0,5 dia (@dev + @qa).
**Entrega:** nenhuma "parede" no demo.
**Risco:** baixo.

### O que fica de FORA (explícito)
- Backend real de Bloco 10 (ocorrências) — demo usa mock, não precisa.
- Persistência do "banco" mock entre reloads — in-memory reseta a cada abertura (é feature p/ demo).
- Troca mock↔prod em runtime (Opção B) — descartada por segurança/simplicidade.
- Qualquer regra de negócio pendente em `PERGUNTAS_REGRAS_NEGOCIO.md` — o demo não fecha nenhuma; só usa dado de teste.
- iOS: a flag e as fixtures valem para iOS também, mas o piloto atual é Android/EAS (conta Apple à parte).

### Recomendação do @architect
**GO nas 3 fases, em ordem.** Fase 1 já entrega "todas as telas testáveis em mock hoje". Fases 2–3 transformam "testável" em "parece pronto". Total ~2,5–3,5 dias de trabalho, risco baixo, zero decisão de negócio necessária.

---

## Apêndice — Fatos verificados nesta análise

- Flag build-time mock/supabase: `createDataClient`/`resolveDataSource` (default mock) + bootstraps simétricos Cliente/Lojista (`EXPO_PUBLIC_DATA_SOURCE`) e Admin (`DATA_SOURCE`). Fallback gracioso p/ mock.
- `eas.json` (Cliente+Lojista) tem perfil `pilot` com `env.DATA_SOURCE:mock` — **nome errado** para Expo (deveria ser `EXPO_PUBLIC_DATA_SOURCE`); só "funciona" por o mock ser default.
- `ScreenStub` (×2) = factory do Épico 0, **não roteado** em nenhum navigator.
- Telas de ocorrência (Bloco 10) roteadas nos 2 apps e com métodos mock implementados (`cancel`/`refuse`/`markCustomerNoShow`/`markArrivedAtHub`/`markClienteChegou`).
- `deriveLojaEstado` usa hora/dia do device → fixtures 09:00–19:00 aparecem fechadas fora do horário. Solução = ampliar horários no DADO de demo (não é regra de negócio).
- Fixtures atuais: 7 lojas (multi-status), 3 hubs, 15 produtos, pedidos multi-status, reembolsos/falhas semeados, `saques` vazio.
- Merge: `main`=702f4c5, tip=f5a7d26, `main` é ancestral, 8 commits lineares → **ff puro, zero conflito**. `3af1c37`=`feat/keepit-real-backend` (worktree primário), não `main`.
- ~10 uncommitted do worktree primário: **6/6 spot-checked já committados no tip** → seguros de descartar/stash.
- 3 worktrees órfãos (story-2.5.1/2.6/2.7) a remover.
</content>
