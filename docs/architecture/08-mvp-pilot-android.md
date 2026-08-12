# 08 — Piloto MVP: Android / Google Play Internal Testing (mock)

> **Autor:** @architect (Aria) — análise de arquitetura/impacto, 2026-08-09.
> **Natureza:** documento de análise e recomendação. Não implementa código nem
> altera config. As stories de execução serão draftadas pelo @sm.
> **Complementa:** `07-mvp-pilot-backend.md` (overlay do piloto) e a **Fase 0**
> do Épico 9 (`docs/prd/epics/9-publicacao-compliance.md`, iOS/TestFlight).

## 1. Objetivo e enquadramento

Replicar, para **Android / Google Play Internal Testing**, o piloto iOS já
entregue (Fase 0 do Épico 9, Stories 9.0.1–9.0.8). Alvo concreto: um **AAB de
cada app** (Cliente e Lojista) na **faixa Internal Testing** do Google Play
Console, rodando `DATA_SOURCE=mock`, instalável pelos testadores internos via
Play Store.

Esta fatia é **paridade de plataforma**, não nova capacidade de produto:
mesmo código cross-platform, mesmas fixtures, mesma UI. O trabalho é
essencialmente **config de build + provisionamento de conta**, exatamente como
foi no iOS. Nenhuma regra de negócio nova.

**Princípio-guia (herdado da Fase 0):** o profile de build fixa `DATA_SOURCE=mock`
para impedir ligação acidental ao backend; nenhuma fixture de
`packages/core-data/src/mock` é alterada; paridade visual total com o build iOS.

## 2. Estado atual verificado (fonte: leitura dos arquivos)

| Item | Cliente | Lojista | Evidência |
|---|---|---|---|
| Expo SDK / RN | `~57.0.8` / `0.86.0` | `~57.0.8` / `0.86.0` | `apps/cliente/package.json`, `apps/lojista/package.json` |
| `version` | `1.0.0` | `1.0.0` | `app.json:6` (cliente), `app.json:6` (lojista) |
| `ios.bundleIdentifier` | `com.keepithub.cliente` | `com.keepithub.lojista` | `apps/cliente/app.json:13`, `apps/lojista/app.json:12` |
| `ios.buildNumber` | `"1"` | `"1"` | `app.json:14` / `app.json:13` |
| Bloco `android` | adaptiveIcon + `predictiveBackGestureEnabled:false` | idem | `apps/cliente/app.json:19-27`, `apps/lojista/app.json:18-26` |
| **`android.package`** | **AUSENTE** | **AUSENTE** | (não existe nos app.json) |
| **`android.versionCode`** | **AUSENTE** | **AUSENTE** | (não existe nos app.json) |
| Adaptive icons em `assets/` | presentes (`android-icon-foreground/background/monochrome.png`) | presentes | referenciados nos app.json |
| `scheme` | `com.keepithub.cliente` | **AUSENTE** | `apps/cliente/app.json:5` (lojista não tem) |
| `eas.json` build `pilot` | `distribution: "store"`, `credentialsSource: "local"`, `ios:{}`, `env.DATA_SOURCE=mock` | idem | `apps/cliente/eas.json:5-14`, `apps/lojista/eas.json:5-14` |
| **Bloco `android` no build** | **AUSENTE** | **AUSENTE** | `eas.json` só tem `ios:{}` |
| `submit.pilot.ios` (ASC key) | presente | presente | `eas.json:15-24` |
| **`submit.pilot.android`** | **AUSENTE** | **AUSENTE** | — |
| `cli.appVersionSource` | `"local"` | `"local"` | `eas.json:2-4` |
| Credenciais no repo | só Apple (`AuthKey.p8`, `dist.p12`, `profile.mobileprovision`) | só Apple | `apps/*/credentials/`, `apps/*/credentials.json` |
| **Keystore Android** | **AUSENTE** | **AUSENTE** | — |
| EAS `projectId` | `4335faeb-…` | `e6fd72af-…` | `app.json:44` / `app.json:43` |

