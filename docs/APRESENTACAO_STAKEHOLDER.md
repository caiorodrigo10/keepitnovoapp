# Keepit — Apresentação de Status e Solicitação de Acessos

**Para:** Thiago (Keepit)
**De:** Caio (desenvolvimento)
**Data:** 2026-07-03 · **Revisado em 2026-07-30** (decisão 10.4 — autenticação por e-mail + senha, sem SMS; impacto em fornecedores e custos nos itens 5.4, 7, 8.3 e 9)
**Objetivo:** Validar o que já foi feito, alinhar regras de negócio e destravar os acessos necessários para seguir do protótipo até apps publicados nas lojas.

---

## 1. Onde estamos hoje

Peguei o protótipo visual do Keepit (`keepit-app/index.html`) e transformei ele em um **plano de execução completo do MVP** — do que o produto faz, como o dinheiro anda, o que cada app tem que ter, até como publicar nas lojas. Foi um trabalho de destrinchar cada tela do protótipo, identificar as regras que ficaram implícitas, decidir stack técnico e desenhar a arquitetura.

O que já está pronto (documentação e fundação técnica):

- ✅ **Entendimento do produto** — cada tela do protótipo mapeada, personas, sistema de design.
- ✅ **Escopo do MVP fechado** — 3 apps (Cliente, Lojista, Admin) + 1 backend.
- ✅ **Regras de negócio propostas em 6 rodadas de decisão** — quase 30 decisões documentadas (fluxo do pedido, custódia, taxas, cancelamento, PIN, cadastros, admin).
- ✅ **Arquitetura técnica escolhida** — Expo (apps nativos iOS+Android), Next.js (admin), Supabase (backend), Asaas (pagamento).
- ✅ **PRD completo em 9 épicos e stories detalhadas** — pronto para desenvolvimento sequencial.
- ✅ **Estrutura do repositório** — monorepo com apps/cliente, apps/lojista, apps/admin, pacotes compartilhados.
- ✅ **Avaliação técnica dos gateways** — Asaas vs Pagar.me comparados com checklist e recomendação.

O que **falta para começar de fato a codar**:

- ⚠️ **Sua validação das regras de negócio** que propus — tudo abaixo está com o meu chute técnico marcado como "sujeito à validação do stakeholder".
- ⚠️ **Acessos e contas** que só você (dono da Keepit) pode criar — Asaas, Apple Developer, Google Play, domínio.
  - 📉 **Uma conta a menos do que na versão anterior deste documento:** a **Zenvia (SMS) saiu** do MVP. Isso te poupa a abertura de mais um cadastro com CNPJ e **zera o único custo mensal recorrente do projeto** — ver item 9.

---

## 2. O que é o Keepit (recap curto)

Marketplace hiperlocal **click-and-collect** com **hub compartilhado de bairro**:

- Cliente compra em lojas próximas pelo app e escolhe um **Hub Keepit** para retirar.
- Lojista aceita o pedido, prepara na loja dele e leva ao hub no horário combinado.
- No hub, cliente e lojista se encontram, cliente mostra um **PIN de 4 dígitos** e a entrega é confirmada.
- Sem entrega em casa. Sem armazenagem no hub. Sem locker no MVP — hub é ponto de encontro presencial.

3 produtos, 1 backend:
1. **App do Cliente** (iOS + Android) — tema claro.
2. **App do Lojista** (iOS + Android) — tema escuro `#1B1E1C`.
3. **Painel Admin Keepit** (web) — uso interno da Keepit.

---

## 3. Jornada do Cliente (end-to-end)

1. Abre o app e cria conta com **e-mail + senha** (telefone é opcional e não verificado). **Sem confirmação por SMS** — decisão de 2026-07-29, ver item 5.4.
2. **Escolhe primeiro o hub** perto dele (vê lista de hubs por distância).
3. Vê as lojas que atendem esse hub (lojas fora do raio de atendimento não aparecem).
4. Navega catálogo ou busca (por produto ou por loja).
5. Monta o carrinho **de uma única loja** (1 pedido = 1 loja no MVP) e vai pro checkout.
6. No checkout, vê subtotal + **taxa de deslocamento da loja** (definida pelo lojista) + total.
7. Paga com **PIX ou cartão de crédito**.
8. Recebe o **PIN de 4 dígitos** e o pedido entra em "Aguardando aceite".
9. Lojista aceita em até 10 min e informa o tempo estimado de preparo + deslocamento.
10. Cliente vê: *"Fica pronto em ~30 min → vá ao Hub Centro."*
11. Quando o lojista marca **"Saindo para o hub"**, cliente recebe push para ir.
12. No hub, ambos apertam **"Cheguei"**. Cliente mostra o PIN, lojista digita, entrega confirmada.
13. Ao final, cliente recebe o recibo.

