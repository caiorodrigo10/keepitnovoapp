# Keepit — Arquitetura do MVP

Complementa `ENTENDIMENTO_APP.md`, `docs/ESCOPO_MVP.md` e `docs/PERGUNTAS_REGRAS_NEGOCIO.md`. Consolida as decisões técnicas do MVP.

## 1. Escopo (recap)

- **App do Cliente** — Expo (iOS + Android).
- **App do Lojista** — Expo (iOS + Android).
- **Painel Admin Keepit** — Next.js hospedado na Vercel.
- **Backend** — **Supabase** (PostgreSQL + Auth + Storage + Edge Functions + RLS).
- **Gateway de pagamento** — Asaas.
- **UI fiel** ao protótipo `keepit-app/index.html`.
- **Sem escalabilidade prematura.**

## 2. Stack e organização

### 2.1 Monorepo

pnpm workspaces + Turborepo:

```
keepitnovoapp/
├── apps/
│   ├── cliente/         Expo (React Native)
│   ├── lojista/         Expo (React Native)
│   ├── admin/           Next.js
│   └── supabase/        migrations SQL + edge functions
└── packages/
    ├── shared-types/    tipos gerados a partir do schema Supabase
    ├── supabase-client/ wrapper tipado do supabase-js
    └── ui-tokens/       paleta, tipografia, tokens do design system
```

### 2.2 Escolhas técnicas fixas

- **Mobile**: **Expo (React Native)**. Uma codebase por app, rodando iOS e Android. Elimina o custo de manter Swift + Kotlin em paralelo.
- **Admin web**: **Next.js** hospedado na **Vercel**.
- **Backend**: **Supabase**. Um único projeto Supabase fornece PostgreSQL, Auth (email + senha), Storage, Edge Functions (para webhooks Asaas, integração Zenvia SMS, jobs) e Row-Level Security para autorização por papel.
- **Storage** (imagens de produto e fachada): Supabase Storage.
- **Autenticação**: Supabase Auth com email + senha. Confirmação de telefone via SMS Zenvia disparada por Edge Function (não usa Supabase Auth Phone).

### 2.3 Serviços externos

- **Asaas** — pagamento, custódia e repasse.
- **Zenvia** — SMS de confirmação de telefone (~R$ 0,08/SMS).
- **BrasilAPI** — validação de CNPJ na Receita (grátis, sem chave).
- **Expo Push Notifications** — notificações mobile (grátis).
- **Sem provider de mapa** — o protótipo não usa mapa visual. Distância cliente↔hub é calculada com fórmula de Haversine em Edge Function a partir do lat/long de cada hub e do GPS do device.

## 3. Regras de negócio consolidadas

Ver detalhamento completo em `docs/PERGUNTAS_REGRAS_NEGOCIO.md → Decisões`. Referência rápida:

### Financeiro
- **Taxa Keepit**: **12% (placeholder)** sobre o valor do produto, não sobre a taxa de deslocamento. Configurável no backend. Valor final antes do lançamento.
- **Escrow**: Keepit segura todo o valor até o PIN ser confirmado. Libera para o lojista **em D+7 após a entrega**.
- **Saque do lojista**: sob demanda, **mínimo R$ 200**, via PIX.
- **Chargeback**: **R$ 40 fixo** debitado do saldo do lojista.
- **Taxa de deslocamento**: cada lojista define seu próprio valor por pedido. Cobrada do cliente no checkout; vai integralmente ao lojista (sem % Keepit sobre ela).
- **Reembolso**: **manual pelo admin Keepit** no MVP. Cancelamentos criam item na fila do painel admin; admin dispara estorno via Asaas. Estados: `pendente_admin → em_processamento → estornado`.

### Pedido
- **1 pedido = 1 loja** (sem multi-loja no carrinho).
- **Ticket mínimo**: R$ 20 global; loja pode definir mínimo próprio (prevalece se definido).
- **Validação temporal no checkout**: bloqueia pedido se `agora + tempo_médio_lojista + 10min ≤ horário_fechamento_hub` não puder ser cumprido.
- **Aceite** manual, timeout **10 min**.
- **PIN**: 4 dígitos, único por pedido, **5 tentativas** para o lojista digitar (bloqueio de 5 min após esgotar). Sem fallback de reenvio para o cliente — perda de acesso ao app aciona suporte WhatsApp.
- **Encontro sincronizado, sem armazenagem no hub** — produto fica na loja até o momento do encontro.
- **Cliente não apareceu**: 20% ao cliente / 80% ao lojista.
- **Lojista não apareceu**: 100% de reembolso + penalidade de qualidade.
- **Sem reagendamento** — falha no encontro = cancelamento; cliente refaz o pedido.
- **Estoque**: não existe no app — administração 100% do lojista, por fora.
- **NF**: lojista emite; Keepit não automatiza no MVP. Campo `nf_solicitada` no pedido.
- **Avaliações (★)**: fora do MVP — o número no card da loja é placeholder até v2.

