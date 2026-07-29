# Épico 6 — Pedido & PIN

## Expanded Goal

Entregar o **coração do produto**: o ciclo de vida completo de um pedido. Cliente monta carrinho → checkout com validações → paga → lojista aceita em 10 min → prepara → sai pro hub → encontra o cliente → digita PIN → confirmação. Junto vem toda a matriz de cancelamento, no-shows e o tratamento de atraso do lojista.

Este épico **exclui pagamento propriamente dito** (Épico 7). Aqui, o "pagamento" é mockado com um flag manual (`pedido.pago = true`) ou usa a integração Asaas do épico 7 se ele for feito em paralelo. O objetivo é isolar a lógica de pedido/PIN da lógica de cobrança.

## Prerequisites

- Épico 5 concluído (descoberta funcionando).
- `packages/config/business-rules.ts` com constantes (12%, R$ 20, 10 min, 5 tentativas, etc.) criado.

## Stories

### Story 6.1 — Carrinho

**As a** cliente,
**I want** um carrinho persistente da loja em que estou comprando,
**so that** eu acumule itens antes de fechar o pedido.

**Acceptance Criteria:**
1: Botão flutuante "Ver carrinho" aparece quando há itens.
2: Tela de carrinho exibe: itens (foto, nome, quantidade, subtotal), botão editar quantidade, botão remover, subtotal do carrinho, botão "Ir para checkout".
3: Migration cria tabela `carrinho (id uuid PK, cliente_id uuid FK, estabelecimento_id uuid FK, atualizado_em timestamptz)` e `carrinho_itens (carrinho_id, produto_id, quantidade, preco_snapshot)`. Um carrinho por cliente por estabelecimento (regra de multi-loja: se cliente tenta adicionar produto de outra loja, alerta que vai limpar o carrinho atual).
4: RLS: cliente só vê o próprio carrinho.

---

### Story 6.2 — Checkout: resumo + taxas + total

**As a** cliente,
**I want** ver o resumo do meu pedido com taxa de deslocamento, taxa de serviço e total,
**so that** eu saiba exatamente o que vou pagar antes de confirmar.

**Acceptance Criteria:**
1: Tela de checkout replica o protótipo: seção "Seu pedido" com itens, seção "RETIRADA & ENCONTRO" com hub selecionado + tempo médio da loja + janela de 10 min, seção "COMPRA" com Subtotal / Taxa de deslocamento / Taxa de serviço (0 no MVP — comunicar sem exibir se for 0) / Total.
2: Taxa de deslocamento vem de `estabelecimentos.taxa_deslocamento`.
3: Taxa Keepit (12% placeholder) **não é exibida ao cliente** — é embutida no preço que o lojista definiu (o cliente paga o preço do produto + taxa de deslocamento; a Keepit debita 12% do repasse ao lojista internamente).
4: Checkbox "Solicitar nota fiscal" (marca `pedido.nf_solicitada = true`).
5: Botão "Pagar R$ X" leva à Story 6.3 → depois Épico 7.

---

### Story 6.3 — Checkout: validação temporal

**As a** cliente,
**I want** que o sistema me impeça de criar um pedido impossível de retirar no horário do hub,
**so that** eu não perca dinheiro nem tempo.

**Acceptance Criteria:**
1: Ao clicar em "Pagar", Edge Function `validar-pedido` verifica: `agora + estabelecimento.tempo_medio + 10min <= hub.horario_fechamento_hoje`.
2: Se falhar, exibe modal: *"Este pedido não seria entregue dentro do horário do hub. Volte amanhã."* — bloqueia progresso.
3: Se passar, prossegue para Story 6.4.

---

### Story 6.4 — Checkout: validação ticket mínimo

**As a** cliente,
**I want** que o sistema me avise se meu pedido está abaixo do mínimo,
**so that** eu ajuste antes de tentar pagar.

**Acceptance Criteria:**
1: Ao acessar checkout, calcula subtotal.
2: `ticket_minimo = COALESCE(estabelecimento.ticket_minimo, 20.00)`.
3: Se subtotal < ticket_minimo, botão "Pagar" fica desabilitado com aviso *"Pedido mínimo R$ {X}. Adicione mais R$ {Y}."*
4: Constante 20.00 vem de `packages/config/business-rules.ts`.

