# Plano de Orquestração AIOX no Codex — MVP Keepit

**Orquestrador:** `@aiox-master` (Orion)
**Runtime:** Codex, com no máximo 4 agentes ativos contando o orquestrador
**Status:** `AWAITING_USER_APPROVAL`
**Modo proposto:** autonomia dentro da onda; aprovação humana entre épicos
**Plano executável:** [`CODEX-AIOX-MVP-ORCHESTRATION.yaml`](./CODEX-AIOX-MVP-ORCHESTRATION.yaml)

## Resumo executivo

- 9 ondas contando a baseline.
- 82 Stories restantes programadas, sem duplicidade.
- 25 Stories funcionais já absorvidas como concluídas no plano do piloto.
- 5 Stories `LATER` excluídas da execução atual.
- 2 Stories `REMOVED` preservadas apenas para rastreabilidade.
- Nenhuma execução começa enquanto `approved: false` estiver no YAML.

## 1. Objetivo

Concluir o MVP piloto preservando a interface e implementando o backend na
profundidade definida em:

- [`../prd/07-plano-mvp-piloto.md`](../prd/07-plano-mvp-piloto.md);
- [`../architecture/07-mvp-pilot-backend.md`](../architecture/07-mvp-pilot-backend.md);
- [`../stories/README.md`](../stories/README.md).

O plano não executa itens `LATER` ou `REMOVED`. O AIOX Master não reinterpreta
o PRD durante a execução; qualquer ampliação volta ao usuário.

## 2. Modelo de agentes no Codex

| Papel | Agente AIOX | Responsabilidade exclusiva |
|---|---|---|
| Orquestração | `@aiox-master` | Selecionar ondas, controlar estado, dependências, checkpoints e escalonamentos. |
| Produto | `@pm` | Resolver conflito entre o recorte e o objetivo do MVP; não atua em implementação. |
| Story | `@sm` | Materializar apenas as Stories da próxima onda, com classificação do piloto. |
| Validação | `@po` | Validar ACs, escopo IN/OUT e prontidão antes de código. |
| Arquitetura | `@architect` | Criar plano técnico por Story e revisar impacto cross-stack. |
| Dados | `@data-engineer` | Revisar migrations, constraints, RLS e integridade financeira. |
| Implementação | `@dev` | Implementar a Story aprovada no worktree designado. |
| Qualidade | `@qa` | Revisar ACs, segurança, regressão, testes e emitir gate. |
| Git/entrega | `@devops` | Criar branches/worktrees, commits, integração e operações remotas autorizadas. |
| UX excepcional | `@ux-design-expert` | Somente se uma Story exigir decisão visual não coberta pela casca já aprovada. |

No Codex, os agentes são instâncias separadas e não personas simuladas dentro
do contexto do Master.

## 2.1 Roteamento inteligente entre modelos

| Trabalho | Modelo preferido | Fallback | Motivo de roteamento |
|---|---|---|---|
| Orquestração, checkpoints, decisões de escopo e consolidação | GPT principal | Sol | Exige contexto amplo do PRD, arquitetura e estado das ondas. |
| Criação/refino de Story e validação de produto | GPT principal | Terra | Exige leitura de artefatos e consistência de escopo, não volume de código. |
| Implementação visual, React Native/Next e integração de telas | Luna | Terra | Prioridade para Luna; Terra assume quando Luna não estiver disponível. |
| CRUD, ports, adapters Supabase, testes e correções rotineiras | Terra | Luna | Trabalho de desenvolvimento direto, bem delimitado e verificável. |
| Migrations, RLS, PIN, webhook/PIX, ledger e incidentes difíceis | Sol | Terra | Alto impacto de segurança, dinheiro ou integridade de dados. |
| QA de alto risco e gate de integração | Sol | GPT principal | Revisão profunda para alterações transversais ou financeiras. |
| QA comum e regressão visual | Terra | Luna | Verificação repetível, aderente a ACs e testes existentes. |

**Regra de disponibilidade:** Luna é prioritária para desenvolvimento, mas não
está exposta como override chamável no runtime atual. Antes de cada delegação,
o Master verifica a disponibilidade. Se Luna não estiver disponível, o trabalho
vai para Terra; a onda não fica parada. Sol não é usado como executor padrão:
entra quando o risco ou a complexidade justificarem.

