# Keepit — Perguntas de Regras de Negócio (pré-desenvolvimento)

> **Decisão de execução do piloto (2026-07-31):** as regras e perguntas deste
> arquivo permanecem preservadas. Quando uma regra exigir automação classificada
> como `SIMPLE` ou `LATER`, a operação segue o plano em
> [`prd/07-plano-mvp-piloto.md`](./prd/07-plano-mvp-piloto.md), sem inventar uma
> decisão de negócio. Simplificação técnica não encerra pendência de stakeholder.

**Propósito.** Antes de começar o desenvolvimento do MVP, precisamos travar decisões de negócio que impactam diretamente o modelo de dados, a integração de pagamento e os fluxos de estado dos pedidos. Este documento lista essas perguntas de forma organizada.

**Como usar.**
- Caio (desenvolvedor do produto) responde o que puder decidir sozinho.
- O que for decisão de stakeholder (dono da Keepit) fica marcado como `→ STAKEHOLDER` para ser levado à reunião.
- Toda decisão fechada vira uma linha em `## Decisões` no final do documento, com a data.
- Enquanto uma pergunta estiver aberta, **Claude não deve assumir um default e seguir codando** — deve perguntar ou pausar.

Legenda de prioridade:
- 🔴 **Bloqueia início do desenvolvimento** — sem essa resposta, não dá para modelar o domínio.
- 🟡 **Bloqueia uma parte específica** — pode começar por outra parte.
- 🟢 **Pode ser decidido durante o desenvolvimento** — não trava nada agora.
- 🟠 **Decisão técnica provisória em vigor** — existe uma escolha registrada, com racional e gatilho de revisão, que **destrava o desenvolvimento**; mas a parte de **risco/regra de negócio** segue pendente de validação do stakeholder. Não confundir com decisão fechada.

---

## 1. Pagamento (fluxo do dinheiro)

### 1.1 🔴 Gateway / provedor de pagamento
Qual gateway vamos usar? A escolha afeta todo o modelo de split, taxas e prazo de repasse.

Opções mais comuns no Brasil para marketplace com PIX + cartão + split:
- **Mercado Pago (Marketplace / Split de Pagamentos)** — split nativo, PIX nativo, boa doc.
- **Pagar.me / Stone Connect** — split nativo, forte em cartão, PIX ok.
- **Asaas** — split, PIX nativo, mais barato, forte em SMB.
- **Iugu** — split, PIX, foco em recorrência mas atende marketplace.
- **Stripe Connect** — internacional, PIX ainda limitado no BR, split forte.

Perguntas:
- Já existe conta/preferência com algum gateway? → STAKEHOLDER
- Alguém no time tem experiência de integração com algum deles? → CAIO
- Prioridade: menor taxa, melhor UX PIX, ou velocidade de integração? → STAKEHOLDER

### 1.2 🔴 Métodos de pagamento aceitos no MVP
- **PIX** — assumindo sim, pelo protótipo.
- **Cartão de crédito** — assumindo sim, pelo protótipo.
- **Cartão de débito?** → STAKEHOLDER
- **Boleto?** → STAKEHOLDER (provavelmente não, o modelo é retirada rápida)
- **Carteira interna Keepit / cashback / créditos?** → STAKEHOLDER

### 1.3 🔴 Modelo de split — quem recebe o quê
Ao processar R$ 100 de venda:
- Quanto fica para o **lojista**?
- Quanto fica para a **Keepit** (taxa da plataforma)?
- Qual a taxa cobrada pelo **gateway** — quem absorve (lojista ou Keepit)?
- Existe **taxa de serviço para o comprador** (aparece no protótipo em "Taxa de serviço")? Quanto? Vai para Keepit ou para o hub?

→ STAKEHOLDER precisa definir a estrutura de taxas.

### 1.4 🔴 Modelo de custódia (escrow) e liberação
Regra observada no protótipo: cliente confirma retirada com PIN → depois lojista recebe.

Perguntas:
- **A Keepit fica com o dinheiro em custódia** até o PIN ser confirmado? (recomendado — é o modelo de marketplace com escrow)
- **SLA de liberação para o lojista** após confirmação do PIN:
  - Instantâneo (mesmo dia, poucos minutos)?
  - D+1 útil?
  - D+7?
  - D+14 / D+30 (padrão iFood / marketplaces tradicionais)?
- O saldo liberado cai automaticamente na conta bancária do lojista, ou fica numa "carteira Keepit" da qual ele **solicita saque** (é o que o protótipo sugere na tela "Carteira · solicitar saque")?

→ STAKEHOLDER. Esta é uma das decisões mais importantes — impacta caixa da Keepit, confiança do lojista e complexidade do backend.

### 1.5 🟡 Saque
- **Frequência** que o lojista pode sacar: sob demanda, diário, semanal, mensal?
- **Valor mínimo** de saque?
- **Taxa** por saque? (PIX é gratuito para o pagador em muitos gateways, mas alguns cobram)
- **Prazo** entre solicitação e crédito na conta do lojista?
- Aceita saque só para conta **PIX** (chave) do CNPJ do estabelecimento, ou também conta bancária tradicional?

→ STAKEHOLDER.

### 1.6 🟡 Chargeback e estornos
- Se o cliente pagar com cartão e depois abrir chargeback com o banco, **quem cobre o prejuízo**: Keepit ou lojista?
- Se o lojista já sacou o valor, como recuperamos?
- Reserva de risco (retenção de % em cada venda para cobrir chargebacks futuros)?

→ STAKEHOLDER. Modelo padrão de marketplace é **repassar o chargeback ao lojista** e reter parte do saldo — mas precisa ser decisão explícita e documentada em Termos.

### 1.7 ✅ Nota fiscal — Rodada 5
- Quem emite a NF do produto para o cliente: **lojista** (marketplace) ou **Keepit** (revenda)?
- Keepit emite NF da taxa de serviço para o lojista?
- Vamos automatizar via integração (Focus NFe, NFe.io, etc.) ou fora do escopo do MVP?

→ STAKEHOLDER + contador.

---

## 2. Fluxo de pedido e estados

> ✅ **Seções 2.1, 2.2 (parcial), 2.3 resolvidas na Rodada 2 (2026-07-02).** Ver `## Decisões → Rodada 2 → Fluxo do pedido` e `Cancelamento e exceções`. Perguntas abaixo mantidas por rastreabilidade.

### 2.1 🔴 Ciclo de vida do pedido
Estados observados no protótipo: Novo → Aceito → Em preparo → Pronto no hub → Retirado/Entregue → Concluído.

Perguntas:
- **Aceite automático ou manual pelo lojista?** Se o lojista não aceitar em X minutos, o pedido é cancelado?
- **Prazo máximo de preparo**: existe SLA? O que acontece se estourar?
- **Prazo para o cliente retirar** depois que fica pronto no hub: 2h? 24h? Fim do expediente? Depois disso, o que acontece com o produto? (fica com o lojista? é devolvido ao estoque? cliente perde o dinheiro?)

→ STAKEHOLDER.

### 2.2 🔴 Confirmação por PIN — regras do encontro físico
- PIN tem quantos dígitos? (protótipo mostra 4)
- **PIN expira?** Após quanto tempo sem retirada?
- Quantas tentativas o lojista tem para digitar o PIN antes de bloquear? Como desbloquear?
- Se o cliente **perder acesso ao app**, existe fallback (mostrar por SMS, e-mail)?
- Se o lojista **entregar sem confirmar o PIN** (esqueceu, cliente pressionou), como resolvemos? Confirma depois? Perde o repasse?

→ STAKEHOLDER.