---

### Story 6.5 — CPF no primeiro checkout

**As a** cliente que nunca fez pedido,
**I want** informar meu CPF uma única vez no primeiro checkout,
**so that** eu tenha NF disponível se pedir.

**Acceptance Criteria:**
1: Se `clientes.cpf IS NULL`, checkout mostra modal ou input obrigatório para CPF.
2: Validação de formato + dígitos verificadores.
3: Salvo em `clientes.cpf`. Não solicitado novamente.

---

### Story 6.6 — Geração de PIN 4 dígitos único

**As a** sistema,
**I want** gerar um PIN de 4 dígitos aleatório e único por pedido,
**so that** o encontro no hub tenha chave de confirmação.

**Acceptance Criteria:**
1: Ao criar `pedidos` (após pagamento confirmado no Épico 7), Edge Function gera PIN entre `0000` e `9999`.
2: PIN salvo como `pedidos.pin_hash` (bcrypt ou pgcrypto) — nunca em texto plano. E salvo em `pedidos.pin_texto` (não persistido em log) só para exibir na tela do cliente.
3: PIN visível para o cliente na tela pós-checkout e em "Meus pedidos" enquanto em andamento.

---

### Story 6.7 — Tela "Confirmar retirada · PIN"

**As a** cliente,
**I want** ver o PIN grande na tela para mostrar ao lojista no hub,
**so that** o lojista possa confirmar a entrega.

**Acceptance Criteria:**
1: Tela replica o protótipo: fundo claro, texto "SEU CÓDIGO DE RETIRADA", PIN em fonte gigantesca, texto explicativo "Mostre este código ao lojista no hub", nome do hub + endereço, "Peça o código de 4 dígitos" (mensagem).
2: Botão "Como chegar" abre WhatsApp com pergunta sobre localização ou apenas exibe endereço (sem mapa integrado no MVP).
3: Tela acessível também via "Meus pedidos → pedido em andamento".

---

### Story 6.8 — Lojista: tela "Novos pedidos" com push

**As a** lojista,
**I want** receber notificação push imediatamente quando um novo pedido chega,
**so that** eu possa aceitar dentro de 10 min.

**Acceptance Criteria:**
1: Ao pagamento confirmado (Épico 7), Edge Function dispara push via `expo-server-sdk` para todos os push tokens do estabelecimento.
2: Push tem título "Novo pedido #{numero}" e corpo com valor total.
3: Tela "Pedidos recebidos" no lojista mostra aba "Novos" com badge contador.
4: Cada card: número do pedido, cliente, itens (compacto), valor total, tempo restante do timeout (contagem regressiva).

---

### Story 6.9 — Lojista: aceitar pedido com tempo estimado

**As a** lojista,
**I want** aceitar o pedido informando quanto tempo levo para entregar no hub,
**so that** o cliente saiba quando ir.

**Acceptance Criteria:**
1: Botão "Aceitar pedido" abre modal com input "Tempo estimado de entrega (min)" pré-preenchido com `estabelecimentos.tempo_medio`, editável.
2: Ao confirmar: `UPDATE pedidos SET status = 'aceito', tempo_estimado_min = ..., aceito_em = NOW()`.
3: Cliente recebe push: "Seu pedido foi aceito! Fica pronto em ~{X} min."
4: Estado do pedido: `Aceito → Em preparo` (transição implícita — só mostra "Em preparo" no cliente).

---

### Story 6.10 — Backend: job de timeout do aceite (10 min)

**As a** sistema,
**I want** cancelar automaticamente pedido não aceito em 10 min,
**so that** cliente não fique esperando indefinidamente.

**Acceptance Criteria:**
1: `pg_cron` executa a cada 1 min: `SELECT` pedidos com `status = 'aguardando_aceite' AND criado_em < NOW() - INTERVAL '10 minutes'`.
2: Para cada um: `UPDATE status = 'cancelado_timeout'`, cria item em `reembolsos_pendentes` (motivo "timeout aceite", valor total, forma pagamento original).
3: Push ao cliente: "Seu pedido foi cancelado. O valor será reembolsado."
4: Reembolso em si é manual pelo admin (Épico 8).