**Observação de config relevante:** o build `pilot` usa `distribution: "store"`
(não `"internal"`). Isso é **correto e favorável** para o alvo Android: `store`
produz um **AAB** assinável para o Play Console; `internal` produziria um APK
para sideload. O mesmo profile que gera IPA no iOS gera AAB no Android sem mudar
a distribuição. (Nota: a AC2 original da Story 9.0.2 no épico dizia `internal`,
mas o arquivo real ficou `store` — que é o que serve para submeter à loja.)

**`appVersionSource: "local"`** significa que `versionCode` (Android) e
`buildNumber` (iOS) vêm dos valores locais do `app.json`, não são
auto-incrementados pela conta EAS remota. Portanto, para Android, é **obrigatório
declarar `android.versionCode` no app.json** e incrementá-lo manualmente a cada
novo upload à mesma faixa (ver §7).

## 3. Gap técnico por app

O gap é **idêntico** entre Cliente e Lojista (só mudam os identificadores). Nada
de código de aplicação precisa mudar — o código já é cross-platform, sem
`Platform.OS`, e as correções de sessão mock (9.0.4) e ocultação de dev (9.0.5)
já valem para Android.

### 3.1 Em `app.json` (por app) — trabalho @dev

1. **`android.package`** (obrigatório; imutável após publicar — ver §4).
   - Cliente: propor `com.keepithub.cliente`
   - Lojista: propor `com.keepithub.lojista`
2. **`android.versionCode`**: `1` (inteiro; obrigatório com `appVersionSource:
   local`; Play rejeita reenvio com o mesmo `versionCode`).
3. **Permissões Android**: por padrão o Expo injeta um conjunto base. Como o app
   roda em mock e (conforme AC3 da 9.0.1) não dispara câmera/localização/push
   reais, recomenda-se **declarar `android.permissions: []`** (lista vazia) para
   remover permissões supérfluas do AndroidManifest e evitar ruído/perguntas no
   Data Safety. Confirmar caso `ModalPermissaoPush` chegue a solicitar push
   nativo (mesmo tratamento da 9.0.1 AC3 no iOS) — se não solicita, nada a
   declarar.
4. **`scheme` no Lojista**: o Cliente tem `scheme` (`app.json:5`), o Lojista não.
   Não é bloqueante para instalar/abrir em mock, mas por consistência de deep
   link e para evitar warning de config, recomenda-se adicionar
   `scheme: "com.keepithub.lojista"` ao Lojista. (Marcar como opcional/nice.)

Adaptive icon e splash já estão configurados e os assets existem — **nenhum
trabalho de ícone/splash Android é necessário** (paridade com 9.0.3 já coberta
pelos assets presentes).

### 3.2 Em `eas.json` (por app) — trabalho @dev

1. **Bloco `android` no build `pilot`**: adicionar
   `"android": { "buildType": "app-bundle" }` ao profile (gera AAB, formato
   exigido pela Play Store). O `env.DATA_SOURCE=mock` já está no nível do profile
   e vale para ambas as plataformas — **não duplicar nem divergir** (garante a
   fidelidade mock).
2. **`submit.pilot.android`**: adicionar bloco de submit apontando para:
   - `serviceAccountKeyPath`: caminho do JSON da **service account** do Google
     Play (segredo — ver §5 e §6, gerado por ops/@devops, **não committado**).
   - `track: "internal"` (faixa Internal Testing).
   - opcional `releaseStatus: "completed"` / `changesNotSentForReview: true`
     conforme necessidade — decidir na story de @devops.
3. Manter `credentialsSource` coerente com a decisão de keystore (§4). Se
   EAS-managed, pode-se **remover a dependência de `credentialsSource: local`
   para Android** ou deixar o EAS gerenciar a keystore remotamente enquanto o iOS
   segue `local`. Recomendação em §4.

## 4. Nomes de package e imutabilidade

**Recomendação (paralela aos bundle IDs iOS já decididos):**

- Cliente: **`com.keepithub.cliente`**
- Lojista: **`com.keepithub.lojista`**

