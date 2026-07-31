# Épico 2 — Auth & Onboarding do Cliente

> **Plano vigente (2026-07-31):** manter toda a experiência de entrada, perfil
> e suporte; push nativo não bloqueia o piloto. O texto abaixo permanece como
> histórico funcional. A prioridade executável está em
> [`../07-plano-mvp-piloto.md`](../07-plano-mvp-piloto.md).

> **Reconciliação (2026-07-30) — decisão 10.4 (Rodada 6, 2026-07-29):** a autenticação do Cliente é **e-mail + senha** (Supabase Auth nativo), **sem confirmação por SMS no MVP** (corta custo/integração Zenvia; entra em v2 se necessário). O telefone passa a ser **campo opcional e não verificado**. Por isso as **Stories 2.4 (Edge Function SMS Zenvia)** e **2.5 (tela de confirmação SMS)** foram **removidas do MVP** — texto original mantido abaixo por rastreabilidade, caso o SMS volte em v2. As demais stories **não foram renumeradas**. Ver `docs/PERGUNTAS_REGRAS_NEGOCIO.md → Decisões → Rodada 6 — 2026-07-29`.

> **Decisão técnica provisória (2026-07-30) — 10.5 `Confirm email` OFF.** Até aqui, o Épico 2 navegava direto para a home **sem decisão registrada** — era um default silencioso. Agora existe **decisão técnica provisória** formalizada em `docs/PERGUNTAS_REGRAS_NEGOCIO.md → 10.5`: `Confirm email` **OFF** no Supabase Auth (opção (a)), com racional (atrito zero, coerência com o protótipo, mitigações já no escopo pelas Stories 2.8/2.10) e **gatilho de revisão** (volume relevante de recuperação de acesso por e-mail errado → ligar ON). É **config por projeto**, reversível sem migration. **Não é decisão do stakeholder** e **não fecha o risco de negócio**: segue pendente de validação se a Keepit aceita que um cliente com e-mail errado dependa de suporte humano para recuperar o PIN de uma **compra já paga**. Afeta as Stories **2.3 (AC5)**, **2.6 (AC4)** e **2.11 (AC1)** — que continuam válidas como escritas.

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
> - **AC3** pedia *"Continuar"* e *"Já tem conta? Entrar"*. No **onboarding** o protótipo diz **"Já tenho conta · Entrar"** (o código está certo, a AC estava errada); *"Continuar"* é botão do frame P6 do Lojista (offset 425758, entre os rótulos P6 em 419901 e P7 em 426122) e não ocorre no fluxo do Cliente.
>   - **Correção da correção (2026-07-30):** a versão anterior desta nota afirmava que *"Já tem conta? Entrar"* **"não existe no fluxo do Cliente"**. **Isso é falso.** A string existe no **offset 341400**, dentro do frame **"09 · Criar conta" do Cliente** (faixa 335223–341824). O erro foi de escopo: ela não existe **no onboarding** (frame 01, onde vale *"Já tenho conta · Entrar"*, offset 276500) — mas existe na tela de Criar conta. Cada rótulo pertence a **uma tela específica**; nenhum dos dois é inválido em geral.
>
> **AC4 não foi alterada.** ACs não foram renumeradas.
>
> **Atualização (2026-07-30) — pergunta 10.7 RESOLVIDA, ACs 1/2/3 revistas de novo.** A correção acima classificou as frases dos cards como "material do design system, não texto de tela" e por isso proibiu usá-las. A verificação no **arquivo-fonte** (`keepit-app/index.html`, bloco `COMO FUNCIONA`, offset ~270394 — não no PNG da legenda, que está cortado) mostra que elas estão **literalmente escritas no protótipo**. Como o **princípio nº 1 do `CLAUDE.md`** define `keepit-app/index.html` como fonte autoritativa de visual **e conteúdo**, aplicá-las **não é invenção — é o oposto**: substitui a copy reconstruída (essa sim inventada no Épico 0) pelo texto real da fonte. A 10.7 está fechada em `docs/PERGUNTAS_REGRAS_NEGOCIO.md` como **fidelidade ao protótipo**, não como decisão de produto. As ACs 1, 2 e 3 abaixo já refletem isso.

