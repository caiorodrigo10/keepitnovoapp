# 02 — Requirements

Requisitos funcionais (FR) e não-funcionais (NFR) do MVP. Cada item tem identificador estável, usado como referência nas Stories.

Regras de negócio detalhadas por trás de cada FR estão em `docs/PERGUNTAS_REGRAS_NEGOCIO.md`.

## Functional Requirements — Cliente (App)

- **FR1**: O sistema permite cadastro do cliente com **nome, e-mail, senha e telefone**, exigindo aceite explícito dos Termos de Uso e Política de Privacidade.
- **FR2**: O sistema envia SMS via Zenvia com código de 4-6 dígitos para **confirmação de telefone** logo após o cadastro.
- **FR3**: O sistema permite **login** do cliente com e-mail e senha, incluindo fluxo "esqueci minha senha" via e-mail.
- **FR4**: O cliente é apresentado a um **onboarding de 3 telas** ("Como funciona") no primeiro uso, seguindo o protótipo fielmente.
- **FR5**: O cliente **escolhe primeiro um hub** próximo (lista ordenada por distância via Haversine, calculada a partir do GPS do device).
- **FR6**: Após escolher o hub, o cliente vê as **lojas disponíveis no hub** (dentro do raio de atendimento de cada lojista), com estado (Aberta / Fechada / Pausada) exibido.
- **FR7**: O cliente pode **filtrar lojas por categoria** (alimentação, farmácia, vestuário e demais categorias abertas).
- **FR8**: O cliente pode **buscar por produto** ou **buscar por loja** — duas entradas coexistem.
- **FR9**: O cliente vê o **catálogo da loja** com produtos, preço, foto e descrição.
- **FR10**: O cliente adiciona itens ao **carrinho** com quantidade selecionada.
- **FR11**: O checkout exibe subtotal + **taxa de deslocamento** (definida pelo lojista) + total, e permite escolher forma de pagamento (**PIX ou cartão de crédito**, incluindo cartões salvos).
- **FR12**: O cliente pode **adicionar um novo cartão** via tokenização Asaas dentro do fluxo de checkout.
- **FR13**: O sistema **bloqueia pedido "impossível"** no checkout se `agora + tempo_médio_lojista + 10min > horário_fechamento_hub`, exibindo mensagem clara ao cliente.
- **FR14**: O sistema **bloqueia pedido abaixo do ticket mínimo** — R$ 20 global ou valor próprio da loja se definido (prevalece o da loja).
- **FR15**: Ao confirmar o pagamento, o sistema **gera um PIN de 4 dígitos único** por pedido.
- **FR16**: O cliente acessa a tela **"Confirmar retirada · PIN"** para ver o código a ser mostrado ao lojista no hub.
- **FR17**: Após a entrega, o cliente acessa um **recibo do pedido concluído** (dentro do app; sem PDF, sem e-mail).
- **FR18**: O cliente vê **"Meus pedidos"** com abas *Em andamento* e *Concluídos*.
- **FR19**: O cliente pode **cancelar o pedido** conforme a matriz de cancelamento definida (antes do aceite: 100%; entre aceite e "Saindo pro hub": 90%; depois: não permitido).
- **FR20**: O cliente pode reportar **"Lojista não veio"** quando aplicável, disparando estorno 100% + registro de falha de qualidade ao lojista.
- **FR21**: O cliente vê **"Perfil"** com dados básicos, editáveis.
- **FR22**: Em "Ajuda & suporte" e no detalhe do pedido, há **botão "Falar com Keepit"** que abre WhatsApp da Keepit com contexto pré-preenchido.
- **FR23**: No detalhe do pedido ou detalhe da loja, há **botão "Falar com o lojista"** que abre WhatsApp do lojista cadastrado.
- **FR24**: No perfil do cliente existe **botão "Excluir minha conta"** que abre WhatsApp da Keepit com mensagem pré-preenchida (*"Quero excluir minha conta"*) — atende Apple Guideline 5.1.1(v) e LGPD.
- **FR25**: O sistema solicita permissão de **push notification** de forma opt-in leve (habilitado por padrão após cadastro; opção de desligar em Configurações).

## Functional Requirements — Lojista (App)