Trade-off/nota: no Android o `applicationId` (package) é **imutável após o
primeiro upload ao Play Console** — trocar depois exige criar um novo app na
loja (perde faixa, testadores, histórico). É a mesma restrição dos bundle IDs
iOS. Usar os mesmos strings dos bundle IDs iOS é a escolha natural e já
convencionada pelo projeto, mas **não é automático**: no Android o package vive
no seu próprio namespace.

> **[BLOQUEIO DE CONFIRMAÇÃO — Caio]** Assim como os bundle IDs iOS foram
> confirmados por Caio em 2026-07-31 antes de commitar, os **`android.package`
> devem ser confirmados por Caio antes de qualquer commit/publish**. Não
> committar valores presumidos. (Não é regra de negócio, mas é decisão
> irreversível de infraestrutura.)

## 5. Keystore, assinatura e Google Play App Signing

Fundo mínimo: todo APK/AAB Android precisa ser assinado. O Google Play usa o
esquema **Play App Signing**: você faz upload assinado com uma **upload key**; o
Google re-assina com a **app signing key** que ele guarda. Para o piloto, o
caminho de menor atrito é deixar o **EAS gerenciar a keystore** (upload key).

**Opção A — EAS-managed keystore (RECOMENDADA para o piloto):**
- `eas build` gera e guarda a keystore no servidor EAS (org `keepithub`).
- Zero arquivo de keystore no repo; zero gestão manual de senhas.
- Play App Signing assume a chave de assinatura final.
- Trade-off: a upload key vive na conta EAS; para o piloto interno é aceitável.
- **Divergência iOS:** o iOS hoje usa `credentialsSource: local` (dist.p12 +
  mobileprovision no repo, ignorados no git). Para Android, recomenda-se
  **EAS-managed** — mais simples que gerar keystore local. Isso significa que o
  profile pode ter credenciais Android geridas pelo EAS mesmo com iOS local; são
  ortogonais por plataforma.

**Opção B — keystore local:**
- Gerar `.jks` local, referenciar em `credentials.json`.
- Mais controle, porém adiciona um segredo a gerenciar e proteger.
- Só justifica se houver política de posse total das chaves — **overkill para o
  piloto**.

**Recomendação:** Opção A (EAS-managed) para o piloto. Se/quando o go-live real
(Story 9.10) exigir posse formal das chaves, reavaliar migração para keystore
gerenciada/controlada pela Keepit.

> **Red flag de gitignore:** hoje o `.gitignore` ignora `apps/*/credentials.json`
> e `apps/*/credentials/`. Se a Opção B (keystore local) for escolhida, o `.jks`
> e a service-account JSON **devem** cair sob esses padrões (ou novos) — nunca
> committar keystore nem service account. Com a Opção A, não há keystore local,
> mas a **service-account JSON do Play (§6) continua sendo segredo** e não pode
> ser committada.

## 6. Fluxo Google Play Internal Testing vs TestFlight interno

| Aspecto | TestFlight interno (iOS, feito) | Play Internal Testing (Android, alvo) |
|---|---|---|
| Conta necessária | Apple Developer Program (US$99/ano) — já contratado | **Google Play Developer (US$25 one-time)** — **PRÉ-REQUISITO, ver §8** |
| Registro do app | app record no App Store Connect (Story 9.0.6) | criar app no Play Console + faixa Internal Testing |
| Automação de upload | `eas submit` + ASC API key (`.p8`) | `eas submit` + **service account JSON** com papel no Play Console |
| Testadores | Apple IDs adicionadas como usuários internos | **lista de e-mails** (Google accounts) na faixa Internal Testing |
| Nº de testadores | até 100 usuários internos | até 100 por lista de Internal Testing |
| Revisão de conteúdo | sem Beta App Review p/ internos | **Internal Testing normalmente sem review** — disponível em minutos |
| Tempo até disponível | minutos (processamento Apple) | minutos (processamento Google) |
| Formato do binário | IPA | **AAB** (app-bundle) |

**Pré-requisitos do fluxo Android (mapeados a executor em §7):**

1. Conta Google Play Developer paga (US$25) — **ops/negócio** (§8).
2. Dois apps criados no Play Console com os `android.package` (§4) —
   **ops/@devops**.