### Descoberta
- Cliente **escolhe o hub primeiro** e depois vê as lojas do hub.
- Busca por **produto** e por **loja** (duas entradas).

### Lojista
- **Onboarding**: aprovação manual pela Keepit.
- **Cadastro**: CNPJ, categoria, endereço, **raio de atendimento (km)**, **tempo médio de entrega (min)**, **taxa de deslocamento (R$)**, chave PIX, horário de funcionamento por dia da semana.
- **Botão "fechado agora"**: pausa recebimento de pedidos até reabrir manualmente.
- **1 conta = 1 estabelecimento** (várias unidades = várias contas).
- **Farmácia**: sem medicamentos tarjados no MVP.
- **Fotos de produto**: upload pelo lojista via app, sem moderação prévia.

### Cliente
- E-mail + senha + telefone; CPF só no checkout; SMS de confirmação via Zenvia; sem login social; sem guest checkout.

### Suporte
- Botão **"Falar com Keepit"** → abre WhatsApp da Keepit.
- Botão **"Falar com o lojista"** (dentro do pedido/loja) → abre WhatsApp do lojista cadastrado.
- Sem chat interno.

## 4. Jornada do cliente (end-to-end)

| # | Ação | Estado do pedido | O que acontece no Supabase | Asaas |
|---|---|---|---|---|
| 1 | Abre o app; escolhe hub e produto | — | Query em `lojas` com filtro pelo raio (Haversine) | — |
| 2 | Adiciona ao carrinho e vai pro checkout | — | Insert em `carrinho` (RLS: só o próprio user) | — |
| 3 | Escolhe forma de pagamento (PIX ou cartão) | `Novo` | Edge Function `criar_pedido` insere em `pedidos`, gera **PIN de 4 dígitos** | Cria cobrança na conta master Keepit (`POST /payments`). **Sem split.** |
| 4 | Paga | `Aguardando pagamento` | Edge Function `webhook_asaas` recebe `PAYMENT_RECEIVED` e atualiza estado | Webhook do Asaas → Edge Function |
| 5 | Push pro lojista aceitar (timeout 10 min) | `Aguardando aceite` | Cron do Supabase (pg_cron) verifica timeout a cada minuto | Se timeout: Edge Function estorna via `POST /payments/{id}/refund` |
| 6 | Lojista aceita e informa tempo estimado | `Aceito` | UPDATE em `pedidos.tempo_estimado_min` | — |
| 7 | Lojista prepara e marca "Saindo pro hub" | `Em preparo` → `Saindo para o hub` | Edge Function envia push via Expo | — |
| 8 | Ambos apertam "Cheguei ao hub" | `No hub` | UPDATE em `pedidos.hub_chegada_*_em` | — |
| 9 | Cliente mostra PIN → lojista digita | `Entregue` | Edge Function `confirmar_pin` valida PIN, grava `entregue_em = NOW()`. Valor da venda entra na **carteira virtual do lojista** (bloqueado por 7 dias). | — |
| 10 | Passa D+7 | `Repassado` (lógico) | Nada acontece automaticamente — saldo passa de "bloqueado" para "disponível" via query SQL. | — |
| 11 | Lojista solicita saque (≥ R$ 200) | — | Edge Function `solicitar_saque` calcula saldo disponível e dispara transferência única | `POST /transfers` da conta master direto pro banco do lojista via PIX |

## 5. Como o Asaas se encaixa na operação

### 5.1 Modelo escolhido — carteira virtual

O Asaas **não tem escrow nativo com liberação sob comando**. Em vez de agendar transferências D+7 por pedido, adotamos o modelo **carteira virtual**: o dinheiro fica na conta master do Keepit até o lojista pedir para sacar, e o "saldo do lojista" é calculado pelo backend a partir dos pedidos entregues.

**Fluxo:**

1. Toda cobrança é criada **na conta master Keepit, sem split**.
2. Após o PIN ser confirmado, o backend registra no banco: `entregue_em = NOW()`, valor da venda, id do lojista.
3. Quando o lojista abre a tela **"Carteira"**, o app mostra:
   - **Saldo disponível** = soma dos pedidos entregues **há mais de 7 dias**, menos chargebacks e taxas.
   - **Saldo bloqueado** = soma dos pedidos entregues **há 7 dias ou menos**.
4. Quando o lojista clica **"Sacar"** (mínimo R$ 200):
   - Backend recalcula saldo disponível.
   - Se ≥ R$ 200, dispara **uma única transferência** da conta master direto para o banco do lojista via **PIX externo** (chave PIX cadastrada no onboarding).
   - Marca os pedidos correspondentes como "sacados".