- **FR26**: O lojista se cadastra com e-mail, senha, telefone e passa por **onboarding em 3 passos** para o estabelecimento (dados básicos → operacionais → recebimento).
- **FR27**: O sistema valida o **CNPJ via BrasilAPI** (grátis) no cadastro.
- **FR28**: O lojista informa: **nome fantasia, CNPJ, categoria, endereço da loja (lat/long), raio de atendimento em km, tempo médio de entrega em min, taxa de deslocamento por pedido, ticket mínimo próprio (opcional), chave PIX de recebimento, foto de fachada, horário de funcionamento por dia da semana**.
- **FR29**: Após o cadastro, o estabelecimento fica em estado **"Em análise"** até aprovação do admin. Cliente não vê a loja nesse estado.
- **FR30**: O lojista tem acesso a um **dashboard** com vendas (7 / 30 / 90 / 1 ano), saldo disponível, ticket médio e top produtos.
- **FR31**: O lojista vê **"Pedidos recebidos"** com filtros por status (Novos, Em preparo, Concluídos).
- **FR32**: O lojista **aceita o pedido em até 10 min** após recebimento, informando o **tempo estimado de entrega** (pré-preenchido pelo tempo médio do cadastro, editável caso a caso). Se não aceitar em 10 min, sistema cancela automaticamente com estorno 100% (item na fila de reembolso manual do admin).
- **FR33**: O lojista pode **recusar o pedido** antes do aceite informando motivo obrigatório (sem estoque / fora do horário / outro).
- **FR34**: Após aceite, o lojista marca **"Saindo para o hub"**, o que dispara push ao cliente.
- **FR35**: No hub, ambos apertam **"Cheguei ao hub"**, iniciando janela de tolerância de 10 min.
- **FR36**: O lojista **digita o PIN de 4 dígitos** para confirmar a entrega. Após 5 tentativas erradas, o sistema **bloqueia por 5 minutos** e libera novamente.
- **FR37**: O lojista pode marcar **"Cliente não apareceu"** após 10 min pós-chegada, aplicando divisão 20% cliente / 80% lojista.
- **FR38**: O lojista **gerencia o catálogo** de produtos (criar, editar, pausar/excluir) com upload de foto pelo próprio app (sem moderação prévia).
- **FR39**: O lojista configura **horários de funcionamento** por dia da semana e tem botão **"Pausar novos pedidos"** para fechar manualmente a qualquer momento.
- **FR40**: O lojista vê **"Carteira"** com **saldo disponível** (pedidos entregues há > 7 dias) e **saldo bloqueado** (pedidos entregues há ≤ 7 dias), menos chargebacks e taxas.
- **FR41**: O lojista pode **solicitar saque** via PIX (mínimo R$ 200), disparando transferência única da conta master Keepit direto para o banco do lojista via PIX externo Asaas.
- **FR42**: O lojista vê **extrato simples** com últimas 30 vendas e últimos saques, filtro básico por 7 / 30 / 90 dias.
- **FR43**: O lojista pode editar o **perfil público** do estabelecimento (foto, descrição, categoria — não CNPJ nem dados sensíveis).
- **FR44**: O lojista tem os mesmos botões de suporte (**Falar com Keepit**) e de exclusão de conta (**via WhatsApp**) que o cliente.

## Functional Requirements — Admin (Web)

- **FR45**: O admin acessa o painel via **login com e-mail e senha** (sem SSO, sem 2FA no MVP).
- **FR46**: O admin vê **lista de lojistas** e pode **aprovar, rejeitar (com motivo) ou suspender** cada um. Aprovar dispara criação de subconta Asaas via API.
- **FR47**: O admin vê **lista de pedidos** com filtros por status, busca por número, cliente ou lojista.
- **FR48**: O admin pode **forçar cancelamento** de um pedido em qualquer estado (com estorno via Asaas).
- **FR49**: O admin vê **fila de reembolsos manuais** com estados `pendente_admin → em_processamento → estornado`. Cada item traz motivo (timeout, cancelamento, no-show cliente/lojista, chargeback), valor a estornar, forma de pagamento original.
- **FR50**: O admin pode **executar um reembolso** disparando o estorno via API Asaas, marcando o estado.
- **FR51**: O admin vê **lista de clientes** e pode **buscar / bloquear** (cliente bloqueado não faz novos pedidos).
- **FR52**: O admin faz **CRUD de hubs** (nome, endereço, lat/long, horário por dia da semana, ponto de referência, foto opcional). Lojistas dentro do raio de um hub aprovado passam a atendê-lo automaticamente.
- **FR53**: O admin acessa um **dashboard financeiro geral** com GMV, receita Keepit (12% placeholder), ranking de lojas, ranking de hubs, por período.