### 2.3 🔴 Cancelamento e reembolso
- **Cliente pode cancelar** — até quando? (antes de o lojista aceitar? antes de começar o preparo? antes de ir para o hub?)
- **Lojista pode recusar** — até quando? Motivo obrigatório?
- **Cliente que pagou e não retirou** dentro do prazo: reembolso integral, parcial (com desconto de multa) ou nenhum?
- Reembolso volta pelo mesmo meio (PIX/cartão)?
- Alguém precisa **aprovar reembolso** (admin Keepit) ou é automático em certos casos?

→ STAKEHOLDER.

### 2.4 ✅ Multi-loja no mesmo pedido / carrinho — Rodada 5
- No protótipo, o hub agrega várias lojas. **Um único checkout pode ter itens de lojas diferentes** (um pedido = várias lojas + um hub)? Ou cada loja é um pedido separado, mesmo que o cliente compre em duas no mesmo hub?
- Se for multi-loja: o repasse é dividido por loja, o cancelamento de uma loja afeta a outra?

→ STAKEHOLDER. Do ponto de vista técnico, "um pedido por loja" é radicalmente mais simples. Recomendação Claude: começar com **1 pedido = 1 loja** no MVP.

### 2.5 ✅ Estoque — Rodada 5
- **Reserva de estoque** no momento em que o item entra no carrinho? Ou só no pagamento? Ou nunca (fica na sorte, e o lojista aceita/recusa)?
- O que acontece se o cliente pagar e o lojista não tiver o item?
- Estoque é gerenciado só pelo lojista no app, ou vamos integrar com algum ERP/PDV?

→ STAKEHOLDER + CAIO. Recomendação Claude: MVP com **estoque manual pelo lojista, sem reserva pré-pagamento**, e cancelamento com reembolso se faltar.

---

## 3. Hub (ponto de retirada)

> ✅ **Modelo operacional decidido (Rodada 1 + 2, 2026-07-02).** Hub é ponto físico de encontro presencial cliente↔lojista, sem locker e sem armazenagem no MVP. Ver decisões acima.

### 3.1 🔴 O que é o hub, operacionalmente
Este é o ponto mais **crítico e ambíguo** do modelo. Precisamos definir com o dono da Keepit:

- O hub é um **espaço físico próprio da Keepit** (loja de conveniência Keepit onde vários lojistas depositam) ou uma **parceria com um estabelecimento âncora** (ex.: uma farmácia grande hospeda o hub)?
- Tem **funcionário Keepit** no hub, ou o cliente encontra o **próprio lojista** para retirar? (No protótipo aparece "Operador de balcão" como papel do time do lojista — sugere que é o lojista quem entrega, mas fica ambíguo)
- Tem **estoque intermediário** (o lojista deixa o produto no hub e depois o cliente retira) ou é **encontro sincronizado** (lojista leva o produto quando o cliente está indo)?
- Quem paga o custo do hub? Está embutido nas taxas?

→ STAKEHOLDER. **Sem essa resposta, não dá para modelar direito o fluxo "Pronto no hub" nem quem opera a tela de "Confirmar retirada".**

### 3.2 🟡 Horário do hub
- Cada hub tem horário próprio? Como se relaciona com o horário da loja?
- Se a loja está aberta às 22h e o hub fecha às 20h, o cliente consegue pedir para retirada no mesmo dia?

→ STAKEHOLDER.

### 3.3 🟡 Cadastro de hubs
- Quem cadastra hub — só admin Keepit, ou lojista pode propor?
- Quantos hubs esperados no MVP? (define se cadastro precisa de interface polida ou pode ser SQL direto)

→ STAKEHOLDER.

---

## 4. Lojista / estabelecimento

> ✅ **Onboarding, catálogo e cadastro (raio + tempo médio) resolvidos na Rodada 2 (2026-07-02).** Ver `## Decisões → Rodada 2 → Cadastro do lojista`.

### 4.1 🔴 Onboarding e aprovação
- Cadastro do lojista é **auto-aprovado** ou passa por **revisão manual** de admin Keepit?
- **KYC / documentação exigida**: CNPJ ativo, comprovante de endereço, foto de fachada, contrato social?
- Validação de CNPJ automática via API (Receita Federal / BrasilAPI)?
- **Múltiplos estabelecimentos por mesmo CNPJ** (rede)? Múltiplos CNPJs por mesmo dono (mesma conta)?
- Um estabelecimento pode operar em **múltiplos hubs**?

→ STAKEHOLDER.

### 4.2 🟡 Equipe e permissões
Protótipo mostra papéis "Admin" e "Operador de balcão".
- Quais permissões cada papel tem?
- Convite por e-mail? Precisa de senha própria, ou usa código?
- Limite de membros por estabelecimento?

→ STAKEHOLDER (ou padrão comum + revisão).

### 4.3 ✅ Catálogo, categorias, fotos — Rodada 5
- Cada lojista cadastra livremente seus produtos, ou existe um **catálogo central Keepit** (SKU compartilhado, como iFood tem para itens comuns)?
- **Categorias fixas** definidas por admin Keepit (Farmácia, Roupas, Conveniência), ou lojista escolhe livremente?
- Produto passa por moderação antes de ficar visível?
- **Restrições legais** por categoria (ex.: medicamentos precisam de receita? venda de álcool tem limite de horário?) → farmácia tem regulamentação forte.
- Como o lojista cadastra em massa — só pelo app, ou pode importar planilha?

→ STAKEHOLDER.

### 4.4 🟢 Promoções / cupons
Protótipo mostra "Promoções" no dashboard do lojista.
- No MVP tem promoção/cupom? Ou fica para v2?

→ STAKEHOLDER. Recomendação Claude: **fora do MVP**.

---

## 5. Cliente

> ✅ **Cadastro resolvido na Rodada 2 (2026-07-02).** Ver `## Decisões → Rodada 2 → Cadastro do cliente`.

### 5.1 🟡 Cadastro
- Login social (Apple, Google) que aparece no protótipo já é escopo do MVP, ou só e-mail/senha?
- CPF obrigatório? (necessário para NF)
- Confirmação de e-mail e/ou telefone?
- Guest checkout (comprar sem criar conta)?

→ STAKEHOLDER.

### 5.2 🟢 Endereço e geolocalização
- Precisamos de endereço do cliente ou só localização para achar hubs próximos?
- Como calculamos "distância até o hub" — GPS do device ou endereço cadastrado?

→ CAIO (técnica). Recomendação: **só GPS do device**, sem cadastro de endereço, MVP mais simples.

### 5.3 🟡 Avaliações
Não achei tela de avaliação pós-compra no protótipo, mas há ★ em lojas.
- Vamos ter avaliação no MVP? Se sim, quem avalia (só cliente avalia loja, ou também loja avalia cliente)?

→ STAKEHOLDER.

### 5.4 🟢 Notificações
- Push (iOS + Android) — assumo que sim, para status do pedido.
- SMS ou WhatsApp para PIN de retirada como fallback? → STAKEHOLDER

---

## 6. Admin Keepit (painel de controle)

> ✅ **Escopo resolvido na Rodada 2 (2026-07-02).** Ver `## Decisões → Rodada 2 → Painel admin Keepit`.

### 6.1 🟡 Escopo do painel
O usuário disse "painel básico para cruzar dados". Precisamos definir o que exatamente:
- **Read-only** (só relatórios) ou **transacional** (pode aprovar lojista, cancelar pedido, estornar)?
- Métricas esperadas: GMV, número de pedidos, ticket médio, ranking de lojas, ranking de hubs, receita Keepit por período?
- Gestão de hubs (CRUD)?
- Gestão de lojistas (aprovar, suspender)?
- Gestão de clientes (busca, bloquear)?
- Configuração de taxas globais?

→ STAKEHOLDER + CAIO.

### 6.2 🟡 Acesso
- Quantas pessoas usam? Login por e-mail/senha ou SSO?
- Papéis internos (financeiro, operações, admin geral)?

→ STAKEHOLDER.

---

## 7. Legal / regulatório