> **Correção crítica de rastreabilidade (2026-07-30) — AC1 citava fonte falsa.** A versão anterior da AC1 exigia "indicador de progresso por **dots**" e citava como fonte `docs/design-refs/cliente-01-onboarding.png` + frame "01 · Onboarding" de `keepit-app/index.html`. **O frame 01 não tem dots.** Verificação direta na faixa **272043–276953**: os únicos elementos com `border-radius:50%` são (a) o ícone circular verde de **128px** em 274274 e (b) **dois pontos de 6px** em 275004 e 275363, que são marcadores decorativos **dentro das pílulas "Farmácia" e "Conveniência"** — não um pager. Não existe pager de dots no protótipo do Cliente.
> Este erro é **mais grave** que uma AC sem fonte: uma AC sem fonte deixa o leitor cético e ele confere; uma AC que **cita fonte específica** desliga o ceticismo do @dev e do @qa, e a invenção entra no código com carimbo de verificada. O componente `Dots` vem do **Épico 0** (reconstrução), não do protótipo — e é assim que a AC1 abaixo passa a descrevê-lo.

**Acceptance Criteria:**
1: Fluxo de onboarding em **tema dark** (decisão 10.3), com indicador de progresso por **dots** — 🔵 **reconstrução do Épico 0**. **Sem fonte no protótipo:** o frame "01 · Onboarding" **não tem pager de dots** (verificado na faixa 272043–276953). A referência é o **componente `Dots` do design system entregue no Épico 0** e o código já em `apps/cliente`, não `keepit-app/index.html` nem `docs/design-refs/cliente-01-onboarding.png`. Consequência natural de as telas 1/3 e 2/3 serem estruturais do Épico 0: um pager só faz sentido onde há mais de uma tela, e o protótipo tem **uma única** tela de onboarding do Cliente (a final). Mantém-se **sem** rótulo textual de passo (*"Passo 1 de 3"* é do frame P6 do **Lojista**). A **estrutura de três telas** é decisão do Épico 0 (Story 0.4) e permanece; a **copy** das telas 1/3 e 2/3 vem do protótipo (AC2), por força da decisão 10.7.
2: **Copy — todas verificadas no arquivo-fonte `keepit-app/index.html`.**
   - **Tela 1/3:** texto principal **"Escolhe lojas locais na plataforma"** — literal, bloco `COMO FUNCIONA`, card `1 · Compra`.
   - **Tela 2/3:** texto principal **"Pedido fica pronto no hub Keepit"** — literal, bloco `COMO FUNCIONA`, card `2 · Pronto`.
   - **Tela 3/3 (final): INALTERADA** — título *"Tudo perto de você, retirado no hub."* e subtexto *"Compre de farmácias, lojas e conveniências locais e retire tudo em um ponto de encontro Keepit."*, exatamente como em `cliente-01-onboarding.png` / frame "01 · Onboarding".
   - **Sem subtexto inventado** nas telas 1/3 e 2/3: o protótipo fornece **uma frase por card**, e é só ela que vale. Os subtextos reconstruídos hoje em código (*"Escolha lojas locais na plataforma — farmácia, roupas, conveniência e muito mais."* e *"A loja separa tudo e deixa esperando por você em um Hub Keepit perto de casa."*) e os títulos reconstruídos (*"Compre em lojas perto de você"* / *"Seu pedido fica pronto no Keepit"*) **devem ser removidos**.
   - A frase do card `3 · Encontro` — *"Retira com código PIN no ponto"* — **não é usada em nenhuma tela**, porque a tela 3/3 tem copy própria capturada no protótipo. Consequência assumida e registrada na 10.7: **a palavra "PIN" não aparece antes do cadastro**.
   - ~~**Ajuste pendente no código:** `apps/cliente/src/screens/auth/Onboarding1.tsx` e `Onboarding2.tsx` ainda carregam a copy reconstruída. Correção prevista em **story pequena e isolada de copy** — não implementada nesta rodada de PRD.~~ **RESOLVIDO (2026-07-31) pela Story 2.1.1**, commit `b611d31`. Os dois arquivos agora usam a copy literal do protótipo, os subtextos reconstruídos foram removidos, e o JSDoc que citava `_design-system-legend.png` (admitindo reconstrução por escrito) foi reescrito apontando para `keepit-app/index.html`. Débito **DOC-002 fechado** — verificado por grep independente no gate QA da 2.1.1 (CONCERNS, sem issue high/critical).