## Functional Requirements — Integrações

- **FR54**: O sistema cria **cobrança PIX ou cartão** via API Asaas na conta master Keepit no momento do checkout, sem split.
- **FR55**: O sistema consome **webhook `PAYMENT_RECEIVED`** do Asaas para atualizar o estado do pedido para `Aguardando aceite`.
- **FR56**: O sistema consome **webhook `CHARGEBACK`** do Asaas para (a) marcar o pedido como estornado, (b) debitar R$ 40 fixo do saldo do lojista via UPDATE no banco.
- **FR57**: O sistema calcula a **taxa Keepit (12% placeholder)** sobre o valor do produto (excluindo taxa de deslocamento) — valor definitivo antes do go-live.
- **FR58**: O sistema **registra `nf_solicitada` (boolean)** no pedido; se `true`, o app do lojista exibe alerta.
- **FR59**: O sistema calcula **distância cliente↔hub** via fórmula de Haversine em Edge Function.
- **FR60**: O sistema **valida disponibilidade da loja** considerando: aprovação do admin, horário programado, botão "Pausar" ativo, e raio de atendimento cobrindo o hub selecionado.

## Non-Functional Requirements

- **NFR1**: **Fidelidade visual 100%** ao protótipo `keepit-app/index.html` — paleta, tipografia (Hanken Grotesk), espaçamentos, cantos arredondados, sombras e ícones extraídos e replicados nos apps.
- **NFR2**: Apps mobile em **Expo (React Native)**, uma codebase por app, publicados em **iOS e Android**.
- **NFR3**: Backend em **Supabase** (PostgreSQL + Auth + Storage + Edge Functions + Row-Level Security).
- **NFR4**: **Autorização por papel via RLS** (cliente vê só seus pedidos; lojista vê só os do seu estabelecimento; admin tem acesso amplo). Nenhuma regra de autorização vive só no client-side.
- **NFR5**: Idioma **pt-BR único** no MVP. Sem internacionalização.
- **NFR6**: Apps mobile **apenas portrait**, **apenas smartphone** (sem otimização para tablet).
- **NFR7**: Admin web **responsive básico** — desktop e laptop; sem otimização para mobile.
- **NFR8**: Backend com **p95 de latência < 1s** em requests normais (excluindo chamadas ao Asaas).
- **NFR9**: **LGPD** — direito à exclusão de conta acionável dentro do app via botão que abre WhatsApp da Keepit; execução da exclusão é manual pelo admin.
- **NFR10**: **Apple Guideline 5.1.1(v)** — botão de exclusão de conta obrigatório dentro do app do cliente e do lojista.
- **NFR11**: Custos de infraestrutura no início **≤ R$ 150/mês**, apoiado nos free tiers de Supabase, Vercel e no volume moderado de SMS Zenvia.
- **NFR12**: **Testes unitários** cobrindo regras críticas: geração e validação de PIN, cálculo de saldo/carteira virtual, matriz de cancelamento, validação temporal do pedido, cálculo Haversine, cálculo da taxa Keepit e da taxa de deslocamento.
- **NFR13**: **CI** com GitHub Actions rodando `lint + typecheck + test` em cada pull request.
- **NFR14**: **Deploys**: admin em Vercel com deploy contínuo automatizado (main); backend Supabase migrations aplicadas manualmente com `supabase db push`; apps mobile publicados via EAS Build + Submit manual.
- **NFR15**: **Fidelidade ao princípio "sem escalabilidade prematura"** — proibido introduzir cache distribuído, filas assíncronas, microserviços, feature flags complexos, sharding, réplicas de leitura ou similar no MVP.
- **NFR16**: **Testabilidade manual** — cada Story deve ser verificável manualmente por um único desenvolvedor operando sozinho (Caio) sem depender de ambientes coletivos.
- **NFR17**: **Compliance nas lojas** — passar na revisão da App Store e Google Play na primeira submissão de produção (metadata, ícones, screenshots, política de privacidade linkada, exclusão de conta implementada).
- **NFR18**: **Segurança básica** — chaves de API do Asaas, Zenvia, Supabase service role apenas em Edge Functions ou variáveis de ambiente do servidor; nunca no bundle do app mobile.
