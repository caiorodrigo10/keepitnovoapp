# Plano de Orquestração — Continuidade do Desenvolvimento Keepit MVP

**Orquestrador:** `@aiox-master` (Orion)
**Runtime:** Claude Code (subagentes reais via Agent tool; worktrees git para paralelismo)
**Status:** `AWAITING_USER_APPROVAL`
**Modo proposto:** autonomia dentro da onda; aprovação humana do Caio entre ondas
**Supersede:** [`CODEX-AIOX-MVP-ORCHESTRATION.md`](./CODEX-AIOX-MVP-ORCHESTRATION.md) (runtime Codex) — mantido por rastreabilidade; a estrutura de ondas é herdada e atualizada aqui.

---

## 0. O que mudou desde o plano Codex (baseline desta revisão)

- **MCP Supabase reativado** → `@dev` e `@data-engineer` podem aplicar migrations, criar RLS e consultar `keepit-dev` direto pelo MCP. Backend real dos épicos 2–8 está destravado tecnicamente.
- **Decisões fechadas (Rodada 8, 2026-08-02, Caio):**
  - **§10.8** → conta do Cliente é **tudo no Perfil** (sem tela de Configurações separada). Impacta as ACs das Stories **2.8/2.9/2.10** — precisam ser reescritas por `@po`/`@sm` antes de implementar.
  - **§10.9** → **sessão persistente até logout** (sem expiração forçada). Destrava AC5/AC6 da **2.6**.
- **Ports core-data já reconciliadas** (Story 1.10 Done, `zero *.mock.ts` local). A troca mock→Supabase acontece na factory, sem tocar telas.
- **Entregas de hoje:** roteiro `docs/tests/smoke-pilot-ios-mock.md` (9.0.8) e story `docs/stories/1.8.story.md` (deploy Vercel) criados.
- **Worktrees ativos:** `.worktrees/story-2.5.1`, `story-2.6`, `story-2.7` (Onda 1 já iniciada em isolamento).

---

## 1. Estado atual por épico

| Épico | Tema | Estado | Stories |
|---|---|---|---|
| 0 | Casca visual | ✅ Done | 0.1–0.13 (13) |
| 1 | Fundação backend & CI | ✅ Quase | 1.4/1.5(waived)/1.9/1.10 Done; **1.8 Vercel Draft** (conta externa) |
| 2 | Auth Cliente | 🔄 Em andamento | 2.1–2.3.1 Done; 2.5.1/2.6/2.8 Ready; 2.7 Draft; 2.8/2.9/2.10 precisam AC rewrite |
| 3 | Lojista & aprovação | ⬜ Sem stories | Criar 3.x a partir do épico |
| 4 | Cadastros base (hubs/catálogo) | ⬜ Sem stories | Criar 4.x |
| 5 | Descoberta & busca | ⬜ Sem stories | Criar 5.x |
| 6 | Pedido & PIN | ⬜ Sem stories | Criar 6.x |
| 7 | Pagamento & carteira | 🟢 Destravado | Modelo financeiro homologado (Rodada 8); taxa ao comprador provisória |
| 8 | Operação Admin | ⬜ Sem stories | Criar 8.x |
| 9 | Publicação & compliance | 🔄 Parcial | 9.0.1–9.0.5 Done; **Cliente publicado no TestFlight ✅**; **Lojista pendente** (token EXPO inválido); 9.0.8 roteiro pronto, execução espera os 2 apps |
| 10 | Admin demo mock | 🔄 Parcial | 10.1/10.2 Done |
| 11 | Experiência painel Admin | 🔄 Em andamento | 11.1 InProgress; 11.2 Draft |

---

## 2. Modelo de agentes (Claude Code)

Subagentes reais, um por papel, invocados pelo Master via Agent tool. Executor e quality gate **nunca** são o mesmo agente.