3: **Navegação e rótulos.** Tela final (3/3): CTA **"Criar conta"** e link **"Já tenho conta · Entrar"** (com o separador `·`), fiéis ao protótipo. Telas 1/3 e 2/3: mantidos os rótulos entregues no Épico 0 (`"Avançar"` / `"Pular"`). Esses dois rótulos **não têm fonte no protótipo** — consequência inevitável de as telas 1/3 e 2/3 serem estruturais do Épico 0, e não do protótipo. **Não é mais pendência 10.7** (que tratava de copy de conteúdo e está resolvida); é um resíduo de fidelidade de baixo risco, aceito como está. Os rótulos *"Continuar"* e *"Já tem conta? Entrar"* da versão anterior desta AC **não existem** no fluxo do Cliente e foram removidos.
4: Onboarding só aparece uma vez (flag persistida em AsyncStorage/SecureStore); reset possível via "Redefinir onboarding" em dev.

---

### Story 2.2 — Tela de criar conta

**As a** novo cliente,
**I want** criar minha conta com nome, e-mail e senha (telefone opcional),
**so that** eu possa começar a comprar.

> **Correção de rastreabilidade (2026-07-30) — ACs 1, 2 e 3.** Conferência direta contra o frame **"09 · Criar conta"** do Cliente (faixa **335223–341824** de `keepit-app/index.html`). O frame contém, em ordem: título *"Criar conta"*, subtítulo *"Compre em minutos no hub mais perto de você."*, campos **Nome completo / E-mail / Senha**, checkbox de termos, botão *"Criar conta"*, separador *"ou"*, botões **Google** (340598) e **Apple** (341260), e o link *"Já tem conta? Entrar"* (341400). Três divergências corrigidas abaixo: **login social** (conflito com a 10.2), **campo telefone** (não existe no protótipo) e **copy do aceite de termos**.

**Acceptance Criteria:**
1: Tela replica o protótipo (fundo claro, campos empilhados, botão "Criar conta" verde) — **exceto o bloco de login social**. O frame 09 traz o separador *"ou"* e os botões **Google** (offset 340598) e **Apple** (341260); eles **não entram no MVP**. Motivo: a **Rodada 2** decidiu login social fora do escopo, e o conflito com o protótipo está registrado como **pendência 10.2 🟡 (aberta desde 2026-07-28, → STAKEHOLDER)**. **Enquanto a 10.2 não fechar**, o comportamento assumido é: **não renderizar** os botões Google/Apple nem o separador *"ou"*. A 10.2 ainda pode decidir por mostrá-los desabilitados ou reverter e trazer login social para o MVP — nesse caso esta AC muda. **O @dev não deve decidir isso sozinho:** implementar OAuth seria escopo fora do MVP, e escolher entre "esconder" e "desabilitar" é decisão de produto, vedada a agentes pelo `CLAUDE.md`.
2: Campos **obrigatórios**: nome completo, e-mail, senha (mín. 8 caracteres). Campo **opcional**: telefone (máscara BR), rotulado como "Telefone (opcional)".
   - **Origem do campo telefone: requisito funcional (FR1) + decisão 10.4 — NÃO é elemento do protótipo.** A string `Telefone` **não ocorre uma única vez** em todo o `keepit-app/index.html` (0 ocorrências, verificado em todo o arquivo). O frame 09 tem **apenas** Nome completo / E-mail / Senha. Portanto a ressalva de "replicar o protótipo" da AC1 **não cobre** este campo: ele é adição funcional deliberada, e sua presença na tela é um **desvio conhecido e aceito** do protótipo, não fidelidade.
