# Épico 9 — Publicação & Compliance

> **Plano vigente (2026-07-31):** publicação e compliance continuam `CORE`;
> não são removidos pela simplificação do backend. Ver
> [`../07-plano-mvp-piloto.md`](../07-plano-mvp-piloto.md).

## Expanded Goal

Preparar o Keepit para produção pública: textos legais (Termos, Política), ícones e splash screens, metadata das lojas (descrição, screenshots, categoria), teste end-to-end, migração do Supabase dev → produção, troca do Asaas sandbox → produção após aprovação comercial, e submissão inicial à App Store + Play Store.

Este é o épico do **"empurrar pra loja"**. Depende de todos os anteriores.

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
5: Configurado em `apps/cliente/app.json` e `apps/lojista/app.json` (bundle IDs distintos: `com.keepit.cliente` e `com.keepit.lojista`).

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