| Papel | Subagente | Responsabilidade |
|---|---|---|
| Orquestração | `@aiox-master` (Orion) | Seleção de ondas, estado, dependências, checkpoints, escalonamento. |
| Produto | `@pm` (Morgan) | Conflitos escopo × objetivo; nunca implementa. |
| Story | `@sm` (River) | Materializa as Stories da próxima onda com cabeçalho do piloto. |
| Validação | `@po` (Pax) | Valida ACs, escopo IN/OUT, prontidão; marca Ready. |
| Arquitetura | `@architect` (Aria) | Plano técnico por Story; impacto cross-stack. |
| Dados | `@data-engineer` (Dara) | Migrations, constraints, RLS, integridade financeira — **via MCP Supabase**. |
| Implementação | `@dev` (Dex) | Implementa a Story no worktree isolado. |
| Qualidade | `@qa` (Quinn) | ACs, segurança, regressão, gate PASS/CONCERNS/FAIL. |
| Git/entrega | `@devops` (Gage) | Branches/worktrees, commits, push/PR/deploy (exclusivo). |
| UX excepcional | `@ux-design-expert` (Uma) | Só se surgir decisão visual fora da casca aprovada. |

**Roteamento de modelo (regra fixa do projeto):** `@dev` → Sonnet mais recente; `@qa` → Opus mais recente. Migrations/PIN/PIX/ledger e QA de alto risco → Opus.

---

## 3. Ciclo obrigatório por Story (SDC)

```text
@sm cria Draft
  → @po valida e marca Ready
  → @architect plano atômico
  → @data-engineer revisa se houver DB/RLS/ledger (MCP Supabase)
  → @dev implementa no worktree isolado
  → @dev roda testes direcionados + `pnpm qa`
  → @qa emite PASS/CONCERNS/FAIL
  → @dev corrige (máx. 3 ciclos)
  → @devops integra localmente após PASS ou CONCERNS aceito
  → @aiox-master atualiza estado e relatório da onda
```

**Regras:** (1) executor ≠ gate; (2) `CONCERNS` só integra sem issue critical/high e com débito registrado; (3) `FAIL` bloqueia; (4) nenhum método retorna sucesso fictício por backend adiado; (5) toda Story nova usa o cabeçalho de `docs/stories/README.md`.

---

## 4. Política de concorrência

- Máx. **2 Stories em implementação simultânea**, cada uma em worktree próprio.
- Stories que tocam o mesmo domínio/migration/port/navigator **não** rodam em paralelo.
- Planejamento da próxima onda pode ocorrer enquanto QA fecha a anterior; implementação nova só começa após o gate.
- Grupos paralelos abaixo são **candidatos**; `@architect`/`@devops` rebaixam para sequência se o preflight achar arquivos sobrepostos.

---

## 5. Bloqueios e dependências externas (mapa)

| Bloqueio | Tipo | Destrava o quê | Dono |
|---|---|---|---|
| **CFG-001** — `Confirm email` OFF em `keepit-dev` | 1 clique no painel | Fechar E2E de signup/login (2.3/2.6) | **Caio** |
| ~~Modelo financeiro (§1.1–1.4)~~ | ✅ Resolvido (Rodada 8) | Onda 6 destravada. Taxa Keepit 10%; taxa ao comprador R$ 2,90 (provisória) | — |
| ~~§10.5 / §10.6 / §10.1 / §10.2~~ | ✅ Resolvidos (Rodada 8) | §10.5 OFF, §10.6 1 operador, §10.1 com mapa, §10.2 sem social | — |
| **Ratificação da taxa ao comprador** (R$ 2,90) | Regra de negócio (preço) | Confirmar valor antes da Onda 6 fechar | **Stakeholder** |
| **Token EXPO válido** + publicar Lojista no TestFlight | Infra externa | Fecha 9.0.6/9.0.7 (Cliente já ✅) e habilita a execução da 9.0.8 | Caio (token) + @devops (build/submit) |
| **Conta Vercel** | Infra externa | Story 1.8 (deploy Admin) | Caio/@devops |