3. **Service account** no Google Cloud + concessão de acesso à API do Play +
   download do JSON de credenciais — **ops/@devops** (equivalente à ASC API key
   do iOS).
4. Faixa **Internal Testing** configurada em cada app, com **lista de e-mails**
   dos testadores — **ops/@devops** (e-mails fornecidos por Caio/stakeholder).
5. Requisitos de formulário do Play Console para **Internal Testing**:
   - **Content rating** e **Data Safety form**: no Play Console, o app precisa de
     alguns formulários preenchidos para sair de "draft", mas a **faixa Internal
     Testing é a mais permissiva** — em geral **não exige política de privacidade
     publicada nem screenshots de vitrine** para rodar (essas exigências são das
     faixas Closed/Open/Production e do go-live, Story 9.10). **Verificar no
     Console no momento**: o Google ajusta esses gates; se um formulário mínimo
     for exigido, é preenchimento de ops, sem impacto de código. **Não inventar
     que já está aprovado.**
   - **URL de política de privacidade:** para Internal Testing costuma ser
     opcional; torna-se obrigatória em produção (Story 9.10 AC3). Tratar como
     "provável não-exigido agora, confirmar no Console".

## 7. Divisão de autoridade AIOX

Seguindo `.claude/rules/agent-authority.md` e o padrão já usado na Fase 0 iOS:

| Trabalho | Executor | Observação |
|---|---|---|
| `android.package`, `android.versionCode`, `permissions:[]`, `scheme` lojista em `app.json` | **@dev** | versiona config; commit só após confirmação de Caio dos packages |
| Bloco `android` (app-bundle) + `submit.pilot.android` em `eas.json` | **@dev** | escreve config; `serviceAccountKeyPath` aponta p/ arquivo não-committado |
| Roteiro de smoke Android (mock) | **@dev** escreve / stakeholder executa | análogo à 9.0.8 |
| `eas build --platform android --profile pilot` (gera AAB) | **@devops** | exclusivo |
| Gerar/gerir keystore (EAS-managed) | **@devops** | exclusivo (credenciais) |
| `eas submit --platform android` (track internal) | **@devops** | exclusivo |
| Vincular conta Expo/EAS e service account do Play | **@devops** | exclusivo (infra/segredos) |
| Criar app no Play Console + faixa Internal + lista de testadores | **@devops** (operação de console) | requer conta já criada |
| **Criar a conta Google Play Developer (US$25)** | **ops/humano (Caio/stakeholder)** | pré-requisito de negócio (§8) |
| Fornecer e-mails Google dos testadores | **ops/humano (Caio/stakeholder)** | insumo p/ faixa interna |
| Confirmar `android.package` finais | **ops/humano (Caio)** | decisão irreversível |
| Quality gate das stories de infra | **@architect** | mesma verificação da 9.0.7 (profile pilot + mock + apps na faixa interna) |
| Quality gate das stories de config (@dev) | **@qa** | fluxo padrão CLAUDE.md |

## 8. Pré-requisitos de ops / negócio (sinalizados, NÃO assumidos)

1. **[NEGÓCIO — BLOQUEIO] Conta Google Play Developer (US$25, pagamento único).**
   Diferente do iOS (Apple Developer já contratado), **a conta Google Play ainda
   não existe/está confirmada**. É custo + decisão do stakeholder/Caio de
   **publicar no Android agora**. **Não está aprovado por padrão** — sinalizar e
   aguardar confirmação antes de iniciar as stories de @devops/ops. As stories de
   @dev (config em app.json/eas.json) podem ser feitas antes, pois não dependem
   da conta.
2. **[NEGÓCIO/DECISÃO] Confirmar os `android.package`** (`com.keepithub.cliente`
   / `com.keepithub.lojista`) — imutáveis após publish (§4).
3. **[OPS] Service account do Google Play** criada e com acesso concedido.
4. **[OPS] E-mails Google** dos testadores internos (Caio já é testador iOS com
   `caiorodrigobr@gmail.com` — confirmar se o mesmo e-mail Google serve).
