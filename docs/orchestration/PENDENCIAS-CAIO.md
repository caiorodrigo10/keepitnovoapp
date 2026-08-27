# Pendências que dependem do Caio — Keepit MVP

> Registro vivo do que **só o Caio (ou o stakeholder via Caio)** pode destravar.
> Atualizado em 2026-08-13 ao fim dos Blocos 08/09/12. Os agentes
> **não inventam default** para nada aqui (princípio nº 4 do `CLAUDE.md`).
> Panorama da noite: `RELATORIO-NOITE-2026-08-13.md`.

## 🔴 Ação imediata (destrava o que está em curso)

| ID | O que fazer | Destrava | Esforço |
|---|---|---|---|
| **ASAAS-1** | **Aprovar a conta sandbox** no painel Asaas (hoje `AWAITING_APPROVAL` → PIX retorna "conta precisa estar aprovada") | Cobrança PIX real (Épico 7) e estorno/saque real (Bloco 09) | painel Asaas |
| **ASAAS-2** | **Setar os secrets** `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN`/`ASAAS_BASE_URL` nas Edge Functions do `keepit-dev` (valores em `.env.asaas`, raiz, gitignored) | Idem — libera o **Bloco 08-PIX** (deploy Edge Functions + fiar checkout). Detalhe em `ASAAS-SETUP-CAIO.md` | ~2 min painel |
| **Q1.8-STK** | **Decisão do stakeholder** sobre a mecânica do **reembolso parcial** (taxa Keepit na parcela do lojista? vesting imediato vs D+7? R$2,90 reembolsa?) — ver `PERGUNTAS_REGRAS_NEGOCIO.md §1.8` | **Bloco 10** casos parciais (6.18 90-10 / 6.19 20-80). Os casos 100% já podem ser construídos | responder/stakeholder |
| **CFG-001** | `Confirm email` = **OFF** no painel do projeto `keepit-dev` (Auth → Providers/Email) | E2E de signup/login de **cliente e lojista** (2.6, 3.2) | 1 clique |
| **CFG-002** | (a) Template de e-mail de **recuperação de senha em pt-BR**; (b) adicionar `com.keepithub.cliente://auth/reset` à allow-list de redirect no `keepit-dev` hospedado | E2E de recuperação de senha (2.7) | ~5 min painel |
| **WA-001** | Informar o **número oficial de WhatsApp** de suporte | Stories **2.9, 2.10** e o botão "Falar com Keepit" da tela "Em análise" (3.6) | responder aqui |

## 🟡 Necessário para o próximo(s) bloco(s)

| ID | Decisão/insumo | Destrava |
|---|---|---|
| **BR-HUB** | **Como a loja é vinculada ao hub?** (auto na aprovação / Admin seleciona / lojista escolhe) | Atribuição de hub na aprovação do lojista (3.8) e a descoberta (Épico 4/5). No piloto, a tabela `estabelecimentos_hubs` já existe; falta a REGRA de associação. |
| **Q4.1** | Aprovação do lojista: confirmar **revisão manual pelo Admin** (o piloto já assume manual + 1 operador; confirmar que não há auto-aprovação) | Fecha 3.7/3.8 sem ambiguidade |
| **Q3.1** | Definição operacional do **hub** (o que é, quem opera, horários) | Profundidade do Épico 4/5 |
| **DEVICE** | Disponibilizar **1 device físico** (Android/iOS) com build `EXPO_PUBLIC_DATA_SOURCE=supabase` | Validação manual dos ACs de device acumulados (persistência de sessão, deep link de recovery, signup E2E) — hoje marcados como pendência em todas as stories de auth |
| **DEVOPS-OK** | Autorizar o **@devops** a reconciliar os worktrees divergentes (`.worktrees/story-2.5.1`, `story-2.7`) e fazer `git push`/PR | Integração do trabalho (hoje tudo em `main` local, nada remoto) |

## 🟢 Mais à frente (não bloqueia agora)

| ID | Item | Quando importa |
|---|---|---|
| **PAY-01** | Ratificação do **stakeholder** da taxa ao comprador **R$ 2,90** (é preço ao consumidor) | Antes de fechar o Épico 6 (checkout) |
| **VERCEL** | Conta/acesso **Vercel** | Story 1.8 (deploy do Admin) |
| **PUB-01** | **Token EXPO** válido + credenciais Google Play (US$25) / Apple | Publicação (Épico 9 fase real) |

## Débitos técnicos abertos (não são "do Caio", mas ficam registrados)

- Reconciliar a **cadeia de worktrees** (main→…→block-12-higiene, 8 branches) +
  limpar os **3 worktrees órfãos** `story-2.5.1/2.6/2.7` — **@devops**, quando DEVOPS-OK.
- ~~Regenerar `packages/shared-types/src/supabase.ts`~~ — **FEITO no Bloco 12** (1:1 com o banco via MCP).
- Reviews formais de `@architect`: contrato `LojistaAuthPort` (3.2) e mecanismo
  RLS de duplicidade de CNPJ (3.3, resolve na 3.5).
- CodeRabbit está `signed out` no ambiente — review automatizado suprido por QA manual.