**Exceções cobertas:** timeout de aceite, cancelamento pelo cliente (antes/depois do aceite), cliente não apareceu, lojista não apareceu, atraso do lojista. Cada caso tem regra de reembolso definida (item 5).

---

## 4. Jornada do Lojista (end-to-end)

1. Baixa o app do Lojista e cria conta com **e-mail + senha** (mesmo modelo do Cliente — sem SMS).
2. Preenche cadastro do estabelecimento: **CNPJ, categoria, endereço da loja, raio de atendimento em km, tempo médio de entrega em min, taxa de deslocamento, chave PIX, horário por dia da semana**, foto de fachada (opcional).
3. Estabelecimento fica **"Em análise"** — cliente ainda não vê essa loja.
4. **Admin Keepit revisa e aprova manualmente** no painel. Se aprovado, backend cria automaticamente a subconta Asaas do lojista.
5. Lojista cadastra o **catálogo** (produtos: foto, preço, descrição — sem gestão de estoque no app).
6. Passa a receber pedidos apenas de hubs dentro do raio dele.
7. Aceita cada pedido em até 10 min e informa tempo estimado.
8. Prepara na loja → marca **"Saindo para o hub"** quando sai.
9. Encontra o cliente no hub → digita o PIN → entrega confirmada.
10. Valor da venda entra na **carteira virtual** dele (bloqueado por 7 dias).
11. Após D+7, saldo entra em "disponível". Lojista solicita saque a partir de **R$ 200** → recebe via PIX na chave cadastrada.

---

## 5. Regras de negócio principais (para você validar)

Todas essas decisões estão em `docs/PERGUNTAS_REGRAS_NEGOCIO.md`. Aqui as mais críticas.

### 5.1 Financeiro

| Regra | Proposta atual | Precisa de você |
|---|---|---|
| Taxa Keepit (comissão) | **12% placeholder** sobre o valor do produto (não sobre taxa de deslocamento). Configurável no backend. | 🔴 Fechar o **percentual real** antes do lançamento. |
| Escrow (custódia) | Keepit segura tudo até o PIN ser confirmado. | ✅ OK |
| Prazo de repasse | **D+7 após a entrega**. Saldo passa de "bloqueado" para "disponível". | 🟡 Confirmar D+7 (padrão de mercado varia D+7 a D+30). |
| Saque do lojista | Sob demanda, **mínimo R$ 200**, via PIX. | 🟡 Confirmar mínimo. |
| Chargeback | **R$ 40 fixo** debitado do saldo do lojista + estorno ao cliente. | 🟡 Confirmar taxa fixa. |
| Taxa de deslocamento | Cada lojista define o próprio valor. Vai 100% para o lojista (sem % da Keepit sobre ela). | ✅ OK |
| Reembolso | **Manual pelo admin Keepit** no MVP. Cancelamentos criam item na fila; admin dispara estorno via Asaas. | ✅ OK (revisar após primeiros meses). |
| Ticket mínimo | **R$ 20 global**; lojista pode definir mínimo próprio (prevalece se definido). | 🟡 Confirmar R$ 20. |

### 5.2 Matriz de cancelamento

| Situação | Reembolso ao cliente | Fica com o lojista |
|---|---|---|
| Cliente cancela antes do aceite | 100% | 0% |
| Lojista não aceita em 10 min | 100% (auto-cancel) | 0% |
| Cliente cancela depois do aceite (mas antes do lojista sair da loja) | 90% | 10% |
| Cliente cancela depois de "Saindo para o hub" | ❌ Não pode cancelar | — |
| Cliente não apareceu no hub (10 min pós-chegada do lojista) | 20% | 80% |
| Lojista não apareceu no hub | 100% | 0% + registro de falha de qualidade |
| Atraso do lojista (2x o tempo prometido) | Cliente escolhe: aguardar ou 100% de reembolso | — |

### 5.3 Fluxo do pedido

- **1 pedido = 1 loja** (sem carrinho multi-loja no MVP).
- Estados: `Novo → Aguardando pagamento → Aguardando aceite → Aceito → Em preparo → Saindo para o hub → No hub → Entregue` (ramos: `Cancelado`, `Não retirado`).
- **PIN de 4 dígitos**, **5 tentativas** para o lojista digitar, bloqueia 5 min após esgotar.
- **Sem reagendamento** — falha no encontro = cancelamento; cliente refaz o pedido.
- **Sem gestão de estoque no app** — lojista administra por fora. Se aceitar e não tiver, aplica cancelamento 90/10.

