# Épico 3 — Auth & Onboarding do Lojista + Aprovação Admin

## Expanded Goal

Habilitar o **caminho de entrada do lojista** — cadastro em 3 passos com todos os dados operacionais e financeiros — e o **primeiro fluxo do admin da Keepit** — login + aprovação/rejeição de lojistas com criação de subconta Asaas. Ao final: um lojista consegue se cadastrar, ser aprovado por um admin, e logar no app do lojista para ver painel (vazio no início).

Este é o épico que introduz o **admin web** e o **primeiro fluxo com Asaas** (criação de subconta em sandbox).

## Prerequisites

- Épico 1 concluído.
- Épico 2 concluído (Supabase Auth já configurado).
- Conta Asaas sandbox criada; `ASAAS_API_KEY` no `.env`.

## Stories

### Story 3.1 — Onboarding do lojista

**As a** novo lojista,
**I want** ver telas explicando o que ganho ao me cadastrar no Keepit,
**so that** eu entenda o modelo antes de cadastrar.

**Acceptance Criteria:**
1: Onboarding no tema dark, replica textos do protótipo ("Em minutos sua loja já recebe pedidos no hub").
2: Pager similar ao cliente (3 telas).
3: Última tela leva a "Cadastrar estabelecimento" (Story 3.2).

---

### Story 3.2 — Cadastro passo 1: dados básicos

**As a** novo lojista,
**I want** informar dados básicos do estabelecimento,
**so that** o cadastro comece.

**Acceptance Criteria:**
1: Tela "Passo 1 de 3" com campos: nome fantasia, CNPJ (máscara), telefone (máscara), nome do responsável, e-mail, senha.
2: Aceite de Termos e Política (checkbox obrigatório).
3: Validação de CNPJ formato + Story 3.3.
4: Sucesso avança para Story 3.4.

---

### Story 3.3 — Validação de CNPJ via BrasilAPI

**As a** sistema,
**I want** validar automaticamente o CNPJ na Receita Federal via BrasilAPI,
**so that** cadastros com CNPJ inválido ou inativo sejam bloqueados na hora.

**Acceptance Criteria:**
1: Edge Function `validar-cnpj` chama `https://brasilapi.com.br/api/cnpj/v1/{cnpj}`.
2: Se CNPJ inexistente ou inativo, retorna erro claro na tela.
3: Se ativo, cache o retorno em `estabelecimentos.dados_receita` (JSONB) — usado depois para preencher razão social e endereço se necessário.
4: Sem chave de API (BrasilAPI é grátis).

---

### Story 3.4 — Cadastro passo 2: dados operacionais

**As a** novo lojista,
**I want** informar categoria, endereço da loja, raio de atendimento, tempo médio, taxa de deslocamento e ticket mínimo,
**so that** o sistema saiba quais hubs atendo e como oferecer preços.

**Acceptance Criteria:**
1: Tela "Passo 2 de 3" com campos: categoria (dropdown com lista aberta gerenciada em `packages/config/business-rules.ts` — alimentação, farmácia, vestuário, conveniência, higiene, cuidados, +outros a definir), endereço completo com autocompletar simples (input livre no MVP), latitude/longitude preenchidos automaticamente (via geocoding grátis se disponível, senão input manual pelo lojista pegando do mapa dele), raio de atendimento em km (slider 1-15), tempo médio de entrega em minutos (input 5-120), taxa de deslocamento em R$ (input 0-30), ticket mínimo próprio opcional (default deixa em branco = usa global R$ 20).
2: Validação: raio > 0, tempo > 0, taxa >= 0, ticket mínimo (se informado) >= 5.
3: Sucesso avança para Story 3.5.

---

### Story 3.5 — Cadastro passo 3: recebimento + fachada + horários

**As a** novo lojista,
**I want** cadastrar chave PIX, foto de fachada e horários de funcionamento,
**so that** eu esteja pronto pra receber saques e apareça direito pro cliente.

**Acceptance Criteria:**
1: Tela "Passo 3 de 3": chave PIX de recebimento (CPF/CNPJ/e-mail/telefone/aleatória — dropdown de tipo + input), foto de fachada (upload single, opcional), horários de funcionamento por dia da semana (checkbox "aberto" + horário abertura + horário fechamento por dia).
2: Foto de fachada armazenada em Supabase Storage bucket `fachadas` com URL assinada.
3: Ao submeter: cria linha em `estabelecimentos` com status `em_analise`.
4: Redireciona para Story 3.6.

---

### Story 3.6 — Tela "Em análise"

**As a** lojista que acabou de submeter cadastro,
**I want** ver claramente que meu cadastro está em análise,
**so that** eu saiba que preciso aguardar.