### 7.1 🟡 LGPD
- Já existe política de privacidade / termos de uso redigidos? Se não, quem redige (advogado)?
- Aceite explícito nos onboardings — sim, aparece no protótipo ("Aceito os Termos e Política de Privacidade").
- Exportação e exclusão de dados por pedido do titular — obrigatório por lei, mas no MVP fazemos via ticket manual, sem UI dedicada?

→ STAKEHOLDER.

### 7.2 🟡 Termos entre Keepit e lojista
- Contrato de adesão do lojista precisa existir antes do lançamento — quem redige?

→ STAKEHOLDER.

---

## 8. Como os apps atuais (referências) fazem

Perguntas que Caio pode responder após pesquisa técnica ou que podem fundamentar recomendação ao stakeholder:

- **iFood** (marketplace de restaurante): custódia + repasse D+30 padrão, D+14 pago; PIX/cartão; lojista assume chargeback. Categoria diferente (delivery), mas o modelo financeiro é referência.
- **Rappi / Uber Eats**: mesmo padrão. Modelo com carteira de saldo do lojista.
- **Mercado Livre**: Mercado Pago com liberação D+14 padrão, adiantável mediante taxa.
- **Shopee**: retém até confirmação de entrega + prazo de reclamação (7-14 dias).
- **Modelo "click and collect" com PIN** (mais próximo do Keepit): raro no Brasil como marketplace puro. Similar: OiPago/PicPay Store, algumas dark stores.

**Recomendação Claude para começar a discussão com stakeholder** (não é decisão fechada — é ponto de partida):
- Escrow: **sim**, valor fica retido na Keepit até PIN confirmado.
- Liberação: **carteira do lojista imediatamente após PIN**, saque sob demanda com prazo D+1 útil.
- Taxa Keepit: percentual sobre venda (a definir com stakeholder — mercado varia 8-20%).
- Chargeback: repassado ao lojista + retenção de saldo (5-10% da venda em reserva por 30 dias).
- Sem taxa de serviço adicional para comprador no MVP (simplifica UX e negociação com lojista).

---

## 9. Fora do escopo do MVP (para confirmar com stakeholder)

Sugestões do Claude para deixar de fora e evitar inchaço. Precisa validação:

- Chat cliente ↔ loja.
- Sistema de fidelidade / cashback / crédito Keepit.
- Cupons e promoções configuráveis.
- Programa de indicação (referral).
- Integração com ERPs de lojista.
- Múltiplos idiomas (só pt-BR).
- Múltiplos hubs no mesmo pedido.
- Entrega em domicílio como fallback.
- API pública para lojistas.

→ STAKEHOLDER confirmar cada item.

---

## 10. Pendências reveladas na construção da casca visual (Épico 0) — 2026-07-28

Ao construir as telas com fidelidade ao protótipo (`keepit-app/index.html`, inspecionado tela a tela — ver `docs/design-refs/`), surgiram **conflitos entre o que o protótipo mostra e decisões já fechadas**. Enquanto não decididos, as telas seguem a **decisão fechada** (não o protótipo), com o desvio documentado.

### 10.1 🟡 Mapa na tela "Escolha o ponto de retirada"
O protótipo mostra um **mapa com pins** (`docs/design-refs/cliente-05-escolha-ponto-retirada.png`). Mas a Rodada 4 decidiu **"sem provider de mapa"** — decisão baseada em inspeção anterior que afirmava (incorretamente) não haver mapa no protótipo. A tela foi implementada **sem mapa** (lista de hubs). Decidir: (a) honrar o protótipo → adicionar mapa (custo + provider tipo Google/Mapbox), ou (b) manter "sem mapa" e aceitar o desvio visual. → STAKEHOLDER.

### 10.2 🟡 Login social (Google / Apple)
As telas de Criar conta e Login do protótipo (`cliente-09-criar-conta.png`, `cliente-10-login.png`) mostram **botões Google e Apple**. A Rodada 2 decidiu **login social fora do MVP**. Implementado **sem** os botões. Decidir: esconder de vez, mostrar desabilitado, ou reverter a decisão (trazer para o MVP). → STAKEHOLDER.

### 10.3 🟡 Tema do onboarding do Cliente
O onboarding do protótipo (`cliente-01-onboarding.png`) é **dark** (fundo escuro, círculo verde com casa), enquanto o restante do app Cliente é claro. Ponto de fidelidade puro (não é regra de negócio) — será corrigido para dark. Registrado aqui só para ciência; não bloqueia. → CAIO (fidelidade).

### 10.4 ✅ Modelo de autenticação do Cliente — RESOLVIDO (Rodada 6, 2026-07-29)
Login do Cliente é **e-mail + senha** (Supabase Auth nativo). **Sem confirmação de SMS no MVP** (economia de Zenvia + simplicidade). Telefone é campo **opcional, não verificado**. Ver `## Decisões → Rodada 6`.

### 10.5 🟠 Confirmação de e-mail é obrigatória para usar o app? — **decisão técnica provisória (2026-07-30) — pendente validação do stakeholder**

> **Status:** não é decisão fechada. É a formalização de um default que o Épico 2 **já operava implicitamente**, agora com racional escrito, gatilho de revisão e a parte de negócio explicitamente destacada como pendente. **Não foi decidida pelo stakeholder.**

**Decisão técnica provisória:** `Confirm email` **OFF** no Supabase Auth durante o MVP — opção **(a)**: cadastro navega direto para a home.

**Racional:**
- **Atrito zero no funil de entrada** e coerência com o protótipo, que não mostra nenhuma tela "confirme seu e-mail".
- É o comportamento que o Épico 2 já assume nas ACs escritas (Story 2.3 AC5, 2.6 AC4, 2.11 AC1) — formalizar apenas torna explícito o que já vale, em vez de deixar um default silencioso.
- O risco principal (**e-mail digitado errado → cliente perde o "Esqueci a senha" da Story 2.7 → perde o fallback de acesso ao PIN por re-login, definido na 10.4**) tem **duas mitigações que já estão no escopo do MVP**, não são trabalho novo:
  - **Story 2.8, AC3** — o cliente pode corrigir o e-mail na tela de perfil (com confirmação via Supabase Auth).
  - **Story 2.10** — suporte humano por WhatsApp da Keepit, canal já previsto.
- **Custo de reversão ≈ zero:** `Confirm email` é **configuração por projeto** no Supabase, não schema. Ligar depois não exige migration, refactor nem retrabalho de tela — no máximo uma tela intermediária, se a decisão mudar.

**Gatilho de revisão (explícito):** se aparecer **volume relevante de clientes pedindo recuperação de acesso por e-mail errado** (medido pelos chamados de WhatsApp da Story 2.10), **reverter para `Confirm email` ON**. Reavaliar também antes do go-live público, se o volume esperado subir.

**⚠️ O QUE CONTINUA PENDENTE DE VALIDAÇÃO DO STAKEHOLDER — risco operacional de negócio, não escolha técnica:**
> A Keepit aceita que um cliente que digitou o e-mail errado dependa de **suporte humano (WhatsApp)** para recuperar o acesso ao **PIN de uma compra já paga**? Isso implica: cliente com dinheiro retido, produto separado, encontro no hub marcado — e o desbloqueio dependendo de alguém responder no WhatsApp. Quem decide o apetite a esse risco é o dono da Keepit, não o desenvolvedor.
>
> Se a resposta for "não aceitamos", a decisão provisória cai e vale a opção (b) — `Confirm email` ON.

**Ampliação (2026-07-30, reconciliação do Épico 3):** a configuração `Confirm email` do Supabase Auth é **por projeto**, então esta decisão provisória vale **igualmente para cliente, lojista e admin** — não dá para ligar só para um perfil sem trabalho extra. Se a confirmação virar obrigatória, o lojista ganha uma tela "confirme seu e-mail" entre o cadastro (Story 3.2) e a tela "Em análise" (Story 3.6), e o admin idem antes do painel (Story 3.7).