### 5.4 Onboarding

- **Cliente**: **e-mail + senha**; telefone **opcional e não verificado**; CPF só no primeiro checkout; sem login social; sem guest checkout.
  - **Confirmação por SMS foi removida do MVP pela decisão 10.4 (2026-07-29)** — motivo: elimina uma integração externa (Zenvia), zera o custo recorrente de SMS e tira atrito do cadastro. Fica como candidata a v2 se surgir problema de fraude/contas falsas.
  - **Lojista e Admin usam o mesmo modelo** (e-mail + senha).
  - Consequência no PIN de retirada: se o cliente perder o acesso ao celular, ele **faz login de novo com e-mail e senha** em outro aparelho e vê o PIN. Não há reenvio de PIN por SMS.
  - 🟡 **Ainda em aberto (10.5):** se vamos **exigir confirmação do e-mail** antes de liberar o app. Com a saída do SMS, o e-mail vira o único canal verificável da conta — é o que garante o "Esqueci minha senha". Trade-off: exigir confirmação protege a recuperação de conta, mas adiciona um passo no cadastro. Preciso da sua posição.
- **Lojista**: aprovação **manual** pela Keepit. Validação de CNPJ automática (BrasilAPI, grátis). **Farmácia sem medicamento tarjado** no MVP (evita ANVISA/receita).
- **1 conta lojista = 1 estabelecimento**. Rede/multi-unidade fica para v2.

### 5.5 Fora do escopo do MVP (para confirmar)

- Avaliações com estrela (o ★ do protótipo é placeholder).
- Chat interno (só WhatsApp da Keepit e do lojista).
- Programa de fidelidade / cashback / cupom.
- Favoritos, "Comprar de novo".
- Múltiplas lojas no mesmo pedido.
- Locker no hub / armazenagem.
- Emissão automática de NF (lojista emite pelo próprio sistema; contador da Keepit emite NF de intermediação).

---

## 6. Sobre o Asaas e por que ele

Avaliei duas opções principais para gateway: **Asaas** e **Pagar.me/Stone Connect**. Cheguei ao **Asaas** por três razões:

1. **Sandbox aberto e gratuito** — dá pra desenvolver e testar de ponta a ponta sem burocracia de aprovação.
2. **Não exige status de PSP** — Pagar.me exige, e isso é meses de aprovação regulatória.
3. **Taxas competitivas para o modelo SMB** que o Keepit vai atender no início.

### 6.1 Como o Asaas se encaixa (modelo carteira virtual)

O Asaas **não tem escrow nativo** com liberação sob comando (nenhum gateway BR tem, na prática). Então adotei o modelo padrão que **iFood, Uber, Rappi** usam:

- Toda cobrança cai na **conta master da Keepit** (sem split imediato).
- O "saldo do lojista" é **calculado no banco de dados** — soma dos pedidos entregues, com bloqueio de 7 dias após cada entrega.
- Quando o lojista pede saque (≥ R$ 200), o backend dispara **uma única transferência via PIX** direto da conta master para o banco do lojista.
- Subconta Asaas do lojista existe **apenas para KYC** (validação de CNPJ e cadastro de destino bancário) — o dinheiro não passa por ela.

**Vantagens desse modelo:**
- Menos chamadas à API do Asaas por pedido (só cobra + saca).
- A regra D+7 vira uma condição no banco, não um cron por pedido.
- Chargeback e penalidade viram simples atualização de saldo interno.
- É reversível — se um dia quisermos dar visibilidade financeira ao lojista dentro do próprio Asaas, dá pra migrar sem perder dados.

### 6.2 Custos Asaas relevantes

| Operação | Custo |
|---|---|
| PIX recebido | R$ 0,99 (promo 3 meses) / R$ 1,99 depois. **30 grátis/mês** para PJ. |
| Cartão à vista | R$ 0,49 + 1,99% a 2,99% |
| Cartão parcelado (2-6x) | R$ 0,49 + 2,49% a 3,49% |
| PIX externo (saque para lojista) | Dentro do free tier no volume MVP; barato após esgotar |
| Sandbox | Grátis, limite 20 subcontas/dia |

**Pendências comerciais no Asaas** (para você conversar com o time comercial deles quando abrir a conta):
- Tarifas negociadas para o volume esperado.
- SLA de aprovação de subconta (não é público).
- Limites de transação e volume.
- Preço específico para operar como marketplace/white label.

---

## 7. Stack técnico escolhido (justificativa curta)

