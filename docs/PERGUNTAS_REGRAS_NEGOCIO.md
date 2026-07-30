# Keepit — Perguntas de Regras de Negócio (pré-desenvolvimento)

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

### 10.5 🟡 Confirmação de e-mail é obrigatória para usar o app? — aberto (revelado na reconciliação do Épico 2, 2026-07-30)
Com a saída do SMS (10.4), o **e-mail vira o único canal verificável** da conta do cliente — e a decisão 10.4 não diz se ele precisa ser confirmado. O Supabase Auth tem a opção "Confirm email" ligada por padrão. Duas alternativas, com trade-off real:

- **(a) Sem confirmação obrigatória** (`Confirm email` off): cadastro → home imediatamente, atrito zero. Risco: e-mail digitado errado = cliente **perde o "Esqueci a senha"** (Story 2.7) e, por consequência, o acesso ao PIN via re-login (fallback da 10.4). Também abre espaço para contas com e-mail de terceiros.
- **(b) Confirmação obrigatória** (`Confirm email` on): cadastro → tela "confirme seu e-mail" → só então home. Garante recuperação de conta e o fallback do PIN. Custo: um passo a mais no funil e risco de e-mail cair em spam.

Impacto direto: Story 2.3 (AC5, para onde navega o signup), Story 2.6 (login de conta não confirmada), Story 2.11 (momento do prompt de push). **Enquanto não decidido, o Épico 2 assume (a)** — navegação direta para a home, como escrito nas ACs — por ser o comportamento que as telas do protótipo já mostram. → **STAKEHOLDER** (ou Caio, se quiser fechar como decisão técnica).

---

## Decisões (fechadas)

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

- **[Campos obrigatórios no cadastro]** E-mail + senha + telefone. CPF é **opcional** no cadastro.
- **[CPF]** Obrigatório no **primeiro checkout** (necessário para NF e anti-fraude).
- **[Confirmação de telefone]** SMS com código de 4-6 dígitos. Serve também como fallback caso o cliente perca acesso ao app antes da retirada.
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