---

#### 10.5-histórico (formulação original da pergunta, mantida por rastreabilidade)
Com a saída do SMS (10.4), o **e-mail vira o único canal verificável** da conta do cliente — e a decisão 10.4 não diz se ele precisa ser confirmado. O Supabase Auth tem a opção "Confirm email" ligada por padrão. Duas alternativas, com trade-off real:

- **(a) Sem confirmação obrigatória** (`Confirm email` off): cadastro → home imediatamente, atrito zero. Risco: e-mail digitado errado = cliente **perde o "Esqueci a senha"** (Story 2.7) e, por consequência, o acesso ao PIN via re-login (fallback da 10.4). Também abre espaço para contas com e-mail de terceiros.
- **(b) Confirmação obrigatória** (`Confirm email` on): cadastro → tela "confirme seu e-mail" → só então home. Garante recuperação de conta e o fallback do PIN. Custo: um passo a mais no funil e risco de e-mail cair em spam.

Impacto direto: Story 2.3 (AC5, para onde navega o signup), Story 2.6 (login de conta não confirmada), Story 2.11 (momento do prompt de push). ~~**Enquanto não decidido, o Épico 2 assume (a)**~~ → **SUPERSEDED (2026-07-30):** o assumido implícito virou **decisão técnica provisória (a)** com racional e gatilho de revisão — ver bloco 10.5 acima. Continua pendente do stakeholder **apenas a parte de risco operacional** (dependência de suporte humano para recuperar PIN de compra paga), não a escolha de configuração.

**Ampliação (2026-07-30, reconciliação do Épico 3):** a mesma pergunta vale para **lojista e admin**, que também autenticam por e-mail + senha. Se a confirmação for obrigatória, o lojista ganha uma tela "confirme seu e-mail" entre o cadastro (Story 3.2) e a tela "Em análise" (Story 3.6), e o admin idem antes do painel (Story 3.7). O Épico 3 assume o mesmo default (a) até a decisão sair. Como a configuração `Confirm email` do Supabase Auth é **por projeto**, a decisão é necessariamente **única para os três perfis** — não dá para ligar só para o lojista sem trabalho extra.

### 10.6 🟠 Criação de contas de admin Keepit e papéis internos — **decisão técnica provisória (2026-07-30) — pendente validação do stakeholder**

> **Status:** não é decisão fechada. Formaliza o default que a Story 3.7 **já assume**, com racional e condição de reversão. **Não foi decidida pelo stakeholder.**

**Decisão técnica provisória:**
- **`admin_users` como lista plana** — **sem coluna de papel**. Todo admin pode tudo (aprovar lojista, forçar cancelamento, executar reembolso, bloquear cliente).
- **Provisionamento manual via SQL** no Supabase. Sem tela de auto-cadastro e sem fluxo de convite entre admins.

**Racional:**
- O MVP prevê **1-2 pessoas operando o painel**, com volume baixo (4-5 hubs, poucos lojistas — Rodada 1). Separar *financeiro* / *operações* / *admin geral* é **complexidade sem demanda comprovada**, o que contraria o princípio nº 4 do `CLAUDE.md` ("nada além do necessário").
- Uma tela de convite entre admins **não existe em nenhuma story** — criá-la agora seria escopo novo, não reconciliação.
- **Custo de adiar é baixo, custo de antecipar é real:** adicionar papel depois é `ALTER TABLE admin_users ADD COLUMN papel ...` + checagens de RLS por papel — migration trivial sobre uma tabela pequena e nova. Antecipar custa modelagem, RLS por papel e UI de gestão de papéis, tudo antes de saber se é necessário.

**Gatilho de revisão (explícito):** se o time de operação passar de **2-3 pessoas** ou se surgir exigência de **segregação de função** (ex.: quem executa reembolso ≠ quem aprova lojista), a decisão cai e entra a coluna de papel.

**⚠️ O QUE CONTINUA PENDENTE DE VALIDAÇÃO DO STAKEHOLDER:**
> 1. **Quantas pessoas** de fato vão operar o painel admin no MVP?
> 2. Existe **separação de responsabilidade exigida** entre elas — por controle interno, exigência contábil ou simples desconforto em dar poder de estorno a todo mundo? (ex.: quem executa reembolso ≠ quem aprova lojista)
>
> Se forem **mais de 2-3 pessoas com funções distintas**, a decisão provisória muda antes da Story 3.7 ser implementada.

Nota: esta pergunta é a versão concreta do item **6.2** (Acesso — papéis internos), que segue sem resposta.

---

#### 10.6-histórico (formulação original da pergunta, mantida por rastreabilidade)
A decisão 10.4 fecha o **como** o admin entra (e-mail + senha, sem SSO), mas não fecha o **quem cria** a conta nem **se existem papéis distintos**. A pergunta 6.2 já tocava o tema e segue sem resposta; a reconciliação do Épico 3 a tornou concreta porque a Story 3.7 cria a tabela `admin_users` e precisa saber se ela tem coluna de papel.

Em aberto:
- **Provisionamento**: não existe tela de auto-cadastro de admin. Quem insere a linha em `admin_users` — Caio via SQL no Supabase, ou um admin existente convida outro pelo painel (exige tela nova, não prevista em nenhuma story)?
- **Papéis**: `admin_users` é uma lista plana (todo admin pode tudo: aprovar lojista, forçar cancelamento, executar reembolso, bloquear cliente) ou precisa separar *financeiro* / *operações* / *admin geral* (item 6.2)?
- **Quantas pessoas** usam o painel no MVP? Com 1-2 pessoas, lista plana basta e a pergunta vira 🟢.

~~**Enquanto não decidido, o Épico 3 assume:** `admin_users` sem coluna de papel + provisionamento manual via SQL.~~ → **SUPERSEDED (2026-07-30):** o assumido implícito virou **decisão técnica provisória** com racional e gatilho de revisão — ver bloco 10.6 acima. Continua pendente do stakeholder **quantas pessoas operam o painel e se há segregação de função exigida**.

### 10.7 ✅ Copy das telas de onboarding do Cliente — RESOLVIDA por fidelidade ao protótipo (2026-07-30)

**Por que deixou de ser pergunta.** A dúvida nasceu de uma premissa que a verificação direta derrubou: a de que as frases dos cards seriam material só do design system, sem status de copy de produto. Conferindo o **arquivo-fonte** (`keepit-app/index.html`, bloco `COMO FUNCIONA`, offset ~270394), as três frases estão **literalmente escritas no protótipo**:

| Card | Frase (literal, `keepit-app/index.html`) |
|---|---|
| `1 · Compra` | *"Escolhe lojas locais na plataforma"* |
| `2 · Pronto` | *"Pedido fica pronto no hub Keepit"* |
| `3 · Encontro` | *"Retira com código PIN no ponto"* |

O **princípio nº 1 do `CLAUDE.md`** ("fidelidade ao protótipo: a interface visual deve ser exatamente como em `keepit-app/index.html`") torna o protótipo a **fonte autoritativa de conteúdo**. Usar essas frases não é inventar copy — é o oposto: é substituir a copy reconstruída (que **foi** inventada no Épico 0, com a limitação anotada nos próprios arquivos) pelo texto real da fonte. Logo, **não há decisão de produto a tomar aqui**: a pergunta se dissolve na aplicação do princípio.