5. Em caso de cancelamento antes do PIN: `POST /payments/{id}/refund` no Asaas e o pedido não entra na carteira do lojista.
6. Em caso de chargeback pós-entrega: webhook `CHARGEBACK` do Asaas → backend estorna o cliente e debita **R$ 40 fixo** do saldo do lojista (só UPDATE no banco). Se o saldo do lojista for < R$ 40, fica devedor até nova venda.

**Por que esse modelo:**
- Menos chamadas à API do Asaas por pedido — só cobra + saque, sem agendamentos.
- A regra D+7 vira uma condição SQL, não um cron job.
- Reversão de chargeback e aplicação de penalidade são UPDATEs simples no banco.
- É o mesmo modelo que iFood, Uber, Rappi usam no Brasil.
- Se depois a operação escalar e o stakeholder quiser dar visibilidade financeira ao lojista dentro do Asaas, dá pra migrar pra "transferências agendadas" sem quebrar dados.

**Onde o Asaas ainda é essencial:**
- **KYC do lojista**: no aceite do cadastro, o backend cria uma subconta Asaas (`POST /v3/accounts`) com CNPJ, dados bancários, endereço. A subconta valida CNPJ, guarda dados regulatórios e cadastra a chave PIX. **A subconta fica dormente** — o dinheiro não trafega por ela, mas ela existe para conformidade e como registro do destino de saque.
- **Recebimento de PIX e cartão** na conta master.
- **Estornos** e **webhooks de chargeback**.
- **PIX externo** para pagar o lojista no saque.

### 5.2 Onboarding do lojista no Asaas

1. Lojista preenche cadastro no app (CNPJ, dados bancários, chave PIX, categoria, endereço, raio, tempo médio).
2. Admin Keepit aprova no painel.
3. Backend chama `POST /v3/accounts` no Asaas com os dados. Asaas retorna `apiKey` (armazenar imediatamente — só aparece uma vez) e `walletId`.
4. Webhooks do lojista já vêm configurados na mesma chamada.
5. Lojista consegue cadastrar catálogo e começa a receber pedidos.

### 5.3 Custos técnicos do Asaas relevantes (referência rápida)

- **PIX recebido**: R$ 0,99 (promo 3 meses) / R$ 1,99 depois. 30 transações grátis/mês para PJ.
- **Cartão à vista**: R$ 0,49 + 1,99% a 2,99%.
- **Cartão parcelado**: até R$ 0,49 + 3,99%.
- **PIX externo (saque pro lojista)**: dentro do free tier no volume MVP; custo baixo por transação após esgotar.
- **Sandbox**: aberto, gratuito, sem burocracia. Limite de 20 subcontas/dia.

Ver detalhamento completo em `docs/gateway/asaas.md`.

## 6. Jornada do lojista

1. Baixa o app do lojista → cria conta (e-mail, senha, telefone) → confirma SMS.
2. Preenche cadastro do estabelecimento: CNPJ, nome fantasia, categoria, endereço da loja (lat/long), **raio de atendimento em km**, **tempo médio de entrega em min**, chave PIX de recebimento, foto de fachada.
3. Estado do estabelecimento: **"Em análise"**. Cliente ainda não vê essa loja.
4. Admin Keepit revisa no painel → aprova → backend cria subconta no Asaas.
5. Lojista cadastra o catálogo (produtos, preço, estoque, categoria).
6. Recebe pedidos apenas de hubs dentro do seu raio.
7. Aceita em 10 min → informa tempo estimado → prepara → marca "Saindo pro hub" → digita PIN no encontro.
8. Após D+7, saldo entra em "disponível" na tela **"Carteira"**.
9. Solicita saque (≥ R$ 200) → recebe via PIX na chave cadastrada.

## 7. Painel Admin Keepit (escopo)

- Aprovar / rejeitar / suspender lojistas.
- Listar pedidos com filtro por status; forçar cancelamento com estorno via Asaas.
- Listar clientes; bloquear.
- CRUD de hubs (nome, endereço, horário).
- Dashboard: GMV, receita Keepit, ranking de lojas, ranking de hubs.
- **Sem UI para editar taxa da Keepit no MVP** — fica em arquivo de config no backend.

## 8. Ambientes

**Decisão (2026-07-03):** dois projetos Supabase, **ambos na nuvem** — sem Docker/Supabase CLI local. Justificativa: solo dev, setup mais rápido, sem porta 5432 disputada com outro processo, custo zero (free tier atende 2 projetos pequenos).