## 3. Política de concorrência

- Limite total: 4 agentes, incluindo o Master.
- Máximo de Stories em implementação simultânea: 2.
- Slot restante: QA, Data Engineer ou integração.
- Stories que toquem o mesmo domínio, migration, port ou navigator não rodam em
  paralelo.
- Os grupos paralelos do YAML são **candidatos**. Architect/DevOps devem
  rebaixá-los para sequência quando o preflight encontrar arquivos sobrepostos.
- Planejamento de uma onda pode ocorrer enquanto QA encerra a anterior, mas
  implementação nova só começa depois do gate.
- Cada implementação usa branch e worktree próprios, criados pelo DevOps.
- A escolha de modelo é registrada no relatório da Story, junto com o motivo de
  eventual fallback Luna → Terra ou Terra → Sol.

## 4. Ciclo obrigatório de uma Story

```text
SM cria Draft
  → PO valida e marca Ready
  → Architect cria plano atômico
  → Data Engineer revisa se houver DB/RLS/ledger
  → Dev implementa no worktree isolado
  → Dev executa testes direcionados + pnpm qa
  → QA emite PASS/CONCERNS/FAIL
  → Dev corrige, no máximo 3 ciclos
  → DevOps integra localmente após PASS ou CONCERNS aceito
  → Master atualiza estado e relatório da onda
```

Regras:

1. Executor e quality gate nunca são o mesmo agente.
2. `CONCERNS` só permite integração quando não houver issue `critical/high` e o
   débito estiver registrado com responsável e destino.
3. `FAIL` bloqueia integração.
4. Nenhum método pode retornar sucesso fictício para compensar backend adiado.
5. Cada Story nova recebe o cabeçalho definido em `docs/stories/README.md`.

## 5. Onda 0 — baseline e prontidão

Esta onda é obrigatória porque o worktree atual contém a correção de curso ainda
não commitada e as Stories futuras ainda não existem como arquivos individuais.

| Etapa | Responsável | Saída/gate |
|---|---|---|
| Confirmar aprovação deste plano | Usuário + Master | Status muda para `APPROVED`. |
| Revisar escopo do commit | DevOps | Não incluir artefatos gerados de `.aiox/` por acidente. |
| Commitar documentação e planos | DevOps | Working tree limpo; tag de backup continua em `cdf94bb`. |
| Executar `pnpm qa` | QA | Gate baseline verde. |
| Inicializar estado da orquestração | Master | `.aiox/workflow-state/keepit-mvp-pilot.json`. |

Nenhum push, PR ou operação remota faz parte da aprovação deste plano. Essas
ações exigem autorização separada.

## 6. Ondas de produto

### Onda 1 — Cliente autenticado

**Escopo:** 2.6, 2.7, 2.8, 2.9 e 2.10.

- 1A: 2.6 login real e sessão.
- 1B: 2.7 recuperação e 2.10 suporte, em paralelo se os arquivos não colidirem.
- 1C: 2.8 perfil real.
- 1D: 2.9 configurações simples incorporadas ao perfil.

**Gate:** cadastro, logout, login, re-login, recuperação, perfil e suporte
funcionam em device/browser aplicável; `pnpm qa` verde.

### Onda 2 — Lojista e aprovação Admin

**Escopo:** 3.1–3.12 conforme `CORE/SIMPLE`.

- 2A: schema/auth de lojista e status do estabelecimento.
- 2B: cadastro passos 1–3, sequencial por compartilhar estado.
- 2C: Admin lista, aprova/rejeita; aprovação não depende de subconta Asaas.
- 2D: roteamento por status, login, perfil público e configurações.

**Gate:** lojista se cadastra, fica em análise, é aprovado/rejeitado e entra na
tela correta; RLS impede acesso cruzado.

### Onda 3 — Hubs e catálogo reais

**Escopo:** 4.1–4.8.

- 3A: migrations e RLS de hubs, relação loja↔hub, produtos e horários.
- 3B: Admin CRUD de hubs e Lojista CRUD de produtos, paralelos após 3A.
- 3C: fotos, edição, pausa/exclusão, horários simples e pausa da loja.

**Gate:** dados sobrevivem à sessão, ownership funciona e as telas existentes
não dependem mais de mock nesse domínio.

### Onda 4 — Descoberta e busca