**Acceptance Criteria:**
1: Tela com título "Em análise", texto explicativo ("Estamos revisando seu cadastro. Você receberá um e-mail e uma notificação quando for aprovado. Isso costuma levar até 2 dias úteis.").
2: Botão "Falar com Keepit" (WhatsApp) disponível.
3: Se o lojista logar de novo enquanto em análise, cai nessa tela.
4: Push token capturado após aceite de notificação.

---

### Story 3.7 — Painel admin: listar lojistas pendentes

**As a** admin Keepit,
**I want** ver todos os lojistas em status `em_analise` com seus dados,
**so that** eu possa aprovar ou rejeitar cada um.

**Acceptance Criteria:**
1: Rota `/admin/lojistas/pendentes` no admin web.
2: Tabela com colunas: nome fantasia, CNPJ, categoria, telefone, data de cadastro, ações (aprovar/rejeitar).
3: Clique em uma linha abre detalhe do lojista com todos os dados dos 3 passos + foto de fachada + dados da Receita.
4: RLS permite acesso apenas a admins (tabela `admin_users` consultada).
5: Migration cria `admin_users (id uuid PK referencing auth.users, criado_em)` e política RLS: `EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())`.

---

### Story 3.8 — Admin aprova lojista → cria subconta Asaas

**As a** admin,
**I want** ao clicar "Aprovar", o sistema criar a subconta Asaas e ativar o lojista,
**so that** ele possa começar a operar.

**Acceptance Criteria:**
1: Botão "Aprovar" no detalhe do lojista.
2: Edge Function `aprovar-lojista` (a) chama `POST /v3/accounts` no Asaas com CNPJ, dados bancários (chave PIX), endereço; (b) armazena `asaas_wallet_id` e `asaas_api_key` (criptografada com `pgsodium` ou secret manager) em `estabelecimentos`; (c) muda status para `ativo`; (d) envia push notification ao lojista.
3: Se a chamada ao Asaas falhar, mantém status `em_analise` e exibe erro ao admin.
4: Log auditoria: `admin_id`, `estabelecimento_id`, timestamp, resultado.

---

### Story 3.9 — Admin rejeita lojista com motivo

**As a** admin,
**I want** rejeitar um lojista informando motivo,
**so that** ele saiba por que e possa corrigir.

**Acceptance Criteria:**
1: Botão "Rejeitar" abre modal com textarea "motivo obrigatório".
2: Ao confirmar, muda status para `rejeitado` e salva `motivo_rejeicao`.
3: Envia push + e-mail ao lojista com o motivo.
4: Lojista rejeitado, ao logar, vê tela com o motivo e botão "Cadastrar novamente" (que zera dados e reinicia Story 3.2).

---

### Story 3.10 — Login do lojista

**As a** lojista aprovado,
**I want** entrar no app com meu e-mail e senha,
**so that** eu acesse o painel.

**Acceptance Criteria:**
1: Mesma estrutura do login do cliente (Story 2.6), mas no tema dark.
2: Após login: se status `ativo`, vai para painel (vazio, com placeholder "Você ainda não tem pedidos" — épicos 4+ preenchem).
3: Se `em_analise`, vai para tela Story 3.6.
4: Se `rejeitado`, vai para tela com motivo (Story 3.9 parte final).
5: Se `suspenso`, tela avisa e oferece WhatsApp da Keepit.

---

### Story 3.11 — Perfil público do estabelecimento (editar)

**As a** lojista ativo,
**I want** editar foto, descrição e horários do meu estabelecimento,
**so that** eu mantenha meu perfil atualizado.

**Acceptance Criteria:**
1: Tela "Perfil público" acessível no menu do lojista.
2: Campos editáveis: foto de fachada, descrição curta, categoria, horários, ticket mínimo próprio, raio de atendimento, tempo médio, taxa de deslocamento, chave PIX de recebimento.
3: CNPJ, nome fantasia, telefone, endereço, e-mail do responsável **não são editáveis pelo lojista** (só admin via painel — fora do MVP; edição via WhatsApp Keepit).
4: Alterações efetivam-se imediatamente (sem re-aprovação).

---

### Story 3.12 — Configurações lojista + Excluir conta

**As a** lojista,
**I want** acessar configurações com Termos, Política e opção de excluir conta,
**so that** eu tenha controle e cumpramos compliance.

**Acceptance Criteria:**
1: Tela "Configurações" com Termos, Política, Ajuda & suporte (WhatsApp), Excluir minha conta.
2: Botão "Excluir minha conta" abre WhatsApp com contexto do lojista.
3: Toggle de notificações.

---

## Definition of Done

- [ ] Todas as 12 stories `Done`.
- [ ] Lojista consegue: onboarding → 3 passos de cadastro → tela "Em análise" → ser aprovado por admin → logar → editar perfil → logout.
- [ ] Admin consegue: login → ver pendentes → aprovar (cria subconta Asaas sandbox verificável) → rejeitar com motivo.
- [ ] Fidelidade visual dark validada em ambos.
- [ ] Auditoria: cada aprovação/rejeição fica logada.