- **Desenvolvimento**: Expo Go / simulador iOS / emulador Android **conectados ao projeto Supabase `keepit-dev` (cloud)**; sandbox Asaas; SMS Zenvia em modo teste.
  - Migrations aplicadas via `supabase db push --project-ref <dev>`.
  - Edge Functions deploy via `supabase functions deploy --project-ref <dev>`.
- **Produção**: builds submetidos às lojas via EAS Submit; projeto Supabase `keepit-prod` (cloud); conta Asaas de produção; Zenvia em modo produção.
  - Promoção dev → prod: aplicar migrations testadas via `supabase db push --project-ref <prod>` (versionadas em `apps/supabase/migrations/`).

**O que NÃO teremos no MVP:**
- Ambiente de staging separado — só dev e prod. Quando "estiver bom" no dev, promove pra prod.
- Supabase local via Docker.

## 9. Custos operacionais básicos

Foco em custos recorrentes essenciais para publicar e operar o MVP.

| Item | Custo | Frequência |
|---|---|---|
| Apple Developer Program | US$ 99 (~R$ 550) | Anual — uma conta publica os dois apps |
| Google Play Developer | US$ 25 (~R$ 140) | Único (para sempre) |
| Expo EAS — Free | R$ 0 | 30 builds/mês na nuvem — atende o desenvolvimento |
| Expo EAS — Production (opcional) | ~US$ 99/mês | Só quando o free tier não bastar |
| Vercel (admin web) | R$ 0 | Free tier atende |
| Domínio próprio | ~R$ 40/ano | Anual |
| Supabase — Free | R$ 0 | 500 MB DB, 1 GB storage, 50k MAU. Atende o começo. |
| Supabase — Pro (quando necessário) | US$ 25/mês | 8 GB DB, 100 GB storage, backup diário. Migrar quando estourar o free. |
| Zenvia SMS | ~R$ 10-50/mês | Volume MVP (dezenas a centenas de cadastros/mês) |
| Asaas | Por transação | Ver seção 5.3 |

**Total no início**: aproximadamente **R$ 700 no primeiro ano** de custos fixos + ~R$ 10-50/mês de SMS. Com **R$ 0/mês recorrente** de infra enquanto os free tiers atenderem. Quando o volume subir, ordem esperada de **R$ 200-500/mês**.

### Nota sobre taxa Apple/Google (15–30%)

**Não se aplica ao Keepit.** Essa taxa incide apenas sobre conteúdo/serviço *digital* consumido dentro do app (assinaturas, moedas virtuais, cursos, etc.). Marketplace de bens físicos e serviços entregues fora do app (comida, remédios, roupas retirados no hub) é explicitamente isento pela Apple e Google — o pagamento pode ir direto pelo Asaas, sem passar por In-App Purchase. É o mesmo enquadramento que iFood, Rappi, Uber Eats e Amazon usam.

## 10. Decisões (rodadas 3 e 4)

### Rodada 3 — 2026-07-02

- Arquitetura mobile: **Expo (React Native)** para os dois apps (Cliente e Lojista).
- Arquitetura admin web: **Next.js** hospedado na **Vercel**.
- Repositório: **monorepo** pnpm workspaces + Turborepo.
- Modelo financeiro do Asaas: **carteira virtual** (dinheiro fica na conta master; saldo do lojista é calculado no banco; saque dispara PIX externo direto master → banco do lojista). Descartada a alternativa de transferências D+7 agendadas por pedido.
- Gateway confirmado: **Asaas** (pendente apenas validação comercial de tarifas e SLA de subconta).

### Rodada 4 — 2026-07-02

- Backend: **Supabase** (PostgreSQL + Auth + Storage + Edge Functions + RLS). Substitui a proposta anterior de Node.js/Fastify separado. Regras de negócio (aceite, PIN, saldo, saque) rodam em Edge Functions. Autorização por papel via RLS.
- Autenticação: **Supabase Auth** com email + senha. Confirmação de telefone via SMS **Zenvia** disparada por Edge Function (não usa Supabase Auth Phone — evita custo do provider embutido).
- Provider de SMS: **Zenvia** (~R$ 0,08/SMS, doc em português).
- **Sem provider de mapa** — o protótipo não usa mapa visual (confirmado via inspeção do `keepit-app/index.html`). Distância cliente↔hub é calculada com fórmula de Haversine em Edge Function, a partir do lat/long dos hubs e do GPS do device.
- Descartado: Node.js/Fastify + Railway + Google Maps (não são mais necessários dado o novo stack Supabase e a ausência de mapa).

## 11. Pendências restantes

Nenhuma pendência técnica bloqueando o início do desenvolvimento. A pendência remanescente é comercial:
- Validar com Asaas: tarifas negociadas, SLA de aprovação de subconta, limites de transação.