3: Checkbox com a copy **literal do protótipo** (offset 339522): **"Aceito os Termos e a Política de Privacidade."** — **sem** "de Uso" e com **"e a"**, não "e". Links stub (`keepit.app/termos` e `/privacidade`); aceite obrigatório para prosseguir. *(A versão anterior desta AC dizia "Aceito os Termos de Uso e Política de Privacidade" — divergência da AC, não do código: o código já está fiel.)*
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
5: Sucesso **navega direto para a home** do cliente (home vazia; Épico 5 preenche depois). Não há etapa intermediária de confirmação de telefone **nem de e-mail** — respaldado pela **decisão técnica provisória 10.5** (`Confirm email` OFF), não mais por default implícito. Se a 10.5 for revertida para ON, esta AC ganha uma tela "confirme seu e-mail" antes da home.

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
1: Tela replica o protótipo ("Bem-vindo de volta", subtítulo *"Entre para continuar comprando."*, campos e-mail/senha, botão "Entrar") — **exceto o bloco de login social**. O frame **"10 · Login"** (faixa 341824–347870) traz o separador *"ou"* e os botões **Google** (offset 346334) e **Apple** (346996); eles **não entram no MVP**, pela mesma razão da Story 2.2 AC1: Rodada 2 (login social fora do escopo) vs. protótipo, conflito registrado na pendência **10.2 🟡 (aberta, → STAKEHOLDER)**. **Enquanto a 10.2 não fechar**, o assumido é **não renderizar** Google/Apple nem o separador *"ou"*. Se a 10.2 fechar por "mostrar desabilitado" ou por reverter a decisão, esta AC muda. **Decisão de produto — não cabe ao @dev resolver na implementação.**
2: Link "Esqueci a senha" abaixo da senha (literal no frame 10).
3: Erro de credencial inválida mostrado como toast.
4: Ao entrar, navega direto para a home do cliente — **não há redirecionamento condicional** por estado de telefone (decisão 10.4) **nem por estado de confirmação de e-mail** (decisão técnica provisória 10.5, `Confirm email` OFF).
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
1: Tela "Perfil" replica o protótipo — frame **"08 · Perfil"** (faixa **325034–335223**), cuja estrutura verificada é: avatar circular com **uma única inicial** do nome (no protótipo, `T` de *"Thiago Freitas"*), nome grande, e-mail abaixo, ação **"Editar"**, **dois cards de estatística** (*"12 Pedidos"* e *"2 Hubs favoritos"*) e uma **lista de itens de menu com chevron** (*Meus pedidos*, *Hubs favoritos*, *Formas de pagamento*, *Notificações*, *Ajuda & suporte*).
   - **Correção (2026-07-30):** a versão anterior dizia "avatar circular com **iniciais**" (plural) e "**botões de ações**". Ambos estavam errados. O protótipo usa **uma inicial só** — o código (`apps/cliente/src/screens/perfil/Perfil.tsx`, `charAt(0)`) **já está correto**, era a AC que divergia. E **"botões de ações" não existe** no frame 08: o que há são os 2 cards de estatística e a lista de menu descritos acima.
   - **Nota de escopo (10.8):** os itens *Notificações* e *Ajuda & suporte* deste menu também aparecem nas Stories 2.9 e 2.10 como parte de uma tela "Configurações" que **não existe no protótipo**. A arquitetura de navegação (Perfil e Configurações separados, ou tudo no Perfil) é a **pergunta 10.8**, aberta. Esta AC descreve **o que o protótipo mostra**; a repartição entre stories só se resolve com a 10.8.
2: Editar nome atualiza em `clientes`.
3: Editar e-mail dispara fluxo de confirmação (via Supabase Auth). **Esta AC é mitigação explícita da decisão 10.5** (`Confirm email` OFF): é o caminho pelo qual um cliente que digitou o e-mail errado no cadastro se corrige sozinho. **Não remover sem revisar a 10.5.**
4: Editar telefone faz **update direto** em `clientes.telefone` (sem verificação, sem SMS — decisão 10.4). O cliente pode inclusive **limpar** o campo, já que o telefone é opcional.
5: Logout funciona (limpa sessão e volta para login).

