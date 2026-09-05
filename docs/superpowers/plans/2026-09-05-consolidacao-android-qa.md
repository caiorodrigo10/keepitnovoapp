# Android QA Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidar terminologia e acessibilidade do beta Cliente, gerar um único APK Android QA mock rastreável e emitir um gate RC objetivo com evidência curta.

**Architecture:** Um label compartilhado remove variações visíveis de “Taxa de deslocamento” sem renomear o campo técnico. Acessibilidade é corrigida nos componentes reutilizáveis e protegida pelos contracts Vitest existentes. Depois do gate automatizado, somente o profile `demo-apk` gera o artefato usado em um smoke agrupado e em uma decisão PASS/FAIL.

**Tech Stack:** Expo 57, React Native 0.86, TypeScript 5.9, Vitest 1.2 e EAS CLI 23 já disponíveis; nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-09-04-estabilizacao-beta-android-cliente-design.md` (§§ 19–23) e `docs/stories/12.14.story.md`

## Global Constraints

- Esta story consolida e valida; não cria fluxo novo nem corrige silenciosamente bugs funcionais. Defeito funcional volta à story responsável e deixa o gate FAIL quando for CRITICAL/HIGH.
- **Recorte MVP aprovado para este plano:** gerar exatamente um APK Android QA mock com `demo-apk`. Não gerar staging, production, AAB, segundo tamanho de tela ou matriz combinatória; backend/staging permanece coberto pelos gates automatizados das stories responsáveis.
- “Frete” é copy; `taxa_deslocamento_reais`, DTOs, schema e cálculos permanecem iguais. Não adicionar linha/valor de frete a uma tela que hoje não o exibe.
- Reusar `interactionAccessibility`, `appHeaderContracts`, `formContracts` e componentes existentes. Sem renderer, ferramenta de auditoria ou pacote novo.
- O smoke usa um único aparelho/emulador disponível. Fonte ampliada e TalkBack entram como checagens rápidas no mesmo percurso, não como execuções/matrizes separadas.
- Build somente de commit limpo e aprovado. Perfil/Painel QA devem mostrar versão, `versionCode`, SHA, `mock`, `qa` e data sem `local`/`unknown`; o SHA exibido deve corresponder ao build EAS.
- Não publicar em loja. Evidência registra build ID/URL, hash do APK, dispositivo/Android, checklist, defeitos e decisão única PASS/FAIL.

---

### Task 1: Centralizar “Frete” e fechar contratos acessíveis

**Files:**
- Create: `packages/config/src/customer-labels.ts`
- Create: `packages/config/src/customer-labels.test.ts`
- Modify: `packages/config/src/index.ts`
- Modify: `apps/cliente/src/screens/home/Loja.tsx`
- Modify: `apps/cliente/src/screens/home/Checkout.tsx`
- Modify: `apps/cliente/src/screens/pedidos/Recibo.tsx`
- Modify as needed after audit: `apps/cliente/src/components/ui/interactionAccessibility.ts`
- Modify as needed after audit: `apps/cliente/src/components/ui/interactionAccessibility.test.ts`
- Modify as needed after audit: `apps/cliente/src/components/discovery/FavoriteButton.tsx`
- Modify as needed after audit: `apps/cliente/src/components/discovery/CategoryChips.tsx`
- Modify as needed after audit: `apps/cliente/src/components/checkout/SelectableRow.tsx`

- [ ] **Step 1: Escrever RED de copy e semantics.** Fixar `CUSTOMER_LABELS.freight === 'Frete'`; testar selected/checked/disabled/busy e labels de favoritar/desfavoritar nos helpers existentes. Registrar por inspeção quais controles reutilizáveis não atingem 48dp ou não expõem role/state/label.
- [ ] **Step 2: Aplicar apenas correções transversais.** Usar a constante nas superfícies que já exibem a cobrança (hoje Loja, Checkout e Recibo) e em qualquer mensagem existente encontrada após as Stories 12.1–12.13. Carrinho/Pagamento sem linha de cobrança não recebem UI nova. Corrigir labels, estados, touch targets e contraste de indisponível nos menores componentes compartilhados possíveis.
- [ ] **Step 3: Gate focado.**

  Run: `pnpm --filter @keepit/config test -- src/customer-labels.test.ts && pnpm --filter @keepit/cliente test -- src/components/ui/interactionAccessibility.test.ts src/components/ui/appHeaderContracts.test.ts src/components/ui/formContracts.test.ts`

  Run: `pnpm --filter @keepit/config typecheck && pnpm --filter @keepit/cliente typecheck`

  Run: `rg -n -i 'Taxa de deslocamento' apps/cliente/src --glob '*.tsx'`

  Expected: testes/typechecks PASS; o último comando não encontra copy visível (comentários técnicos devem ser distinguidos na revisão, sem renomear campos).
- [ ] **Step 4: Commit.** Commit `fix(cliente): consolidate freight and accessibility labels` apenas com correções terminológicas/acessíveis.

### Task 2: Executar o gate automatizado e gerar um APK QA rastreável

**Files:**
- Verify: `apps/cliente/eas.json`
- Verify: `apps/cliente/src/config/buildInfo.ts`
- Create: `docs/qa/epic-12-android-rc.md`

- [ ] **Step 1: Rodar qualidade antes do artefato.** Em worktree limpo, executar `pnpm qa`; repetir os testes focados de exclusão, recuperação, favoritos, pedidos, persistência e build metadata definidos nas Stories 12.1–12.13. Qualquer falha interrompe o build e é registrada com a story dona.
- [ ] **Step 2: Fixar e validar metadados do commit.** Ler `eas env:set --help`, `eas env:list --help`, `eas config --help` e `eas build --help`. Definir no environment `preview` `EXPO_PUBLIC_COMMIT_SHA=<git rev-parse HEAD>` e `EXPO_PUBLIC_BUILD_DATE=<UTC ISO-8601>`, ambos plaintext; não tocar secrets. Validar `eas env:list preview --format long --scope project` e `eas config --platform android --profile demo-apk --json` para `mock`, `qa`, QA enabled, SHA/data reais e `android.buildType=apk`.
- [ ] **Step 3: Gerar exatamente um artefato.** Executar `eas build --platform android --profile demo-apk --non-interactive --wait`. Registrar build ID/URL, versão, `versionCode`, SHA EAS e hash SHA-256 do APK em `docs/qa/epic-12-android-rc.md`. Não iniciar outro build.
- [ ] **Step 4: Commit da evidência inicial.** Commit `docs(qa): record epic 12 Android artifact`; se build/config falhar, registrar a falha e não avançar ao smoke.

### Task 3: Fazer um smoke curto e decidir o RC

**Files:**
- Modify: `docs/qa/epic-12-android-rc.md`

- [ ] **Step 1: Instalar o único APK e executar sete cenários agrupados.** Registrar PASS/FAIL para: (1) instalação limpa + seis metadados; (2) onboarding/login/teclado; (3) hub, loja, busca, carrinho e copy “Frete”; (4) pedido, avanço automático, abas/contador e recibo; (5) favoritos com rollback/indisponível; (6) recuperação demo; (7) exclusão, recuperação dentro do prazo, avanço QA além de sete dias, bloqueio e reset/restart. Usar os estados de erro do Painel QA em vez de matriz de rede.
- [ ] **Step 2: Checagem acessível no mesmo percurso.** Aumentar a fonte uma vez e ativar TalkBack nos controles críticos de voltar, seleção e favorito; confirmar leitura de label/state, alvo acionável e que CTA/campo obrigatório não fica encoberto. Registrar somente falhas e duas ou três capturas representativas.
- [ ] **Step 3: Emitir um gate único.** `PASS` somente se automação/build/smoke passaram e não há CRITICAL/HIGH aberto; caso contrário `FAIL` com links para story/defeito, sem implementar correção aqui. MEDIUM/LOW recebe owner e decisão explícita. Não criar matriz extra nem segundo APK.
- [ ] **Step 4: Commit final.** Commit `docs(qa): decide epic 12 Android release candidate` com o checklist, evidências e decisão.