**Ressalva registrada (não bloqueia):** o protótipo tem **uma única** tela de onboarding do Cliente (frame "01 · Onboarding"). A existência de **três** telas é decisão de estrutura do Épico 0, não do protótipo — o que a 10.7 resolve é a **copy**, não o número de telas. Consequência: como a tela 3/3 reproduz a captura real (*"Tudo perto de você, retirado no hub."*, que **não** menciona PIN), a frase do card 3 (*"Retira com código PIN no ponto"*) **não vai para nenhuma tela**, e o cliente segue **sem ver a palavra PIN antes do cadastro**. Isso é o que o protótipo determina. Se o stakeholder quiser explicitar o PIN no funil de entrada, é **pedido novo de produto** (abrir pergunta nova), não pendência desta.

**Ajuste pendente no código (não implementado nesta rodada):** `apps/cliente/src/screens/auth/Onboarding1.tsx` e `Onboarding2.tsx` ainda carregam a copy reconstruída (*"Compre em lojas perto de você"* / *"Seu pedido fica pronto no Keepit"* + subtextos inventados). Devem passar a usar as frases verificadas acima. **Story pequena de copy a ser criada** — não fazer junto de outra alteração para manter o diff auditável.

---

### 10.7-histórico (texto original da pergunta, mantido por rastreabilidade)

**O fato.** A palavra **"PIN" não aparece em nenhuma das telas de onboarding do Cliente** (confirmado por grep em `apps/cliente/src/screens/auth/`). E não aparece porque **o protótipo não dá base para ela**: `keepit-app/index.html` tem **uma única** tela de onboarding do Cliente (frame "01 · Onboarding"), cuja copy fala de proximidade e ponto de retirada — *"Tudo perto de você, retirado no hub."* — e **não menciona PIN**. A frase *"Retira com código PIN no ponto"* existe no arquivo, mas no bloco **"COMO FUNCIONA"** da legenda do design system (card "3 · Encontro"), que é material explicativo do sistema de design, não texto de tela.

**Por que isso é decisão de produto, não de fidelidade.** O Épico 2 define o onboarding como *"comprar → esperar → retirar no hub com PIN"*, e o PIN é justamente o **mecanismo que diferencia o Keepit de um marketplace comum**: é ele que materializa o encontro físico no hub. Se o cliente não entende que vai precisar de um código de 4 dígitos para retirar, ele conhece só metade do modelo antes de decidir criar conta.

**Trade-off:**
- **(a) Não explicar o PIN antes do cadastro** — onboarding mais curto, menos atrito, maior conversão para "Criar conta". O cliente descobre o PIN no primeiro pedido (tela "Seu pedido", Épico 7). Risco: expectativa quebrada no momento da retirada e suporte evitável ("como eu pego meu pedido?").
- **(b) Explicar o PIN no onboarding** — o cliente entende o modelo completo (comprar → pronto no hub → retirar com código) antes de se cadastrar, o que qualifica quem entra e reduz fricção no primeiro encontro físico. Custo: mais um passo/mais texto no funil de entrada, com perda de conversão no topo.

**Impacto direto:** conteúdo das telas de onboarding e **ACs 1-3 da Story 2.1**. Enquanto não decidido, as telas 1/3 e 2/3 ficam com a copy reconstruída já entregue no Épico 0 e **nenhum texto novo é escrito** — a AC2 da Story 2.1 registra explicitamente essa proibição. Observação de escopo: a resposta também define se as telas 1/3 e 2/3 continuam existindo — hoje elas são reconstrução sem captura, já que o protótipo tem só uma tela de onboarding.

→ ~~**Decisão de produto: CAIO ou STAKEHOLDER.** Não há default assumido.~~ **SUPERSEDED (2026-07-30):** ver o bloco 10.7 acima. A premissa de que as frases seriam "material do design system, não texto de tela" não se sustenta: elas estão literalmente em `keepit-app/index.html`, que o `CLAUDE.md` define como fonte autoritativa de conteúdo. Vale a fidelidade ao protótipo.

### 10.8 🟡 Arquitetura de navegação da conta do Cliente — Perfil e Configurações são telas separadas? — **NOVA (2026-07-30), sem default assumido**

**O fato, verificado no arquivo-fonte.** A tela **"Configurações do Cliente"** que a Story 2.9 descreve **não existe no protótipo**:

| Verificação em `keepit-app/index.html` | Resultado |
|---|---|
| String `Configurações` | **2 ocorrências**, ambas em **453585** e **455290** — dentro do frame **P11 · "Configurações & equipe"** do **Lojista** (rótulo P11 em 453486). **Nenhuma no app do Cliente** (faixa 272043–374606). |
| String `Excluir` / `excluir` | **0 ocorrências** em todo o arquivo. |
| *Notificações* (331393) e *Ajuda & suporte* (332280) no Cliente | Existem — como **itens de menu dentro do Perfil**, frame **08 · Perfil** (faixa 325034–335223), não como tela própria. |

O protótipo do Cliente, portanto, mostra **uma única superfície de conta**: o Perfil, com menu interno (*Meus pedidos*, *Hubs favoritos*, *Formas de pagamento*, *Notificações*, *Ajuda & suporte*). Não há tela de Configurações e não há item de exclusão de conta.

**Por que isso é pergunta de produto e não de fidelidade.** As Stories **2.8 (Perfil)**, **2.9 (Configurações + Excluir conta)** e **2.10 (Ajuda & suporte)** foram escritas assumindo **duas telas** (Perfil e Configurações) e hoje **disputam a mesma superfície de UI** sem que ninguém tenha decidido a arquitetura de navegação. *Notificações* e *Ajuda & suporte* aparecem **nas duas** (menu do Perfil no protótipo; seções da Configurações na 2.9). Além disso, "Excluir minha conta" é **obrigatório por compliance Apple 5.1.1(v)** — precisa existir em algum lugar, e o protótipo não diz onde.

**A pergunta:**
> No app do Cliente, **Perfil e Configurações são telas separadas** (como as Stories 2.9/2.10 assumem hoje), ou **tudo vive dentro do Perfil** como o protótipo mostra — com *Notificações*, *Ajuda & suporte*, *Termos*, *Política* e *Excluir minha conta* virando itens do menu do frame 08?

Sub-itens que a resposta precisa fechar:
- Onde fica **"Excluir minha conta"** (item obrigatório Apple, sem fonte no protótipo)?
- *Notificações* no Perfil é **item de menu com chevron** (leva a outra tela) ou **toggle inline**? No frame 08 tem chevron, mas a Story 2.9 AC3 pede toggle persistido em `clientes.notificacoes_ativas`.
- Itens do menu do protótipo **sem story** (*Meus pedidos*, *Hubs favoritos*, *Formas de pagamento*) entram nesta superfície ou são de outros épicos?

**Impacto direto:** Stories **2.8**, **2.9** e **2.10** do Épico 2 (ACs marcadas como dependentes desta pergunta).

**⚠️ NENHUM DEFAULT ASSUMIDO.** Diferente da 10.5 e da 10.6, aqui **não** existe decisão técnica provisória: escolher entre "duas telas" e "tudo no Perfil" é decisão de **arquitetura de produto** com efeito direto no que o cliente vê, e o protótipo — fonte autoritativa pelo princípio nº 1 do `CLAUDE.md` — aponta para "tudo no Perfil", enquanto as stories já escritas apontam para "duas telas". Um agente não resolve esse conflito. → **CAIO / STAKEHOLDER.**

---

### 10.9 🟡 Por quanto tempo o cliente permanece logado sem reautenticar? — **NOVA (2026-07-31), sem default assumido**

**Origem.** Decisão de arquitetura de persistência de sessão (`docs/architecture/06-session-persistence.md`, §7). Ao decidir **como** a sessão sobrevive ao reinício do app, ficou explícito que ninguém decidiu **por quanto tempo** ela deve sobreviver.

**O fato técnico.** Com o refresh token persistido em disco (decisão da §3 daquele documento), o cliente permanece logado **indefinidamente** enquanto abrir o app com alguma regularidade — esse é o comportamento de fábrica do Supabase Auth, e o MVP não tem nenhuma linha de código forçando expiração. O tempo de vida do refresh token é **configuração de projeto** no painel do Supabase, não código.