---

### Story 6.11 — Lojista: recusar pedido com motivo

**As a** lojista,
**I want** recusar um pedido antes de aceitar,
**so that** eu não trave o cliente com uma coisa que não vou entregar.

**Acceptance Criteria:**
1: Botão "Recusar" abre modal com radio de motivo obrigatório: "Sem estoque" / "Fora do horário" / "Outro" (se "Outro", exige textarea).
2: Ao confirmar: `UPDATE status = 'recusado', motivo_recusa = ...`, cria reembolso pendente (100%).
3: Push ao cliente: "Sua loja recusou o pedido. Valor será reembolsado."
4: Cliente vê motivo em "Meus pedidos → detalhe".

---

### Story 6.12 — Lojista: marcar "Saindo pro hub"

**As a** lojista,
**I want** avisar que estou indo pro hub,
**so that** o cliente vá também.

**Acceptance Criteria:**
1: Botão "Saindo para o hub" no detalhe do pedido em preparo.
2: `UPDATE status = 'saindo_hub', saiu_hub_em = NOW()`.
3: Push ao cliente: "Seu pedido está a caminho do hub. Chegue em até {X} min."
4: Estado visível pro cliente em "Meus pedidos".

---

### Story 6.13 — Push ao cliente para ir ao hub

Coberto por Story 6.12. Sem story separada.

---

### Story 6.14 — "Cheguei ao hub" (ambos os lados)

**As a** cliente e lojista,
**I want** apertar "Cheguei ao hub" no meu app,
**so that** o outro saiba que estou lá.

**Acceptance Criteria:**
1: No app do cliente: botão "Cheguei ao hub" aparece após lojista marcar "saindo_hub". `UPDATE pedidos.cliente_chegou_em = NOW()`.
2: No app do lojista: botão análogo. `UPDATE pedidos.lojista_chegou_em = NOW()`.
3: Estado do pedido não muda ainda; a UI mostra "aguardando o outro" até ambos chegarem.
4: Quando ambos: `UPDATE status = 'no_hub'`. Cliente vê tela do PIN (Story 6.7); lojista vê tela para digitar PIN (Story 6.15).

---

### Story 6.15 — Lojista: digitar PIN com regras de tentativas

**As a** lojista,
**I want** digitar o PIN de 4 dígitos que o cliente mostra,
**so that** confirmar entrega e finalizar o pedido.

**Acceptance Criteria:**
1: Tela replica o protótipo: 4 caixinhas de dígito, texto "Peça o código de 4 dígitos ao cliente".
2: Edge Function `confirmar-pin` compara com `pin_hash`. Se acertou: `UPDATE status = 'entregue', entregue_em = NOW()`. Push ao cliente: "Pedido entregue! ✓".
3: Se errar: incrementa `tentativas_pin`. Se `tentativas_pin >= 5`: `UPDATE bloqueado_ate = NOW() + INTERVAL '5 minutes'`. UI mostra "Bloqueado por 5 min. Peça ao cliente para conferir o código."
4: Após 5 min, tentativas voltam a zero automaticamente (via timestamp; sem cron).
5: Constantes (5 tentativas, 5 min bloqueio) em `packages/config/business-rules.ts`.

---

### Story 6.16 — Confirmação de entrega + recibo cliente

**As a** cliente,
**I want** ver que o pedido foi confirmado como entregue e ter um recibo,
**so that** eu tenha prova do que comprei.

**Acceptance Criteria:**
1: Ao PIN confirmado, cliente recebe push + tela "Recibo · pedido concluído" replicando protótipo (itens, valores, hub, data).
2: Registrado em `pedidos.entregue_em`.
3: A partir deste momento, o valor entra na carteira virtual bloqueada do lojista (Épico 7 conta os 7 dias).

---

### Story 6.17 — Cliente: "Meus pedidos"

**As a** cliente,
**I want** ver todos meus pedidos com filtros por status,
**so that** eu acompanhe o que está em andamento e o que já acabou.