5. **[OPS] `EXPO_ACCESS_TOKEN` válido.** A Story 9.0.7 registrou que o token do
   `.env` estava **inválido** e bloqueou o build do Lojista iOS. O mesmo token é
   necessário para `eas build/submit` Android — **renovar antes**, senão o build
   Android trava pelo mesmo motivo.

## 9. Fidelidade mock (garantias exigidas)

- O profile `pilot` **já** injeta `env.DATA_SOURCE=mock` no nível do profile,
  válido para iOS e Android — **não criar um `env` separado por plataforma**;
  isso poderia divergir e ligar backend acidentalmente.
- Nenhuma fixture de `packages/core-data/src/mock` é tocada.
- Código cross-platform: sessão mock do Lojista (9.0.4) e ocultação de
  `DevStateToggle`/`OrderStatusDevAdvancer` (9.0.5) valem para Android sem
  alteração — verificar no smoke que nenhum controle de dev aparece no AAB de
  release.
- Paridade visual: adaptive icons e splash já configurados; validar renderização
  no device Android (formato adaptive icon difere do iOS, mas os assets existem).

## 10. Riscos e red flags (específicos de Android)

| Sev. | Risco | Mitigação |
|---|---|---|
| **ALTO** | **Package imutável.** Publicar com package errado obriga recriar o app no Play (perde faixa/testadores). | Confirmar com Caio antes do commit e antes do primeiro `eas submit` (§4). |
| **ALTO** | **Pedido ponta-a-ponta exige dois aparelhos** (herdado da 9.0.5 — `OrderStatusDevAdvancer` oculto). No Android vale igual. | Comunicar antes do teste; ou build "dev" paralelo com toggles só p/ operador. Registrar no smoke. |
| **MÉDIO** | **`versionCode` não auto-incrementa** (`appVersionSource: local`). Reenvio com mesmo `versionCode` é rejeitado pelo Play. | Declarar `versionCode:1`; @devops incrementa a cada upload; documentar na story. |
| **MÉDIO** | **New Architecture default-on no SDK 57** (RN 0.86; sem `newArchEnabled:false` nos app.json → está **ligada**). Build nativo Android pode expor incompatibilidade de lib não detectada no iOS. | Rodar `eas build` cedo (fail-fast); o app iOS já roda com New Arch, risco baixo mas plataforma-específico. Se algo quebrar, avaliar libs nativas. |
| **MÉDIO** | **Conta Google Play não existe** (pré-req §8) — bloqueia @devops/ops, não bloqueia @dev. | Adiantar stories de config; abrir conta em paralelo. |
| **MÉDIO** | **`EXPO_ACCESS_TOKEN` inválido** (histórico 9.0.7). | Renovar antes de qualquer build Android. |
| **BAIXO** | **Formulários do Play Console** (Content rating / Data Safety) podem ser exigidos para sair de draft mesmo em Internal. | Preenchimento de ops; verificar no Console; sem impacto de código. Não presumir isenção. |
| **BAIXO** | **Política de privacidade** pode ser pedida. | Provável não-exigida em Internal; obrigatória em produção (9.10). Confirmar no Console. |
| **BAIXO** | **Tamanho do AAB.** Bundle Expo managed tende a ficar em dezenas de MB; muito abaixo do limite do Play (150MB base). | Sem ação; monitorar no build. |
| **BAIXO** | **`scheme` ausente no Lojista.** Warning de config / deep link. | Adicionar `scheme` (§3.1.4); não bloqueante. |
| **BAIXO** | **Processamento Google não é instantâneo.** "Sem review" ≠ imediato. | Aguardar minutos após submit. |

## 11. Plano de stories sugerido (esqueleto — @sm escreve as completas)

**Recomendação de estrutura:** continuar a **Fase 0 do Épico 9 como sub-fase
"Fase 0-Android"**, numerando **9.0.9 … 9.0.13**, em vez de abrir novo épico.
Justificativa (trade-off):