**A pergunta:**
> O cliente da Keepit deve permanecer logado indefinidamente, ou precisa reautenticar após um período (30 dias? 90 dias?)?

**Por que é de negócio e não técnica.** É um trade-off entre conveniência e risco, e o risco é operacional, não técnico: a AC6 da Story 2.6 faz do **re-login com e-mail + senha** o caminho de recuperação do **PIN** de um pedido em andamento (fallback fixado na decisão 10.4, em substituição ao SMS). Sessão curta = mais gente reautenticando na porta do Hub, possivelmente sem lembrar a senha. Sessão longa = um aparelho perdido continua com acesso à conta até alguém pedir suporte.

Sub-item que a resposta precisa fechar:
- Existe algum caminho de **"sair de todos os dispositivos"** esperado no MVP, ou o suporte resolve caso a caso?

**Impacto direto:** Story **2.6** (AC5, AC6) — apenas em configuração do projeto `keepit-dev`, sem impacto em código.

**⚠️ NENHUM DEFAULT ASSUMIDO.** Enquanto a 10.9 não fechar, vale a configuração de fábrica do projeto, e nenhuma story deve escrever código que force ou assuma um prazo de expiração. → **CAIO / STAKEHOLDER.**

---

## Decisões técnicas provisórias (🟠 — **NÃO fechadas**, pendentes de validação do stakeholder)

> Registro separado de propósito. Nada nesta seção foi decidido pelo dono da Keepit. São escolhas **técnicas** que o desenvolvimento **já operava como default implícito**; formalizá-las apenas troca um default silencioso por um default auditável — com racional, custo de reversão e gatilho de revisão. A parte de **regra/risco de negócio** de cada uma continua explicitamente aberta e está destacada no bloco correspondente.

| Data | Tema | Decisão provisória | Reversibilidade | O que segue pendente do stakeholder |
|---|---|---|---|---|
| 2026-07-30 | **Confirmação de e-mail** (10.5) | `Confirm email` **OFF** no Supabase Auth — cadastro navega direto para a home (opção (a)). Vale para cliente, lojista e admin (config é por projeto). | **Alta** — config por projeto, sem migration nem refactor. Gatilho: volume relevante de pedidos de recuperação por e-mail errado → ligar ON. | Se a Keepit aceita que um cliente com e-mail errado dependa de **suporte humano (WhatsApp)** para recuperar o PIN de uma **compra já paga**. |
| 2026-07-30 | **Contas de admin** (10.6) | `admin_users` como **lista plana** (sem coluna de papel) + **provisionamento manual via SQL**. | **Alta** — `ALTER TABLE ADD COLUMN` + RLS por papel, sobre tabela nova e pequena. Gatilho: time > 2-3 pessoas ou exigência de segregação de função. | **Quantas pessoas** operam o painel e se há **segregação de responsabilidade exigida** (ex.: quem estorna ≠ quem aprova lojista). |

Fonte de ambas: **@pm (Morgan), formalizando default já assumido pelos Épicos 2 e 3** — a pedido do Caio, e **sem** substituir a decisão do stakeholder.

---

## Decisões (fechadas)

### Rodada 7 — 2026-07-30 (fidelidade ao protótipo)

#### Copy do onboarding do Cliente (resolve 10.7)

- **[Copy das telas 1/3 e 2/3]** Passam a usar as frases **literais do protótipo**: tela 1/3 → *"Escolhe lojas locais na plataforma"*; tela 2/3 → *"Pedido fica pronto no hub Keepit"*. A copy reconstruída no Épico 0 é descartada.
- **[Tela 3/3]** **Inalterada** — já reproduz literalmente a captura `cliente-01-onboarding.png` (*"Tudo perto de você, retirado no hub."*).
- **[Card 3 · Encontro]** A frase *"Retira com código PIN no ponto"* **não vai para nenhuma tela**, porque a tela 3/3 tem copy própria capturada. Consequência aceita: o cliente **não vê a palavra "PIN" antes do cadastro** — é o que o protótipo determina.
- **[Fonte]** `keepit-app/index.html`, bloco `COMO FUNCIONA` (offset ~270394), cards `1 · Compra`, `2 · Pronto`, `3 · Encontro` — verificado por leitura direta do arquivo, não por PNG de design-ref.
- **[Natureza da decisão]** **Não é decisão de produto.** É aplicação do **princípio nº 1 do `CLAUDE.md`** (fidelidade ao protótipo em visual **e conteúdo**), que define `keepit-app/index.html` como fonte autoritativa. Por isso não requer stakeholder.
- **[Ajuste pendente no código]** `apps/cliente/src/screens/auth/Onboarding1.tsx` e `Onboarding2.tsx` — **story pequena de copy**, ainda não implementada.
- **[Fonte da decisão]** Fidelidade ao protótipo (princípio 1 do `CLAUDE.md`).

### Rodada 6 — 2026-07-29 (Caio)

#### Autenticação do Cliente (resolve 10.4 — destrava o Épico 2)

- **[Login do Cliente]** **E-mail + senha** (padrão, Supabase Auth nativo). É o que as telas de Criar conta/Login (Story 0.4) já mostram.
- **[SMS]** **Sem confirmação por SMS no MVP.** Corta custo/integração Zenvia agora; entra em v2 se necessário.
- **[Telefone]** Campo **opcional e não verificado** no cadastro (informativo). CPF continua obrigatório no 1º checkout (Rodada 2).
- **[Fallback do PIN]** Sem SMS, o PIN vive só no app; se o cliente perde acesso, ele **re-loga (e-mail+senha)** e vê o PIN de novo. Substitui o fallback por SMS previsto na Rodada 2.
- **[Impacto técnico]** Ajustar `Cliente`/`auth.port` para e-mail+senha (+ telefone opcional). Lojista/Admin (Épico 3) também e-mail+senha.

### Rodada 1 — 2026-07-02 (Caio, sujeito a validação do stakeholder)

- **[Gateway]** Candidatos preferidos: **Asaas** ou **Pagar.me**. Aberto a alternativa mais simples/eficaz se surgir. Decisão final pendente após avaliação técnica comparativa.
- **[Métodos de pagamento]** MVP: **cartão de crédito + PIX**. Outros métodos podem ser adicionados depois (custo baixo).
- **[Modelo de taxas]** **Percentual sobre a transação**, cobrado do lojista. Percentual exato: pendente definição.
- **[Escrow]** **Sim** — Keepit segura o dinheiro até a retirada.
- **[Prazo de repasse]** **D+7 após a entrega** (tentativo, sem certeza — revisar após primeiros meses de operação).
- **[Saque]** Sob demanda, **valor mínimo R$ 200**.
- **[Chargeback]** **Taxa fixa de R$ 40** debitada do saldo do lojista por chargeback.
- **[Modelo do hub]** **Encontro presencial** entre cliente e lojista no hub físico. **Sem locker no MVP** (locker é evolução futura).
- **[Estoque]** **100% responsabilidade do lojista**. Keepit não faz gestão de estoque.
- **[Categorias]** **Variadas e abertas**. Foco inicial: alimentação, farmácia, vestuário — mas outros ramos podem entrar.
- **[Volume MVP]** **4-5 hubs físicos** no início. Poucos lojistas esperados — dimensionar operação em cima disso.

### Rodada 2 — 2026-07-02 (Caio, sujeito a validação do stakeholder)

#### Fluxo do pedido — modelo iFood-like (encontro sincronizado, sem armazenagem)