**Acceptance Criteria:**
1: Tela "Meus pedidos" replica protótipo com abas "Em andamento" / "Concluídos".
2: Card exibe: número, loja, valor, status, data.
3: Toque abre detalhe do pedido.
4: Estados "concluídos" incluem: entregue, cancelado, recusado, não_retirado (definido nas Stories abaixo).

---

### Story 6.18 — Cliente: cancelar pedido conforme matriz

**As a** cliente,
**I want** cancelar meu pedido dentro das regras,
**so that** eu não seja forçado a esperar.

**Acceptance Criteria:**
1: Botão "Cancelar pedido" visível em "Meus pedidos → detalhe" enquanto status ∈ `{aguardando_aceite, aceito, em_preparo}`. Nunca em `saindo_hub`, `no_hub`, `entregue`.
2: Modal confirmação: se status = `aguardando_aceite`, cancela com **100% de reembolso**. Se status = `aceito/em_preparo`, avisa "Cancelar agora resulta em reembolso de 90% (10% vai para o lojista pelo trabalho iniciado)".
3: `UPDATE status = 'cancelado', cancelado_em = NOW(), motivo_cancelamento = 'cliente'`. Cria reembolso pendente com valor apropriado.
4: Push ao lojista: "Pedido #{numero} foi cancelado pelo cliente."

---

### Story 6.19 — Lojista: "Cliente não apareceu"

**As a** lojista que esperou no hub sem cliente,
**I want** marcar que o cliente não apareceu depois de 10 min,
**so that** eu vá embora com o produto e o pedido feche corretamente.

**Acceptance Criteria:**
1: Botão "Cliente não apareceu" visível após `lojista_chegou_em + 10min`.
2: Ao confirmar: `UPDATE status = 'nao_retirado', motivo_nao_retirado = 'cliente'`. Regra financeira: **20% ao cliente / 80% ao lojista** (cria reembolso parcial pendente).
3: Push ao cliente: "Você não apareceu no hub. Reembolso parcial disponível — fale com Keepit se tiver dúvidas."

---

### Story 6.20 — Cliente: "Lojista não veio"

**As a** cliente que esperou no hub sem lojista,
**I want** marcar que o lojista não veio,
**so that** eu tenha reembolso e o lojista arque com a falha.

**Acceptance Criteria:**
1: Botão "Lojista não veio" visível após `cliente_chegou_em + max(tempo_estimado, 20min)`.
2: Ao confirmar: `UPDATE status = 'nao_entregue_lojista'`. Reembolso **100% ao cliente**.
3: Registra falha de qualidade em `estabelecimentos_falhas (estabelecimento_id, pedido_id, tipo, criado_em)`.
4: Admin vê essa falha na aba de qualidade do lojista.

---

### Story 6.21 — Regra de atraso do lojista

**As a** cliente aguardando pedido atrasado,
**I want** ser avisado quando o lojista atrasa muito e ter opção de cancelar com reembolso 100%,
**so that** eu não fique preso indefinidamente.

**Acceptance Criteria:**
1: `pg_cron` a cada 1 min verifica pedidos aceitos com `NOW() > aceito_em + 2 * tempo_estimado_min * '1 min'` que ainda não estão em `saindo_hub`.
2: Envia push ao cliente com 2 botões inline: "Aguardar mais" / "Cancelar com 100%".
3: Se "Cancelar": `UPDATE status = 'cancelado_atraso'`, reembolso 100% pendente, registra falha de qualidade ao lojista.

---

## Definition of Done

- [ ] Todas as 21 stories `Done` (algumas triviais/subsumidas).
- [ ] Ciclo end-to-end validado manualmente: cliente compra → paga (mock ou Épico 7) → lojista aceita → prepara → sai → encontro → PIN → confirmação → recibo.
- [ ] Todas as ramificações da matriz de cancelamento testadas (cliente cancela em 3 momentos; lojista recusa; timeout; cliente/lojista não veio; atraso).
- [ ] Testes unitários das regras: geração/verificação PIN, validação temporal, ticket mínimo, matriz de cancelamento.