**Escopo:** 5.1–5.8.

- 4A: lista de hubs e lojas do hub.
- 4B: catálogo e detalhes de loja/produto.
- 4C: busca simples por produto e loja.
- 4D: estados aberta/fechada/pausada; estrela continua `UI_ONLY`.

**Gate:** cliente percorre hub → loja → produto com dados reais, incluindo
loading/vazio/erro, sem GPS/Haversine.

### Onda 5 — Pedido e PIN sem pagamento real

**Escopo:** 6.1–6.9 e 6.11–6.21. A Story 6.10 permanece `LATER`.

- 5A: carrinho de uma loja, checkout e validações síncronas.
- 5B: criação de pedido de teste, CPF, ticket mínimo e PIN server-side.
- 5C: lista do lojista, aceite, recusa e avanço de estado.
- 5D: check-in simples, confirmação do PIN, recibo e histórico.
- 5E: cancelamentos e no-shows como solicitações/ocorrências manuais.

**Gate:** fluxo completo funciona com confirmação de pagamento controlada no
ambiente dev; PIN e transições críticas são validados no servidor.

### Onda 6 — PIX e ledger

**Escopo:** 7.1, 7.2, 7.5–7.10 e 7.12. Stories 7.3, 7.4 e 7.11 ficam `LATER`.

- 6A: cliente Asaas sandbox e criação de cobrança PIX.
- 6B: webhook autenticado/idempotente e transição para aceite.
- 6C: ledger, taxa Keepit e saldo do lojista.
- 6D: carteira, extrato, dashboard simples e solicitação manual de saque.

**Gate:** um PIX sandbox confirmado produz exatamente um crédito rastreável;
replay do webhook não duplica pedido nem valor.

### Onda 7 — Operação Admin

**Escopo:** 8.1–8.8 e consolidação de 6.18–6.21.

- 7A: fila de ocorrências/reembolsos e detalhe do pedido.
- 7B: execução manual registrada, cancelamento e referência externa.
- 7C: clientes, lojistas, bloqueio/suspensão e qualidade simples.
- 7D: dashboard por queries SQL diretas.

**Gate:** admin resolve uma ocorrência e um repasse/reembolso sem editar o banco
manualmente, mantendo autoria e histórico.

### Onda 8 — Publicação e piloto

**Escopo:** 1.8 e 9.1–9.11.

- 8A: Vercel, termos, privacidade, exclusão, ícones e splash.
- 8B: roteiro manual end-to-end e correções de publicação.
- 8C: Supabase produção e Asaas produção, somente após aprovação explícita.
- 8D: EAS Build/Submit, stores e go-live, cada ação externa confirmada.

**Gate final:** Cliente, Lojista e Admin executam a fatia PIX → pedido → PIN em
produção, com smoke manual aprovado e rollback documentado.

## 7. Checkpoints do usuário

O modo recomendado é:

- Aprovação única deste plano antes da Onda 0.
- Execução autônoma dentro de cada onda aprovada.
- Relatório e escolha `GO/PAUSE/REVIEW/ABORT` ao final de cada onda de produto.
- Aprovação específica antes de migrations em produção, gateway de produção,
  push GitHub, deploy Vercel, EAS Submit ou publicação nas lojas.

## 8. Condições de parada

O Master pausa imediatamente quando houver:

- requisito além de `CORE/SIMPLE/UI_ONLY`;
- dúvida de regra de negócio não decidida;
- migration destrutiva ou perda de dados;
- issue de segurança `critical/high`;
- cobrança, estorno ou repasse em produção;
- necessidade de segredo/credencial não disponível;
- conflito de worktree que possa sobrescrever trabalho do usuário;
- três falhas consecutivas da mesma Story ou duas reprovações do gate da onda.

## 9. Relatório de progresso

Ao fim de cada onda, o Master informa:

- Stories planejadas, concluídas, bloqueadas e adiadas;
- testes executados e gate de QA;
- migrations e mudanças externas;
- débitos aceitos;
- percentual por contagem e estimativa por esforço;
- próxima onda proposta.

## 10. O que a aprovação autoriza

A aprovação autoriza iniciar a **Onda 0** e preparar a primeira Story. Não
autoriza automaticamente push, PR, deploy, migration de produção, cobrança real
ou submissão às lojas.