- **[Modelo do encontro]** **Encontro sincronizado**, sem armazenagem no hub. O produto fica na loja do lojista até o momento do encontro. Sem locker, sem depósito. Lojista sai da loja e leva ao hub apenas quando o pedido está pronto para entrega.
- **[Modo de retirada]** MVP: **apenas "retirar agora"**. Campo `modo` já reservado no modelo do pedido para permitir "agendado" em v2 sem migração.
- **[Aceite do lojista]** **Manual com timeout de 10 min**. Se o lojista não aceitar em 10 min, cancelamento automático + 100% de reembolso ao cliente.
- **[Tempo de preparo/entrega]** Ao aceitar, o lojista informa o **tempo estimado de entrega** (preparo + deslocamento até o hub). Valor padrão pré-preenchido a partir do cadastro do lojista (ver abaixo), editável caso a caso.
- **[Estados do pedido]** `Novo → Aceito → Em preparo → Saindo para o hub → No hub → Entregue` (com ramos `Cancelado` e `Não retirado`).
- **[Gatilho do encontro]** O gatilho é o lojista marcar **"Saindo para o hub"** no app. A partir daí, push para o cliente ir ao hub.
- **[Janela no hub]** Após ambos apertarem "Cheguei ao hub", há **janela de 10 min de tolerância** para o encontro se concretizar.
- **[Confirmação da entrega]** Cliente mostra **PIN de 4 dígitos** → lojista digita no app do lojista → entrega confirmada → dinheiro entra em custódia até D+7.

#### Cancelamento e exceções

- **[Cliente cancela antes do aceite]** 100% de reembolso.
- **[Timeout de aceite (10 min)]** Cancelamento automático + 100% de reembolso.
- **[Cliente cancela após aceite, antes de "Saindo para o hub"]** Reembolso **90%** ao cliente; **10%** fica com o lojista pelo trabalho iniciado.
- **[Cliente cancela após "Saindo para o hub"]** **Não pode cancelar**. Precisa comparecer ao encontro ou perder (regra "sem armazenagem").
- **[Cliente não apareceu (10 min pós-chegada do lojista no hub)]** Lojista aperta "Cliente não apareceu" → **20% de reembolso ao cliente / 80% para o lojista**. Lojista vai embora com o produto. Registrado como no-show do cliente.
- **[Lojista não apareceu no hub]** Cliente aperta "Lojista não veio" → **100% de reembolso** ao cliente + registro de falha de qualidade para o lojista. Admin pode suspender após N ocorrências (N a definir na operação).
- **[Atraso do lojista]** Se o lojista **não marcar "Saindo para o hub" em 2x o tempo estimado prometido** (ex: prometeu 30 min → alerta em 60 min), o sistema notifica o cliente com dois botões: **"Aguardar mais"** ou **"Cancelar com 100% de reembolso"**. Sem penalidade automática, mas atrasos ficam registrados como métrica de qualidade.
- **[Recusa do lojista]** Lojista pode recusar antes do aceite, com **motivo obrigatório** ("sem estoque" / "fora do horário" / "outro"). Vira métrica de qualidade.

#### Cadastro do lojista (raio de atendimento)

- **[Raio de atendimento]** No cadastro, o lojista informa: **endereço da loja (lat/long)**, **raio de atendimento em km** e **tempo médio de entrega em min**. Esses três campos determinam quais hubs a loja atende.
- **[Regra de exibição]** Sistema mostra a loja apenas para clientes buscando em hubs **dentro do raio de atendimento** da loja. Um hub fora do raio simplesmente não vê a loja.
- **[Tempo médio como padrão]** O `tempo médio de entrega` cadastrado vira o valor pré-preenchido no aceite de cada pedido.
- **[Aprovação]** **Manual pela Keepit** (curadoria). Fluxo: cadastro no app → status "Em análise" → admin revisa no painel → aprova ou rejeita com motivo.
- **[Documentos exigidos no MVP]** CNPJ + nome fantasia + telefone + responsável + categoria + hub(s) que quer operar + foto de fachada (opcional).
- **[Validação de CNPJ]** Automática via **BrasilAPI** (grátis, sem chave).
- **[Farmácia]** **Proibido vender medicamento tarjado no MVP** (evita conformidade ANVISA/receita). Só OTC, cosméticos, higiene, perfumaria. Regra documentada em Termos e categoria bloqueada no catálogo.

#### Cadastro do cliente

> ⚠️ **Dois itens deste bloco foram SUPERSEDED pela Rodada 6 (2026-07-29 — decisão 10.4).** Mantidos abaixo como registro histórico da Rodada 2. Vale o texto da Rodada 6.

- ~~**[Campos obrigatórios no cadastro]** E-mail + senha + telefone.~~ → **SUPERSEDED (10.4):** telefone é **opcional e não verificado** no cadastro do Cliente. Obrigatórios: nome, e-mail, senha. CPF segue **opcional** no cadastro.
- **[CPF]** Obrigatório no **primeiro checkout** (necessário para NF e anti-fraude).
- ~~**[Confirmação de telefone]** SMS com código de 4-6 dígitos. Serve também como fallback caso o cliente perca acesso ao app antes da retirada.~~ → **SUPERSEDED (10.4):** **sem SMS no MVP.** O fallback de acesso ao PIN passa a ser **re-login com e-mail + senha**.
- **[Login social]** **Fora do MVP**. Só e-mail + senha inicialmente. Apple/Google entra em v2.
- **[Guest checkout]** **Não**. Cadastro obrigatório antes de comprar.

#### Painel admin Keepit

- **[Escopo]** **Transacional**, não só read-only. Necessário para gerir escrow, aprovação manual e disputas.
- **[Funcionalidades MVP]**
  - Lista de lojistas: aprovar, rejeitar, suspender.
  - Lista de pedidos: filtrar por status; forçar cancelamento com estorno.
  - Lista de clientes: buscar; bloquear.
  - CRUD de hubs: nome, endereço, horário.
  - Dashboard financeiro: GMV, receita Keepit por período, ranking de lojas.
- **[Configuração de taxas]** **Sem UI no MVP**. Percentual da Keepit fica em arquivo de config no backend.

### Rodada 3 — 2026-07-02 (arquitetura técnica — parte 1)

Ver detalhamento em `docs/ARQUITETURA.md`.

- **[Gateway]** **Asaas** confirmado como escolha técnica (pendente validação comercial de tarifas e SLA de subconta).
- **[Modelo financeiro Asaas]** **Carteira virtual**: cobranças caem na conta master Keepit sem split; saldo do lojista é calculado no banco de dados (bloqueado por 7 dias após entrega); saque sob demanda dispara PIX externo único da master direto para o banco do lojista. Subconta Asaas do lojista existe apenas para KYC e cadastro de destino bancário — dinheiro não trafega por ela. Descartada a alternativa de transferências D+7 agendadas por pedido (mais complexa, sem benefício no MVP).
- **[Apps mobile]** **Expo (React Native)** para Cliente e Lojista, uma codebase por app rodando iOS e Android.
- **[Painel admin]** **Next.js** hospedado na Vercel.
- **[Repositório]** **Monorepo** com pnpm workspaces + Turborepo.
- **[Custos iniciais]** Apple Developer (US$ 99/ano) + Google Play (US$ 25 único) + domínio (~R$ 40/ano); free tiers de EAS/Vercel atendem o começo. Taxa Apple/Google de 15-30% **não se aplica** (marketplace de bens físicos é isento — pagamento via Asaas, não IAP).

### Rodada 4 — 2026-07-02 (arquitetura técnica — parte 2)

- **[Backend]** **Supabase** (PostgreSQL + Auth + Storage + Edge Functions + Row-Level Security). Substitui a proposta anterior de Node.js/Fastify separado. Regras de negócio (aceite, PIN, saldo, saque, webhooks Asaas) rodam em Edge Functions. Autorização por papel via RLS.
- **[Autenticação]** **Supabase Auth** com email + senha. Confirmação de telefone via SMS **Zenvia** disparada por Edge Function (não usa Supabase Auth Phone — evita custo do provider embutido).
- **[SMS]** **Zenvia** (~R$ 0,08/SMS, doc em português).
- **[Mapa]** **Sem provider de mapa**. Confirmado por inspeção do protótipo (`keepit-app/index.html`) que não há mapa visual — apenas texto de distância. Cálculo cliente↔hub via fórmula de Haversine em Edge Function.
- **[Descartados]** Node.js/Fastify + Railway + Google Maps (não são mais necessários dado o novo stack Supabase e a ausência de mapa).