O Master **pausa** ao esbarrar em qualquer item de stakeholder não decidido — não inventa default (princípio nº 4 do `CLAUDE.md`).

---

## 6. Ondas de produto

### Onda 1 — Cliente autenticado (Épico 2) — *pronta para iniciar*
**Escopo:** 2.5.1, 2.6, 2.7, 2.8, 2.9, 2.10.
- **1A** — `@po`/`@sm`: reescrever ACs de **2.8/2.9/2.10** para "tudo no Perfil" (§10.8). *Pré-requisito das telas de conta.*
- **1B** — 2.5.1 bootstrap do cliente Supabase + persistência de sessão (worktree ativo).
- **1C** — 2.6 login real + sessão persistente (§10.9), após 2.5.1. **E2E completo depende de CFG-001.**
- **1D** — 2.7 recuperação de senha (worktree ativo) — paralela a 2.6 se arquivos não colidirem.
- **1E** — 2.8 Perfil real → 2.9 (itens de menu no Perfil) → 2.10 suporte, sequencial (mesma superfície de UI).

**Gate da onda:** cadastro, logout, login, re-login, recuperação, perfil e suporte funcionam em device/browser; `pnpm qa` verde.

### Onda 2 — Lojista & aprovação Admin (Épico 3)
**Escopo:** 3.1–3.12 (CORE/SIMPLE). `@sm` cria as stories a partir do épico.
- 2A: schema/auth do lojista + status do estabelecimento (RLS via MCP).
- 2B: cadastro passos 1–3 (sequencial — estado compartilhado).
- 2C: Admin lista, aprova/rejeita (sem subconta Asaas nesta onda).
- 2D: roteamento por status, login, perfil público, configurações.

**Gate:** lojista cadastra → "em análise" → aprovado/rejeitado → tela correta; RLS impede acesso cruzado.

### Onda 3 — Hubs & catálogo reais (Épico 4)
**Escopo:** 4.1–4.8.
- 3A: migrations/RLS de hubs, relação loja↔hub, produtos, horários.
- 3B: Admin CRUD de hubs + Lojista CRUD de produtos (paralelos após 3A).
- 3C: fotos, edição, pausa/exclusão, horários, pausa de loja.

**Gate:** dados sobrevivem à sessão; ownership funciona; telas não dependem mais de mock nesse domínio.

### Onda 4 — Descoberta & busca (Épico 5)
**Escopo:** 5.1–5.8.
- 4A: lista de hubs e lojas do hub · 4B: catálogo e detalhes · 4C: busca simples · 4D: estados aberta/fechada/pausada (estrela `UI_ONLY`).

**Gate:** cliente percorre hub → loja → produto com dado real, incluindo loading/vazio/erro; sem GPS/Haversine.

### Onda 5 — Pedido & PIN sem pagamento real (Épico 6)
**Escopo:** 6.1–6.9, 6.11–6.21 (6.10 `LATER`).
- 5A: carrinho de uma loja, checkout, validações · 5B: criação de pedido de teste, CPF, ticket mínimo, **PIN server-side** · 5C: lista do lojista, aceite/recusa, avanço de estado · 5D: check-in, confirmação do PIN, recibo, histórico · 5E: cancelamentos/no-shows como ocorrências manuais.

**Gate:** fluxo completo com confirmação de pagamento **simulada** no dev; PIN e transições críticas validados no servidor.

