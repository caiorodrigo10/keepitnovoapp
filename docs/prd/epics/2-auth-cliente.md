# Épico 2 — Auth & Onboarding do Cliente

> **Reconciliação (2026-07-30) — decisão 10.4 (Rodada 6, 2026-07-29):** a autenticação do Cliente é **e-mail + senha** (Supabase Auth nativo), **sem confirmação por SMS no MVP** (corta custo/integração Zenvia; entra em v2 se necessário). O telefone passa a ser **campo opcional e não verificado**. Por isso as **Stories 2.4 (Edge Function SMS Zenvia)** e **2.5 (tela de confirmação SMS)** foram **removidas do MVP** — texto original mantido abaixo por rastreabilidade, caso o SMS volte em v2. As demais stories **não foram renumeradas**. Ver `docs/PERGUNTAS_REGRAS_NEGOCIO.md → Decisões → Rodada 6 — 2026-07-29`.

## Expanded Goal

Entregar o **caminho de entrada completo** para o cliente: onboarding "Como funciona" com fidelidade ao protótipo, cadastro com e-mail + senha (telefone opcional, não verificado), login, recuperação de senha, tela de perfil e configurações (incluindo botão de exclusão de conta compliance Apple). Sem esse épico, ninguém entra no app do cliente.

Ao final: um cliente novo consegue baixar o app, criar conta com e-mail + senha, entrar, e sair, com todos os textos e visuais coerentes com o protótipo.

## Prerequisites

- Épico 1 concluído (monorepo, Supabase, ui-tokens, app cliente bootado).

## Stories

### Story 2.1 — Onboarding "Como funciona" (3 telas)

**As a** novo cliente,
**I want** ver 3 telas explicando como o Keepit funciona (comprar → esperar → retirar no hub com PIN),
**so that** eu entenda o modelo antes de criar conta.

> **Correção de rastreabilidade (2026-07-30) — Article IV (No Invention).** As ACs 1, 2 e 3 foram reescritas após conferência direta contra as fontes (`docs/design-refs/cliente-01-onboarding.png`, `docs/design-refs/_design-system-legend.png`, `keepit-app/index.html` e o código já entregue no Épico 0). O que estava errado na versão anterior:
> - **AC1** exigia um pager textual *"Passo 1 de 3"*. Esse rótulo **existe no protótipo, mas em outra tela** — o *Cadastro do estabelecimento* do **Lojista** (frame "P6"). O onboarding do Cliente não tem rótulo de passo; o indicador é de **dots**.
> - **AC2** tratava as três frases como copy de três telas de onboarding. As frases **existem literalmente** em `keepit-app/index.html`, porém no bloco **"COMO FUNCIONA"** da legenda do design system (cards "1 · Compra", "2 · Pronto", "3 · Encontro") — um explicador do sistema de design, **não** texto de tela. O protótipo tem **uma única** tela de onboarding do Cliente (frame "01 · Onboarding").
> - **AC3** pedia *"Continuar"* e *"Já tem conta? Entrar"*. O protótipo diz **"Já tenho conta · Entrar"** (o código está certo, a AC estava errada); *"Continuar"* é botão do frame P6 do Lojista e não ocorre no fluxo do Cliente.
>
> **AC4 não foi alterada.** ACs não foram renumeradas. A lacuna de copy das telas 1/3 e 2/3 está registrada como pergunta aberta **10.7** em `docs/PERGUNTAS_REGRAS_NEGOCIO.md` — **não inventar texto substituto até a resposta**.

**Acceptance Criteria:**
1: Fluxo de onboarding em **tema dark** (decisão 10.3), com indicador de progresso por **dots** (componente `Dots` do design system, entregue no Épico 0) — **sem** rótulo textual de passo. Fonte: `docs/design-refs/cliente-01-onboarding.png` + frame "01 · Onboarding" de `keepit-app/index.html`. O protótipo capturou **apenas a tela final**; as telas 1/3 e 2/3 entregues no Épico 0 (Story 0.4) são reconstruções assistidas, sem captura correspondente — condição documentada nos próprios arquivos `Onboarding1.tsx`/`Onboarding2.tsx` e sujeita à pergunta 10.7.
2: **Copy verificada — tela final (3/3):** título *"Tudo perto de você, retirado no hub."* e subtexto *"Compre de farmácias, lojas e conveniências locais e retire tudo em um ponto de encontro Keepit."*, exatamente como em `cliente-01-onboarding.png` / `keepit-app/index.html`. **Copy não verificada — telas 1/3 e 2/3:** o protótipo **não fornece** texto de tela para elas. As frases *"Escolhe lojas locais na plataforma"*, *"Pedido fica pronto no hub Keepit"* e *"Retira com código PIN no ponto"* pertencem ao bloco "COMO FUNCIONA" da legenda do design system (`_design-system-legend.png`, onde inclusive o card 2 aparece cortado e o card 3 não aparece) e **não podem ser promovidas a copy de onboarding sem decisão de produto**. Vale o texto atualmente em código até a pergunta **10.7** ser respondida; **não substituir por copy nova**.
3: **Navegação e rótulos.** Tela final (3/3): CTA **"Criar conta"** e link **"Já tenho conta · Entrar"** (com o separador `·`), fiéis ao protótipo. Telas 1/3 e 2/3: botão de avanço e atalho para o cadastro conforme entregue no Épico 0 (`"Avançar"` / `"Pular"`) — rótulos **sem fonte no protótipo** (consequência direta de não haver captura dessas telas), cobertos pela mesma pendência 10.7. Os rótulos *"Continuar"* e *"Já tem conta? Entrar"* da versão anterior desta AC **não existem** no fluxo do Cliente e foram removidos.
4: Onboarding só aparece uma vez (flag persistida em AsyncStorage/SecureStore); reset possível via "Redefinir onboarding" em dev.

