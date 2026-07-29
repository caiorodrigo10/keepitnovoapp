# Épico 2 — Auth & Onboarding do Cliente

## Expanded Goal

Entregar o **caminho de entrada completo** para o cliente: onboarding "Como funciona" com fidelidade ao protótipo, cadastro com e-mail + senha + telefone, confirmação de telefone por SMS via Zenvia, login, recuperação de senha, tela de perfil e configurações (incluindo botão de exclusão de conta compliance Apple). Sem esse épico, ninguém entra no app do cliente.

Ao final: um cliente novo consegue baixar o app, criar conta, confirmar telefone, entrar, e sair, com todos os textos e visuais coerentes com o protótipo.

## Prerequisites

- Épico 1 concluído (monorepo, Supabase, ui-tokens, app cliente bootado).

## Stories

### Story 2.1 — Onboarding "Como funciona" (3 telas)

**As a** novo cliente,
**I want** ver 3 telas explicando como o Keepit funciona (comprar → esperar → retirar no hub com PIN),
**so that** eu entenda o modelo antes de criar conta.

**Acceptance Criteria:**
1: 3 telas com pager indicator ("Passo 1 de 3") replicando o protótipo.
2: Textos fiéis: "Escolhe lojas locais na plataforma", "Pedido fica pronto no hub Keepit", "Retira com código PIN no ponto".
3: Botão "Continuar" avança; na última tela, botão "Criar conta" e link "Já tem conta? Entrar".
4: Onboarding só aparece uma vez (flag persistida em AsyncStorage/SecureStore); reset possível via "Redefinir onboarding" em dev.

---

### Story 2.2 — Tela de criar conta

**As a** novo cliente,
**I want** criar minha conta com nome, e-mail, senha e telefone,
**so that** eu possa começar a comprar.

**Acceptance Criteria:**
1: Tela replica o protótipo (fundo claro, campos empilhados, botão "Criar conta" verde).
2: Campos: nome completo, e-mail, senha (mín. 8 caracteres), telefone (máscara BR).
3: Checkbox "Aceito os Termos de Uso e Política de Privacidade" com links stub (`keepit.app/termos` e `/privacidade`) — obrigatório para prosseguir.
4: Validação em tempo real (e-mail formato, senha comprimento, telefone completo).
5: Mensagens de erro claras em português.
6: CPF **não** é solicitado nesta tela (é solicitado no primeiro checkout — Épico 6).

---

### Story 2.3 — Integração Supabase Auth para signup

**As a** cliente,
**I want** ao submeter o cadastro, uma conta ser criada em Supabase Auth e uma linha em `clientes`,
**so that** minha conta exista e permita login futuro.

**Acceptance Criteria:**
1: Migration cria tabela `clientes (id uuid PK referencing auth.users, nome text, telefone text, telefone_confirmado bool default false, cpf text nullable, criado_em timestamptz default now())`.
2: RLS ativada: cliente só pode ler/atualizar sua própria linha.
3: Trigger insere linha em `clientes` automaticamente ao criar user em `auth.users` (com metadata nome + telefone).
4: Erro de e-mail já existente é mostrado claramente na tela.
5: Sucesso navega para Story 2.4 (confirmação SMS).

---

### Story 2.4 — Edge Function envia SMS de confirmação via Zenvia

**As a** cliente que acabou de cadastrar,
**I want** receber um SMS com código de 4-6 dígitos para confirmar meu telefone,
**so that** o Keepit tenha certeza que é meu número.

**Acceptance Criteria:**
1: Edge Function `enviar-sms-confirmacao` gera código aleatório de 4 dígitos, salva em `clientes_confirmacao_telefone (cliente_id, codigo_hash, expires_at, tentativas)` com expiração de 10 min.
2: Chama API Zenvia com `ZENVIA_API_TOKEN` (env) enviando SMS ao telefone do cliente.
3: Rate limit: no máximo 3 SMS por telefone por hora.
4: Log estruturado no Supabase (sem PII no log).

---

### Story 2.5 — Tela de confirmação SMS

**As a** cliente que recebeu o SMS,
**I want** digitar o código na tela do app,
**so that** meu telefone fique confirmado.

**Acceptance Criteria:**
1: Tela com 4 caixinhas grandes de dígito (auto-avança).
2: Botão "Reenviar SMS" habilitado após 60s (usa Edge Function 2.4 respeitando rate limit).
3: Ao digitar código correto: Edge Function `verificar-codigo-telefone` valida, marca `telefone_confirmado = true`, e navega para home vazia (Épico 5 preenche depois).
4: Código errado: exibe erro, permite retry (5 tentativas antes de bloqueio por 5 min).
5: Código expirado: mensagem clara + link "Solicitar novo código".

