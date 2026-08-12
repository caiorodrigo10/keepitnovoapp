# Pendências que dependem do Caio — Keepit MVP

> Registro vivo do que **só o Caio (ou o stakeholder via Caio)** pode destravar.
> Atualizado em 2026-08-12 ao fim do Bloco 01 de orquestração. Os agentes
> **não inventam default** para nada aqui (princípio nº 4 do `CLAUDE.md`).

## 🔴 Ação imediata (destrava o que está em curso)

| ID | O que fazer | Destrava | Esforço |
|---|---|---|---|
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

- Reconciliar worktrees divergentes e o histórico antigo de migrations `clientes`
  (versões locais ≠ remoto) — **@devops**.
- Regenerar `packages/shared-types/src/supabase.ts` oficialmente (`supabase gen types`).
- Reviews formais de `@architect`: contrato `LojistaAuthPort` (3.2) e mecanismo
  RLS de duplicidade de CNPJ (3.3, resolve na 3.5).
- CodeRabbit está `signed out` no ambiente — review automatizado suprido por QA manual.