### Onda 6 — PIX & ledger (Épico 7) — 🟢 destravada
**Escopo:** 7.1, 7.2, 7.5–7.10, 7.12 (7.3/7.4/7.11 `LATER`).
> Modelo financeiro **homologado** (Rodada 8): Asaas carteira virtual, escrow D+7, taxa Keepit **10%** do lojista (`businessConfig.taxaKeepitPercent`), saque mín. R$ 200, chargeback R$ 40, e **nova taxa ao comprador R$ 2,90 fixa** (`taxa_servico_comprador_reais`, provisória — ratificar com stakeholder antes de fechar a onda). Aplica-se em produção só após aprovação explícita (checkpoint).
- 6A: Asaas sandbox + cobrança PIX · 6B: webhook autenticado/idempotente · 6C: ledger, taxa Keepit, saldo · 6D: carteira, extrato, dashboard, saque manual.

**Gate:** um PIX sandbox confirmado produz exatamente um crédito rastreável; replay de webhook não duplica.

### Onda 7 — Operação Admin (Épico 8)
**Escopo:** 8.1–8.8 + consolidação de 6.18–6.21.
- 7A: fila de ocorrências/reembolsos + detalhe do pedido · 7B: execução manual registrada, cancelamento, referência externa · 7C: clientes/lojistas, bloqueio/suspensão · 7D: dashboard por SQL direto.

**Gate:** admin resolve ocorrência e repasse/reembolso sem editar o banco à mão, com autoria e histórico.

### Onda 8 — Publicação & piloto (Épico 9 + Story 1.8) — depende de contas externas
**Escopo:** 1.8 (Vercel), 9.0.6/9.0.7/9.0.8 (piloto iOS), 9.1–9.11.
- 8A: **Vercel** (1.8), termos, privacidade, exclusão de conta, ícones, splash.
- 8B: roteiro end-to-end (9.0.8 já escrito) + correções de publicação. **Estado real: Cliente já no TestFlight ✅; Lojista pendente** (token EXPO novo + `eas build`/`submit`). A **execução** da 9.0.8 exige os **dois** apps no device (fluxo pedido com 2 aparelhos), então espera o Lojista.
- 8C: Supabase produção + Asaas produção — **só após aprovação explícita**.
- 8D: EAS Build/Submit, stores, go-live — cada ação externa confirmada.

**Gate final:** Cliente, Lojista e Admin executam PIX → pedido → PIN em produção, smoke manual aprovado, rollback documentado.

### Track paralelo — Experiência do painel Admin (Épicos 10/11)
Independente do backend do cliente; pode avançar em paralelo à Onda 1/2 quando houver slot.
- 11.1 (InProgress): fechar a validação visual pendente.
- 11.2 (Draft): `@sm`/`@po` prontificam; `@dev`/`@qa` implementam padronização de ações/campos/estados.

---

## 7. Checkpoints do usuário (Caio)

- **Aprovação única deste plano** antes da Onda 1.
- Execução autônoma **dentro** de cada onda aprovada.
- Ao fim de cada onda: relatório + escolha **GO / PAUSE / REVIEW / ABORT**.
- Aprovação específica **antes** de: migration em produção, gateway de produção, `git push`/PR, deploy Vercel, EAS Submit, publicação nas lojas.
- **Ação pontual pendente:** aplicar **CFG-001** (Confirm email OFF) para o E2E da Onda 1 fechar 100%.

---

## 8. Condições de parada (o Master pausa imediatamente)

- Requisito além de `CORE/SIMPLE/UI_ONLY`;
- Regra de negócio não decidida (ex.: modelo financeiro na Onda 6);
- Migration destrutiva / risco de perda de dados;
- Issue de segurança `critical/high`;
- Cobrança, estorno ou repasse em produção;
- Segredo/credencial indisponível;
- Conflito de worktree que possa sobrescrever trabalho do usuário;
- 3 falhas consecutivas da mesma Story ou 2 reprovações do gate da onda.

## 9. O que a aprovação autoriza

Iniciar a **Onda 1** (Cliente autenticado) e preparar sua primeira Story, usando o MCP Supabase para backend real em `keepit-dev`. **Não** autoriza automaticamente push, PR, deploy, migration de produção, cobrança real ou submissão às lojas — cada um exige confirmação sua no checkpoint correspondente.