| Camada | Escolha | Por quê |
|---|---|---|
| Apps mobile | **Expo (React Native)** | Uma codebase por app, roda iOS e Android. Elimina custo de manter Swift + Kotlin em paralelo. |
| Painel admin | **Next.js** hospedado na Vercel | Rápido de fazer, deploy grátis no free tier. |
| Backend | **Supabase** (PostgreSQL + Auth + Storage + Edge Functions + RLS) | 1 serviço só resolve banco, auth, storage e regras. Free tier atende. |
| SMS | **Nenhum** | ~~Zenvia~~ **removido do MVP pela decisão 10.4 (2026-07-29)** — sem verificação de telefone, não há SMS a enviar. Uma integração e um fornecedor a menos. |
| Validação de CNPJ | **BrasilAPI** | Grátis, sem chave, dados direto da Receita. |
| Push mobile | **Expo Push Notifications** | Grátis. |
| Mapa | **Nenhum** | O protótipo não usa mapa visual (confirmado). Distância cliente↔hub calculada por fórmula matemática. |
| Repositório | **Monorepo** pnpm + Turborepo | Compartilha tipos/tema entre os 3 apps sem duplicar código. |

**Ambientes:** dois projetos Supabase (dev e prod), **ambos na nuvem** — sem Docker local. Reduz atrito de setup e é 100% suficiente para solo dev.

---

## 8. O que preciso de você — Acessos e Contas

Essa é a parte prática do documento. Para conseguir seguir com implementação, publicação e operação real, existem contas que **só o dono da Keepit pode criar** (CNPJ, dados bancários, aceites regulatórios). Coloquei em ordem de urgência.

### 8.1 🔴 Bloqueia desenvolvimento pesado

| Serviço | O que é | Como criar | O que preciso receber |
|---|---|---|---|
| **Asaas (Sandbox)** | Ambiente de teste do gateway de pagamento. Grátis, sem burocracia. | Você entra em `asaas.com`, cria conta com CNPJ da Keepit, ativa modo sandbox. | API Key do sandbox + acesso ao painel para eu configurar webhooks. |
| **Asaas (Produção)** | Conta real de recebimento — todo dinheiro do Keepit vai passar por aqui. | Cadastro com CNPJ da Keepit, dados bancários da empresa, contrato social. Análise pode levar dias. | API Key de produção (só quando estivermos perto do lançamento). |
| **Supabase** | Banco de dados + auth do backend. | Você cria conta no `supabase.com` (grátis) com e-mail da empresa. Criamos 2 projetos: `keepit-dev` e `keepit-prod`. | Convite como membro/owner na organização Keepit; eu opero com meu login vinculado. |

### 8.2 🟡 Necessário para publicar nas lojas (fazer paralelo agora)

| Serviço | Custo | Prazo de aprovação | Por que precisa de você |
|---|---|---|---|
| **Apple Developer Program** | **US$ 99/ano (~R$ 550)** | 1-2 dias úteis (às vezes mais para PJ) | Apple exige conta **como Pessoa Jurídica** — D-U-N-S Number da Keepit + dados fiscais. Uma conta só publica os dois apps (Cliente e Lojista). |
| **Google Play Console** | **US$ 25 pagamento único** | Alguns dias para verificação | Cadastro como PJ (documentos da Keepit). Uma conta publica os dois apps. |
| **Expo (EAS)** | R$ 0 no início (30 builds/mês) | Instantâneo | Conta grátis. Depois pode migrar pra plano pago (~US$ 99/mês) se o volume exigir. |
| **Domínio** (`keepit.com.br` ou similar) | ~R$ 40/ano | Instantâneo | Registro.br. Precisa CNPJ da Keepit. |

### 8.3 🟢 Necessário quando ligar produção

| Serviço | Custo | Por quê |
|---|---|---|
| ~~**Zenvia** (SMS)~~ | ~~R$ 10-50/mês~~ → **R$ 0** | ❌ **Não precisa mais criar.** Removido do MVP pela decisão 10.4 (2026-07-29) — sem confirmação de telefone por SMS. Era o único fornecedor com custo mensal recorrente. |
| **Vercel** (admin web) | R$ 0 (free tier) | Hospedagem do painel admin. |
| **WhatsApp Business** | Grátis | Número único da Keepit para os botões "Falar com Keepit" no app. |
| **Contador especializado em marketplace** | Fora do software | ⚠️ Necessário **antes do go-live** por causa da reforma tributária (CBS/IBS 2027 exige do marketplace responsabilidade solidária quando lojista não emite NF). |

---

## 9. Estimativa de custo fixo do MVP (primeiro ano)