---

### Story 2.9 — Tela de configurações + Excluir conta

**As a** cliente,
**I want** acessar configurações com Termos, Política, notificações e opção de excluir conta,
**so that** eu controle a conta e o app cumpra compliance.

> **⚠️ BLOQUEADA PELA PERGUNTA 10.8 (aberta, sem default) — 2026-07-30.** A tela "Configurações do Cliente" **não existe no protótipo**: a string `Configurações` só ocorre em 453585 e 455290, ambas no frame **P11 do Lojista**; `Excluir` tem **0 ocorrências** no arquivo; e *Notificações* (331393) e *Ajuda & suporte* (332280) são **itens de menu dentro do Perfil** (frame 08), não seções de uma tela separada. As Stories 2.8, 2.9 e 2.10 disputam a mesma superfície de UI sem arquitetura de navegação decidida. **Não implementar as ACs abaixo antes da 10.8 fechar** — elas descrevem uma tela cuja existência é justamente o que está em questão. Ver `docs/PERGUNTAS_REGRAS_NEGOCIO.md → 10.8`. **Nenhum default assumido.**

**Acceptance Criteria:**
1: **[dependente da 10.8]** Tela "Configurações" com seções: Notificações (toggle habilitado por padrão), Termos de Uso (link externo `keepit.app/termos`), Política de Privacidade (link externo), Ajuda & suporte (Story 2.10), Excluir minha conta. **Se a 10.8 fechar por "tudo no Perfil"**, estas seções viram itens do menu do frame 08 e esta story deixa de ter tela própria — as ACs 2 e 3 continuam válidas quanto ao **comportamento**, mudando só a superfície onde vivem.
2: Botão "Excluir minha conta" abre WhatsApp da Keepit com mensagem pré-preenchida: *"Olá! Sou {nome} ({email}) e quero excluir minha conta Keepit. Por favor confirmem quando estiver pronto."* — atende Apple 5.1.1(v).
3: Toggle de notificações persiste em `clientes.notificacoes_ativas` e afeta envio de pushes futuros.

---

### Story 2.10 — Botão "Ajuda & suporte" via WhatsApp

**As a** cliente,
**I want** acessar suporte da Keepit rapidamente,
**so that** eu resolva problemas sem procurar canal externo.

**Acceptance Criteria:**
1: **[superfície dependente da 10.8]** Item "Ajuda & suporte" abre WhatsApp da Keepit (número em config). **Onde o item vive está em aberto:** o protótipo o mostra como item de menu **dentro do Perfil** (frame 08, offset 332280); esta AC (e a Story 2.9 AC1) o colocam em **Configurações**. Ver `docs/PERGUNTAS_REGRAS_NEGOCIO.md → 10.8`. O **comportamento** desta story não depende da 10.8 — só a tela em que o item aparece. **Esta story é a segunda mitigação da decisão 10.5** — é o canal humano de recuperação para o cliente que perdeu acesso ao e-mail e, com ele, ao PIN de um pedido em andamento. **Não remover sem revisar a 10.5.**
2: Mensagem pré-preenchida: *"Olá! Sou {nome}. Preciso de ajuda."*
3: Número da Keepit vem de `packages/config/business-rules.ts` (não hardcoded).

---

### Story 2.11 — Solicitar permissão de push notification

**As a** cliente que acabou de criar a conta,
**I want** ser convidado a habilitar notificações no momento certo,
**so that** eu receba updates dos meus pedidos.

**Acceptance Criteria:**
1: **Novo gatilho (decisão 10.4):** o prompt de permissão de push nativa (iOS/Android) é disparado **na primeira entrada na home após o signup bem-sucedido (Story 2.3)** — ponto que substitui a antiga confirmação SMS (Story 2.5, removida). O prompt roda **uma única vez** por instalação (flag persistida); não reaparece a cada login. O gatilho "primeira entrada na home logo após o signup" só existe porque **não há tela intermediária de confirmação de e-mail** (decisão técnica provisória **10.5**, `Confirm email` OFF); se a 10.5 for revertida para ON, reavaliar o momento do prompt.
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