- **A favor de continuar no Épico 9:** é literalmente a mesma fase ("piloto mock,
  testadores internos"), só troca a plataforma; reaproveita a seção de
  Reconciliação (9.8 da Fase Real fica *parcialmente antecipada* por estas, igual
  a 9.7↔9.0.x no iOS); mantém rastreabilidade num só épico de publicação.
- **Contra novo épico:** um épico separado duplicaria o enquadramento e quebraria
  a simetria com o piloto iOS. Só valeria se o escopo Android crescesse muito
  além de paridade — não é o caso.

As stories espelham as iOS pertinentes (a maioria das iOS 9.0.3/9.0.4/9.0.5 —
ícones/sessão/dev — **já vale para Android sem nova story**, pois é o mesmo
código/assets; por isso o conjunto Android é menor).

| Story | Título (esqueleto) | Executor | Classificação | Espelha |
|---|---|---|---|---|
| **9.0.9** | Identidade de build Android (`android.package`, `versionCode`, `permissions:[]`, `scheme` lojista) nos 2 app.json | **@dev** (gate @qa) | UI_ONLY | 9.0.1 |
| **9.0.10** | Perfil EAS Android no profile `pilot` (bloco `android` app-bundle + `submit.pilot.android` track internal, `DATA_SOURCE=mock` compartilhado) | **@dev** (gate @qa) | UI_ONLY | 9.0.2 |
| **9.0.11** | App records no Play Console + faixa Internal Testing + service account + testadores | **@devops** (gate @architect) | CORE | 9.0.6 |
| **9.0.12** | EAS Build (AAB) + `eas submit` track internal (Cliente e Lojista) | **@devops** (gate @architect) | CORE | 9.0.7 |
| **9.0.13** | Smoke test do piloto mock em device Android | **@dev** escreve / stakeholder executa (gate @qa leve) | SIMPLE | 9.0.8 |

**Dependências:** 9.0.9 → 9.0.10 (config); 9.0.11 depende da conta Google Play
(§8) e pode correr em paralelo com 9.0.9/9.0.10; 9.0.12 depende de **todas**
(9.0.9–9.0.11) + `EXPO_ACCESS_TOKEN` válido; 9.0.13 após 9.0.12 (roteiro pode ser
escrito antes).

**Cabeçalho obrigatório (por `docs/stories/README.md`):** cada story deve trazer
`## MVP Pilot Classification` (com `Backend esperado: nenhum / DATA_SOURCE=mock`
e `Retomada futura: Story 9.8 da Fase Real`) e, nas que tocam entidades
(9.0.13 smoke), o bloco `## Data Mode` — igual às stories 9.0.x iOS.

**Reconciliação a registrar:** a **Story 9.8 (Fase Real — Android/Play)** fica
*parcialmente antecipada* por 9.0.10 + 9.0.11 + 9.0.12, restrita a **mock +
testadores internos**. A 9.8 real cobre o build de **produção** apontando para
backend real. Análogo ao que a 9.7 tem com as 9.0.x iOS.

## 12. Resumo executivo

- **Gap = config + conta**, não código. Cliente e Lojista têm gap idêntico:
  falta `android.package` + `android.versionCode` no `app.json` e bloco
  `android` (app-bundle) + `submit.pilot.android` (track internal, service
  account) no `eas.json`. Ícones/splash/sessão/ocultação de dev já valem para
  Android.
- **Packages recomendados:** `com.keepithub.cliente` / `com.keepithub.lojista`
  — **confirmar com Caio antes de commitar** (imutável).
- **Keystore:** EAS-managed (Opção A) para o piloto; Play App Signing assume a
  chave final. Nenhum keystore no repo.
- **Pré-requisito de negócio/ops:** **conta Google Play Developer (US$25)** —
  não está aprovada por padrão; sinalizada, não assumida. Também: service
  account do Play, e-mails dos testadores, `EXPO_ACCESS_TOKEN` renovado.
- **Fidelidade mock preservada:** `DATA_SOURCE=mock` compartilhado no profile,
  fixtures intactas, paridade visual.
- **Plano:** 5 stories 9.0.9–9.0.13 como "Fase 0-Android" dentro do Épico 9.
</content>
</invoke>