---

### Story 2.6 — Tela de login

**As a** cliente existente,
**I want** entrar com meu e-mail e senha,
**so that** eu acesse minha conta.

**Acceptance Criteria:**
1: Tela replica o protótipo ("Bem-vindo de volta", campos e-mail/senha, botão "Entrar").
2: Link "Esqueci a senha" abaixo da senha.
3: Erro de credencial inválida mostrado como toast.
4: Ao entrar, se `telefone_confirmado = false`, redireciona para tela de confirmação SMS (Story 2.5).
5: Sessão persistida (refresh token via Supabase Auth).

---

### Story 2.7 — Fluxo "Esqueci a senha"

**As a** cliente que esqueceu a senha,
**I want** solicitar redefinição por e-mail,
**so that** eu recupere acesso.

**Acceptance Criteria:**
1: Tela solicita e-mail; submit chama `supabase.auth.resetPasswordForEmail()`.
2: E-mail com link de redefinição chega ao usuário (usa template padrão do Supabase Auth, texto em pt-BR).
3: Tela pós-clique no link permite definir nova senha (deep link ou universal link).
4: Sucesso navega para login com toast "Senha redefinida".

---

### Story 2.8 — Tela de perfil do cliente

**As a** cliente logado,
**I want** ver e editar meu nome, e-mail e telefone,
**so that** eu mantenha meus dados atualizados.

**Acceptance Criteria:**
1: Tela "Perfil" replica o protótipo (avatar circular com iniciais, nome grande, e-mail abaixo, botões de ações).
2: Editar nome atualiza em `clientes`.
3: Editar e-mail dispara fluxo de confirmação (via Supabase Auth).
4: Editar telefone dispara novo SMS de confirmação (reusa Story 2.4).
5: Logout funciona (limpa sessão e volta para login).

---

### Story 2.9 — Tela de configurações + Excluir conta

**As a** cliente,
**I want** acessar configurações com Termos, Política, notificações e opção de excluir conta,
**so that** eu controle a conta e o app cumpra compliance.

**Acceptance Criteria:**
1: Tela "Configurações" com seções: Notificações (toggle habilitado por padrão), Termos de Uso (link externo `keepit.app/termos`), Política de Privacidade (link externo), Ajuda & suporte (Story 2.10), Excluir minha conta.
2: Botão "Excluir minha conta" abre WhatsApp da Keepit com mensagem pré-preenchida: *"Olá! Sou {nome} ({email}) e quero excluir minha conta Keepit. Por favor confirmem quando estiver pronto."* — atende Apple 5.1.1(v).
3: Toggle de notificações persiste em `clientes.notificacoes_ativas` e afeta envio de pushes futuros.

---

### Story 2.10 — Botão "Ajuda & suporte" via WhatsApp

**As a** cliente,
**I want** acessar suporte da Keepit rapidamente,
**so that** eu resolva problemas sem procurar canal externo.

**Acceptance Criteria:**
1: Item "Ajuda & suporte" em Configurações abre WhatsApp da Keepit (número em config).
2: Mensagem pré-preenchida: *"Olá! Sou {nome}. Preciso de ajuda."*
3: Número da Keepit vem de `packages/config/business-rules.ts` (não hardcoded).

---

### Story 2.11 — Solicitar permissão de push notification

**As a** cliente que confirmou telefone,
**I want** ser convidado a habilitar notificações no momento certo,
**so that** eu receba updates dos meus pedidos.

**Acceptance Criteria:**
1: Após confirmação SMS bem-sucedida (Story 2.5), app solicita permissão de push nativa (iOS/Android).
2: Se aceitar, `expoPushToken` é salvo em `clientes.expo_push_token` via Edge Function.
3: Se recusar, `clientes.notificacoes_ativas = false`; app continua funcionando normalmente.
4: Toggle em Configurações (Story 2.9) permite reativar (com novo prompt de permissão).

---

## Definition of Done

- [ ] Todas as 11 stories `Done`.
- [ ] Um cliente novo consegue: baixar app → onboarding → cadastrar → confirmar SMS → entrar → editar perfil → logout → login novamente.
- [ ] Todos os textos e visuais coerentes com o protótipo (aprovação visual manual).
- [ ] Botão "Excluir conta" testado — abre WhatsApp com mensagem correta.
- [ ] Push notification token capturado no banco após aceite.