### Rodada 5 — 2026-07-02 (regras de negócio complementares)

Todas confirmadas pelo Caio (sujeito a validação do stakeholder).

- **[Custo de entrega / deslocamento ao hub]** Cada lojista **define seu próprio valor por pedido** no cadastro do estabelecimento. O valor aparece no checkout do cliente como taxa de deslocamento e é somado ao total. Vai integralmente para o lojista, sem participação da Keepit sobre ele.
- **[Multi-loja no carrinho]** **Proibido no MVP.** 1 pedido = 1 loja. Se o cliente quiser comprar de 2 lojas do mesmo hub, precisa fazer 2 pedidos separados. Simplifica drasticamente o modelo de dados e o encontro no hub.
- **[Fluxo de descoberta]** Cliente **escolhe o hub primeiro** e depois vê as lojas daquele hub. O ponto de entrada principal do app é a seleção de hub.
- **[Busca]** Duas formas coexistem: **busca por produto** (retorna produtos + a loja que vende) e **busca por loja** (retorna a loja e o cardápio). Exige categorização/taxonomia mínima de produtos.
- **[Horário de funcionamento do lojista]** Lojista **configura horários** por dia da semana no cadastro do estabelecimento. Além disso, tem um **botão "marcar como fechado agora"** acessível a qualquer momento no app do lojista — quando ativo, a loja some do catálogo até ele reabrir manualmente. Fora do horário programado a loja aparece como "Fechada" e não recebe pedidos novos.
- **[Estoque]** **Não existe no app.** Lojista administra o próprio estoque por fora (planilha, sistema de PDV próprio, cabeça). O catálogo do Keepit só tem produto + preço + foto + descrição. Se o lojista aceitar um pedido e depois descobrir que não tem o item, aplica-se a matriz de cancelamento pós-aceite (reembolso 90% cliente / 10% lojista).
- **[Fotos de produto]** **Lojista faz upload no app.** Sem revisão prévia no MVP (moderação reativa se houver denúncia). Storage: Supabase Storage.
- **[Nota fiscal]**
  - **Lojista é responsável por emitir a NF** para o cliente final, conforme legislação brasileira vigente.
  - Keepit **não automatiza emissão de NF no MVP**. Cada lojista emite pelo próprio sistema/contador.
  - **Termos de uso** vão trazer cláusula explícita responsabilizando o lojista pela emissão da NF e recolhimento de impostos.
  - Campo `nf_solicitada: boolean` no pedido — se cliente pediu NF no checkout, o app do lojista mostra alerta.
  - Keepit emite NF de serviço/intermediação para o lojista mensalmente, via contador do stakeholder (fora do escopo do software MVP).
  - **⚠️ Ação bloqueante para lançamento:** contratar contador especializado em marketplace antes do go-live, considerando reforma tributária (CBS/IBS a partir de 2027 exige do marketplace responsabilidade solidária quando seller não emite).
  - Roadmap v2: integrar Focus NFe ou eNotas para emissão automática pelo app do lojista.
- **[Múltiplos estabelecimentos por dono]** **1 conta de usuário lojista = 1 estabelecimento no MVP.** Se um dono tem várias unidades, cria uma conta separada por unidade (com CNPJs próprios ou filiais). Modelo de dados: `estabelecimento.dono_user_id` 1:1 com `user`. Conceito de "rede/grupo de proprietário" fica para v2.
- **[Suporte / canais de contato]** Dois botões no app:
  - **"Falar com Keepit"** → abre WhatsApp da Keepit (número único de suporte).
  - **"Falar com o lojista"** (dentro do pedido / detalhe da loja) → abre WhatsApp do próprio lojista (número cadastrado no onboarding).
  - Sem chat interno no app. Sem central de ajuda no MVP.

### Rodada 6 — 2026-07-02 (ajustes finos)

- **[Taxa Keepit]** **Placeholder de 12%** sobre o valor do produto (não sobre taxa de deslocamento). Configurável em arquivo de config no backend. **Valor definitivo será fechado com stakeholder antes do lançamento.** Não vale UI no MVP.
- **[PIN — tentativas do lojista]** **5 tentativas** para digitar o PIN. Após esgotar, bloqueia por 5 minutos e libera automaticamente.
- **[PIN — fallback pelo cliente]** **Não existe.** Cliente que perdeu acesso ao app precisa acionar suporte via WhatsApp da Keepit. Nada de reenvio automático de PIN por SMS/WhatsApp.
- **[Avaliações]** **Fora do MVP.** O que aparece no protótipo (★ 4.8, ★ 4.6) é mockado — o card da loja mostra o número mas o dado vem de valor fixo/placeholder até v2. Retorno de investimento não justifica no MVP.
- **[Ticket mínimo por loja]**
  - **Regra global**: **R$ 20** é o mínimo padrão da plataforma.
  - **Regra secundária (loja)**: o lojista pode definir um mínimo próprio no cadastro do estabelecimento.
  - **Prevalência**: se a loja definir mínimo próprio, prevalece o da loja (pode ser maior ou menor que R$ 20). Se não definir, aplica R$ 20.
  - Regra técnica: `pedido_minimo_reais = COALESCE(loja.pedido_minimo_reais, 20.00)`.
- **[Validação temporal do pedido]** **Bloqueia pedidos impossíveis** no checkout. Regra: `agora + tempo_medio_lojista + 10min_janela ≤ hub.horario_fechamento`. Se não passar, checkout mostra: *"Este pedido não seria entregue dentro do horário do hub. Volte amanhã."*
- **[Reembolso — execução]** **Manual no MVP.** Todos os cancelamentos que geram reembolso viram um item no painel admin da Keepit, e o admin dispara o estorno via Asaas manualmente. Sistema não estorna sozinho. Vale para: timeout de aceite (auto-cancelamento continua acontecendo, só o estorno é manual), cancelamento pelo cliente, cliente/lojista que não apareceu, chargeback.
  - Estados de reembolso: `pendente_admin` → `em_processamento` → `estornado` (ou `erro`).
  - **Impacto operacional**: admin Keepit precisa conferir a fila diariamente. OK no MVP com volume baixo.
- **[Reagendamento de encontro]** **Não existe no MVP.** Falha no encontro (por qualquer lado) = cancelamento aplicando as regras da matriz. Cliente que quiser tentar de novo faz outro pedido.
- **[Cadastro de hubs]** **Apenas admin Keepit** cria e edita. Sem proposta de hub pelo lojista. Campos do hub: nome, endereço, lat/long, horário por dia da semana, ponto de referência (texto livre), foto opcional.
- **[LGPD — exclusão de conta]** **Botão in-app "Excluir minha conta"** no perfil do cliente. Ao tocar, **abre o WhatsApp da Keepit** com mensagem pré-preenchida (*"Quero excluir minha conta"*). Não deleta na hora — Keepit processa a solicitação manualmente e responde ao usuário. Isso cumpre a **Apple Guideline 5.1.1(v)** (obrigatório desde 2022; app é reprovado na revisão sem esse botão) e o direito à exclusão previsto na LGPD, mantendo o processo operacional simples.
- **[Favoritos]** **Fora do MVP.** Sem "hubs favoritos", sem "produtos favoritos".
- **[Comprar de novo]** **Fora do MVP.** Botão do protótipo será tratado como placeholder visual (não implementado). Roadmap v2.
