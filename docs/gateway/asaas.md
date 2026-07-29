# Asaas — avaliação técnica para MVP Keepit

**Data da pesquisa:** 2026-07-02
**Fontes principais:**
- [Split de Pagamentos — docs](https://docs.asaas.com/docs/split-de-pagamentos)
- [Dúvidas frequentes — Split](https://docs.asaas.com/docs/duvidas-frequentes-split)
- [Criação de subcontas](https://docs.asaas.com/docs/criacao-de-subcontas)
- [Criar subconta — API reference](https://docs.asaas.com/reference/criar-subconta)
- [Sandbox](https://docs.asaas.com/docs/sandbox-3)
- [Preços e taxas](https://www.asaas.com/precos-e-taxas)

---

## Resumo executivo

O Asaas **atende bem os métodos de pagamento** (PIX + cartão) e tem um modelo de **subcontas com walletId próprio** que se encaixa bem no MVP do Keepit. O sandbox é aberto e permite testar tudo inclusive criação de subcontas (limite 20/dia).

**Ponto crítico:** o Asaas **não tem custódia (escrow) nativa com liberação sob comando**. O split, quando usado, executa **imediatamente no recebimento** — o dinheiro cai na subconta do lojista antes do PIN ser confirmado. Isso não atende a regra "D+7 após entrega" do Keepit.

**Workaround viável e simples:** não usar split. A Keepit recebe **tudo na conta master**, e após o PIN confirmado, dispara transferência interna Asaas→Asaas (grátis nas primeiras 30/mês) para a subconta do lojista, com data de crédito D+7. Essa lógica fica no backend do Keepit, não no gateway. É simples e cabe no MVP.

**Recomendação:** **adequado com ressalvas**. Assumindo o workaround acima, o Asaas cobre todo o MVP. É mais fácil de operar que Pagar.me (não requer status de PSP, sandbox aberto, menos burocracia inicial). Custo por transação parece competitivo.

---

## Checklist de capacidades

| # | Requisito | Status | Notas |
|---|---|---|---|
| 1 | Split de pagamentos | ✅ | Percentual ou fixo, sobre valor líquido. Split é imediato — não serve pro escrow do Keepit. |
| 2 | PIX | ✅ | Nativo, com QR Code, webhook de confirmação. |
| 3 | Cartão de crédito | ✅ | Tokenização + parcelado até 21x. |
| 4 | Custódia / escrow com liberação sob comando | ❌ (⚠️ via workaround) | Não tem nativo. Workaround: receber tudo na conta master + transferência manual pós-PIN. |
| 5 | Prazo D+7 configurável por transação | ❌ (⚠️ via workaround) | Não existe parâmetro para atrasar liberação por transação. Mesmo workaround acima. |
| 6 | Subcontas por lojista | ✅ | `POST /v3/accounts` cria subconta com apiKey e walletId próprios. |
| 7 | Saque via PIX ao lojista | ✅ | Via API. Transferência entre contas Asaas grátis nos primeiros 30/mês, depois R$ 2. Saque externo R$ 10 + IOF. |
| 8 | Chargeback | ⚠️ | Reversão automática do split. Não achei API pra debitar taxa fixa (R$ 40) do saldo — precisamos implementar lógica de débito interno no backend. |
| 9 | KYC lojista (CNPJ) | ✅ | Onboarding via API na criação de subconta. Validação de CNPJ na Receita. |
| 10 | Webhooks | ✅ | Configuráveis por subconta na criação. Eventos: pagamento aprovado, PIX recebido, transferência, chargeback. |
| 11 | Taxas competitivas | ✅ | Ver tabela abaixo. |
| 12 | Sandbox | ✅ | Aberto, gratuito, sem burocracia. Limite: 20 subcontas/dia. |
| 13 | SDK Node.js | ⚠️ | Sem SDK oficial destacado. HTTP + JSON simples cobre; usar SDK comunitário se preciso. |
| 14 | Limites/restrições | ⚠️ | Não achei limites publicados; verificar com comercial. |

---

## Detalhamento por tema

### Split de pagamentos

- Configurável via API somente (não via dashboard web).
- Cada split é sobre o **valor líquido** (após taxa Asaas).
- Suporta **percentual** e **valor fixo**, combináveis.
- Todas as partes envolvidas precisam ter **conta Asaas** e o Keepit precisa saber os `walletId` delas.
- **Split é imediato no recebimento** — não há período de retenção configurável. Fonte: FAQ oficial ("O split é executado automaticamente no momento do recebimento").
- Em caso de estorno/chargeback, o split é **estornado automaticamente** de todas as carteiras envolvidas.

### PIX

- Recebimento com QR Code dinâmico ou estático, ou copia-e-cola.
- Confirmação instantânea via webhook.
- Até **30 transações grátis** por mês para PJ (via chave estática); depois R$ 0,99 (promo 3 meses) / R$ 1,99.
- **QR Code dinâmico**: gratuito.

### Cartão de crédito

- Tokenização, parcelado até 21x.
- Taxa: R$ 0,49 fixo + % sobre o valor. Ver tabela abaixo.

### Custódia / retenção / repasse customizado

**Este é o ponto crítico do MVP.**

- Asaas **não oferece** parâmetro para reter valor de split antes de repassar.
- Alternativa recomendada na própria FAQ do Asaas: *"crie a cobrança sem split, receba o valor total na sua conta, e apenas no dia desejado transfira para a subconta"*.
- Isso funciona bem para o modelo Keepit:
  1. Venda é criada como cobrança **sem split**, tudo cai na conta master da Keepit.
  2. Após o PIN ser confirmado no app, o backend agenda uma transferência interna para a subconta do lojista com data D+7.
  3. Se houver cancelamento antes do PIN, a Keepit estorna diretamente ao cliente e não transfere nada.
- **Custo do workaround**: transferências internas grátis nas primeiras 30/mês por subconta; depois R$ 2 cada. Barato o suficiente para o MVP.

### Subcontas por lojista

- `POST /v3/accounts` cria subconta.
- Retorno inclui `apiKey` (exibido **apenas uma vez** — armazenar imediatamente) e `walletId`.
- Suporta configuração de webhook já na criação (não precisa de chamada adicional).
- Modelo é oficialmente destinado a **"marketplaces, white label e ERPs"**.
- No sandbox: limite de 20 subcontas/dia.

### Saque

- Lojista pode sacar sob demanda via API (transferência PIX ou TED para conta bancária externa).
- Regra "mínimo R$ 200" do Keepit fica no backend do app, não no gateway.
- Taxas: transferência PIX interna entre contas Asaas 30/mês grátis; externa TED R$ 5; saque bancário R$ 10 + IOF 3,5%.

### Chargeback

- Reversão automática do split (estorno proporcional em todas as carteiras).
- **Regra da Keepit de "R$ 40 fixo debitado do saldo do lojista"**: precisa ser implementada no backend do Keepit — criar uma transferência da subconta do lojista para a conta master no valor de R$ 40 quando o webhook de chargeback disparar.

### KYC / onboarding

- Todos os dados do lojista (CNPJ, dados bancários, endereço, responsável) enviados via API na criação da subconta.
- Validação de CNPJ automática pela Receita ocorre no lado do Asaas.
- Aprovação: subconta fica em status "aguardando aprovação" até validação. Não achei SLA público — **verificar com comercial**.

### Webhooks e API

- REST + JSON, autenticação via API key no header.
- Webhooks configuráveis: eventos de cobrança, pagamento, saque, chargeback, subconta.
- Retry automático em caso de falha (política de retry documentada).
- Sandbox e produção são endpoints separados.

### Taxas (tabela)

| Operação | Taxa promocional (3 meses) | Taxa regular |
|---|---|---|
| PIX recebido | R$ 0,99 | R$ 1,99 (com 30 grátis/mês PJ) |
| PIX QR Code dinâmico | Grátis | Grátis |
| Cartão à vista | R$ 0,49 + 1,99% a 2,99% | idem |
| Cartão 2-6x | R$ 0,49 + 2,49% a 3,49% | idem |
| Cartão 7-12x | R$ 0,49 + 2,99% a 3,99% | idem |
| Boleto | R$ 0,99 | R$ 1,99 |
| Transferência entre contas Asaas | Grátis (30/mês) | R$ 2 |
| TED externo | R$ 5 | R$ 5 |
| Saque bancário | R$ 10 + 3,5% IOF | idem |

Preço de subconta/white label não está na página pública de preços — **verificar com comercial**.

### Sandbox e SDK

- **Sandbox**: aberto, gratuito, sem análise prévia. URL separada da produção.
- **SDK oficial Node.js**: não achei um oficial mantido. API REST é simples o suficiente para consumir direto com `fetch`/axios. Existem SDKs comunitários no npm.

### Limitações e riscos

- **Sem escrow nativo** — mitigado pelo workaround, mas adiciona complexidade no backend.
- Preço de subconta/white label não é público.
- Sem SDK oficial Node.js robusto.
- Documentação em português é boa, mas alguns pontos operacionais (SLA de aprovação, limites) só vêm com comercial.

---

## Conclusão

**Recomendação: adequado com ressalvas.**

Cobre todos os requisitos técnicos do MVP mediante o workaround "receber na conta master + transferir pós-PIN". Isso simplifica a integração inicial (sem depender de status de PSP como o Pagar.me exige) e o sandbox aberto acelera o desenvolvimento.

**Próximos passos se for adotado:**
1. Criar conta no sandbox e testar o fluxo end-to-end: criar subconta → criar cobrança → receber PIX → transferir para subconta.
2. Falar com comercial para: (a) preço de operar como marketplace/white label, (b) SLA de aprovação de subcontas, (c) limites de transação e volume.
3. Definir com stakeholder se o custo Asaas cabe no % Keepit sem apertar demais o repasse.