---

### Story 2.2 — Tela de criar conta

**As a** novo cliente,
**I want** criar minha conta com nome, e-mail e senha (telefone opcional),
**so that** eu possa começar a comprar.

**Acceptance Criteria:**
1: Tela replica o protótipo (fundo claro, campos empilhados, botão "Criar conta" verde).
2: Campos **obrigatórios**: nome completo, e-mail, senha (mín. 8 caracteres). Campo **opcional**: telefone (máscara BR), rotulado como "Telefone (opcional)".
3: Checkbox "Aceito os Termos de Uso e Política de Privacidade" com links stub (`keepit.app/termos` e `/privacidade`) — obrigatório para prosseguir.
4: Validação em tempo real: e-mail (formato) e senha (comprimento) bloqueiam o submit. Telefone só é validado **se preenchido** (formato BR completo); telefone vazio **não** bloqueia o cadastro.
5: Mensagens de erro claras em português.
6: CPF **não** é solicitado nesta tela (é solicitado no primeiro checkout — Épico 6).
7: O telefone é **informativo e não verificado** (decisão 10.4) — a tela não promete SMS nem confirmação de número.

---

### Story 2.3 — Integração Supabase Auth para signup

**As a** cliente,
**I want** ao submeter o cadastro, uma conta ser criada em Supabase Auth e uma linha em `clientes`,
**so that** minha conta exista e permita login futuro.

**Acceptance Criteria:**
1: Migration cria tabela `clientes (id uuid PK referencing auth.users, nome text, telefone text nullable, cpf text nullable, criado_em timestamptz default now())`. **Sem coluna `telefone_confirmado`** — telefone não é verificado no MVP (decisão 10.4).
2: RLS ativada: cliente só pode ler/atualizar sua própria linha.
3: Trigger insere linha em `clientes` automaticamente ao criar user em `auth.users` (com metadata nome + telefone, sendo telefone possivelmente nulo).
4: Erro de e-mail já existente é mostrado claramente na tela.
5: Sucesso **navega direto para a home** do cliente (home vazia; Épico 5 preenche depois). Não há etapa intermediária de confirmação de telefone.

---

### Story 2.4 — Edge Function envia SMS de confirmação via Zenvia

> **Removida do MVP pela decisão 10.4 (2026-07-29).** Sem confirmação de telefone por SMS: corta o custo e a integração com a Zenvia, e o telefone passa a ser campo opcional e não verificado. Candidata a voltar em v2 se a verificação de número virar necessária. Texto original mantido por rastreabilidade.

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

> **Removida do MVP pela decisão 10.4 (2026-07-29).** Sem SMS não existe código a confirmar; o cadastro (Story 2.3) navega direto para a home. A tela `ConfirmacaoSMS` da casca visual (Épico 0, Stories 0.3/0.4) fica **fora do fluxo de navegação** do MVP. Candidata a voltar em v2 junto com a Story 2.4. Texto original mantido por rastreabilidade.

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
4: Ao entrar, navega direto para a home do cliente — **não há redirecionamento condicional** por estado de telefone (decisão 10.4).
5: Sessão persistida (refresh token via Supabase Auth).
6: Re-login com e-mail + senha é o caminho de recuperação de acesso ao **PIN** de um pedido em andamento (fallback definido na decisão 10.4, em substituição ao envio por SMS). O PIN em si é exibido pelo Épico 7.

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
**I want** ver e editar meu nome, e-mail e telefone (opcional),
**so that** eu mantenha meus dados atualizados.

**Acceptance Criteria:**
1: Tela "Perfil" replica o protótipo (avatar circular com iniciais, nome grande, e-mail abaixo, botões de ações).
2: Editar nome atualiza em `clientes`.
3: Editar e-mail dispara fluxo de confirmação (via Supabase Auth).
4: Editar telefone faz **update direto** em `clientes.telefone` (sem verificação, sem SMS — decisão 10.4). O cliente pode inclusive **limpar** o campo, já que o telefone é opcional.
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

**As a** cliente que acabou de criar a conta,
**I want** ser convidado a habilitar notificações no momento certo,
**so that** eu receba updates dos meus pedidos.

**Acceptance Criteria:**
1: **Novo gatilho (decisão 10.4):** o prompt de permissão de push nativa (iOS/Android) é disparado **na primeira entrada na home após o signup bem-sucedido (Story 2.3)** — ponto que substitui a antiga confirmação SMS (Story 2.5, removida). O prompt roda **uma única vez** por instalação (flag persistida); não reaparece a cada login.
2: Se aceitar, `expoPushToken` é salvo em `clientes.expo_push_token` via Edge Function.
3: Se recusar, `clientes.notificacoes_ativas = false`; app continua funcionando normalmente.
4: Toggle em Configurações (Story 2.9) permite reativar (com novo prompt de permissão).

---

## Definition of Done

- [ ] Todas as **9 stories ativas** `Done`: 2.1, 2.2, 2.3, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11. *(2.4 e 2.5 removidas do MVP pela decisão 10.4 — mantidas no documento por rastreabilidade; numeração das demais preservada.)*
- [ ] Um cliente novo consegue: baixar app → onboarding → cadastrar (e-mail + senha, telefone opcional) → cair direto na home → editar perfil → logout → login novamente.
- [ ] Todos os textos e visuais coerentes com o protótipo (aprovação visual manual).
- [ ] Botão "Excluir conta" testado — abre WhatsApp com mensagem correta.
- [ ] Push notification token capturado no banco após aceite.