| Item | Custo |
|---|---|
| Apple Developer | US$ 99 (~R$ 550/ano) |
| Google Play | US$ 25 (~R$ 140 único) |
| Domínio | ~R$ 40/ano |
| Supabase (free) | R$ 0 |
| Vercel (free) | R$ 0 |
| Expo EAS (free) | R$ 0 |
| ~~Zenvia SMS~~ | ~~R$ 10-50/mês~~ → **R$ 0** (removido) |
| Asaas | Por transação (comissão dele sai do fluxo) |
| **Total fixo estimado** | **~R$ 700 no primeiro ano — e R$ 0/mês recorrente** |

### 9.1 📉 O que mudou nesta versão: a saída do SMS reduziu o custo

A decisão de **tirar a confirmação por SMS do MVP** (2026-07-29) eliminou o **único custo mensal recorrente** do projeto. Comparativo explícito:

| | Versão anterior (com Zenvia) | **Versão atual (sem SMS)** |
|---|---|---|
| Custos fixos do ano 1 | ~R$ 700 | **~R$ 700** (sem mudança) |
| Custo mensal recorrente | R$ 10-50/mês | **R$ 0/mês** |
| **Total no 1º ano** | ~R$ 820 a ~R$ 1.300 | **~R$ 700** |
| Economia no 1º ano | — | **R$ 120 a R$ 600** |
| Fornecedores a contratar | 6 (Asaas, Apple, Google, Expo, domínio, Zenvia) | **5** (Zenvia sai) |

Além do dinheiro, o ganho é de simplicidade: **uma conta a menos para você abrir com CNPJ**, uma integração a menos para manter e um passo a menos no cadastro do cliente. Se no futuro aparecer problema de contas falsas, o SMS volta como item de v2.

Quando o volume subir, ordem esperada de **R$ 200-500/mês** de infra.

**Nota sobre taxa Apple/Google (15-30%):** **não se aplica** ao Keepit. Essa taxa incide só sobre conteúdo *digital* consumido dentro do app (assinaturas, cursos, moedas virtuais). Marketplace de bens físicos entregues fora do app (comida, remédios, roupas retirados no hub) é **explicitamente isento** pela Apple e Google. É o mesmo enquadramento que iFood, Rappi, Uber Eats e Amazon usam — o pagamento vai direto pelo Asaas, sem passar por In-App Purchase.

---

## 10. Próximos passos concretos

**Da sua parte (Thiago):**

1. Ler este documento e me dizer se está de acordo com a proposta geral.
2. Marcar 1h para revisar as regras de negócio (item 5) e fechar o que ainda está como placeholder — principalmente **taxa Keepit real**, **prazo de repasse** e **regras de cancelamento**.
3. Fechar a pendência **10.5** — se o cliente precisa **confirmar o e-mail** antes de usar o app (item 5.4). É rápido de decidir e destrava o fluxo de cadastro.
4. Criar conta no **Asaas sandbox** e me passar as credenciais.
5. Iniciar processo do **Apple Developer** e **Google Play** (esses têm prazo de aprovação, precisa começar antes).
6. Registrar o **domínio da Keepit** se ainda não existe.
7. Indicar contador para tocar em paralelo a parte fiscal/tributária.

**Da minha parte (Caio) após seu OK:**

1. Iniciar o desenvolvimento pelo **Épico 1 — Setup & Fundação**: criar os 2 projetos Supabase, subir a estrutura base dos 3 apps, extrair os assets do protótipo.
2. Seguir para **Épicos 2 e 3** — auth do cliente e do lojista com aprovação admin.
3. Encaixar Asaas na **Épico 7 — Pagamento & Carteira** (sandbox suficiente até termos conta de produção).
4. Manter você atualizado a cada épico entregue (7-9 semanas de desenvolvimento estimado para o MVP inteiro).

---

## 11. Documentos de referência

Se quiser se aprofundar em qualquer parte, tudo está versionado no repositório:

| Arquivo | O que tem |
|---|---|
| `ENTENDIMENTO_APP.md` | Análise tela-por-tela do protótipo |
| `docs/ESCOPO_MVP.md` | Escopo acordado + princípios |
| `docs/PERGUNTAS_REGRAS_NEGOCIO.md` | Todas as decisões de negócio (6 rodadas) |
| `docs/ARQUITETURA.md` | Arquitetura técnica detalhada |
| `docs/gateway/asaas.md` | Análise técnica completa do Asaas |
| `docs/gateway/pagarme.md` | Comparação com Pagar.me |
| `docs/prd/` | PRD completo em 9 épicos + stories |
| `docs/architecture/` | Modelo de dados (Supabase) e política de segurança (RLS) |

---

**Fim do documento.**
Fico à disposição para ajustar qualquer parte antes da nossa conversa. — Caio
