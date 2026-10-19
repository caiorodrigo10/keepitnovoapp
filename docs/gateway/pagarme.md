# Pagar.me — avaliação técnica para MVP Keepit

**Data da pesquisa:** 2026-07-02
**Fontes principais:**
- [Visão Geral do Marketplace](https://docs.pagar.me/reference/vis%C3%A3o-geral-do-marketplace)
- [Recebedores (Recipients)](https://docs.pagar.me/reference/recebedores-1)
- [Split](https://docs.pagar.me/reference/split-1)
- [Split Rules — v3](https://docs.pagar.me/v3/docs/split-rules)
- [Webhooks — visão geral](https://docs.pagar.me/reference/vis%C3%A3o-geral-sobre-webhooks)
- [PIX docs](https://docs.pagar.me/docs/pix-1)
- [Central de ajuda Stone/Pagar.me — PIX](https://pagarme.helpjuice.com/pt_BR/p1-meios-de-pagamento/pix-saiba-mais-sobre-esse-meio-de-pagamento)

---

## Resumo executivo

O Pagar.me (grupo Stone) tem uma arquitetura de marketplace **madura e completa**: modelo de **recipients** com KYC próprio, split com controle fino de responsabilidade (chargeback, taxas), e configurabilidade de `transfer_interval` por recipient. Ferramentas de sandbox estão bem documentadas (chaves `sk_test_` / `pk_test_`).

**Ponto crítico 1 — restrição de acesso.** A funcionalidade de split é **restrita a contas onde o Pagar.me é o adquirente** — não funciona para PSPs terceiros. Além disso, contas marketplace precisam de credenciamento (`status: registration → affiliation → active`), o que atrasa o início da operação (não achei SLA público — **verificar com comercial**).

**Ponto crítico 2 — retenção não é linear.** O modelo padrão do Pagar.me para cartão de crédito já tem retenção estrutural (D+30 típico do mercado de adquirência) e o repasse ao recipient segue o `transfer_interval` configurado. Para o modelo Keepit ("liberar D+7 após PIN"), a alternativa é: manter `transfer_enabled=false` no recipient e disparar manualmente a transferência via API quando o PIN for confirmado + prazo D+7. Isso funciona mas exige integração mais cuidadosa.

**Recomendação:** **adequado com ressalvas — bom para escala, exagerado para MVP.** Se a Keepit quer ganhar produtividade agora, o Asaas é mais direto. Se o objetivo é montar infraestrutura para crescer com modelo marketplace robusto de longo prazo (com regras de chargeback finas por recipient, antecipação de recebíveis, etc.), o Pagar.me compensa.

---

## Checklist de capacidades

| # | Requisito | Status | Notas |
|---|---|---|---|
| 1 | Split de pagamentos | ✅ | Rico: `liable`, `charge_processing_fee`, `charge_remainder_fee`, `flat`/`percentage`. |
| 2 | PIX | ✅ | Nativo. Conciliação instantânea. |
| 3 | Cartão de crédito | ✅ | Tokenização + parcelado. |
| 4 | Custódia / escrow com liberação sob comando | ⚠️ | Via `transfer_enabled=false` no recipient + transferência manual via API pós-PIN. Funciona, mas exige lógica no backend. |
| 5 | Prazo D+7 configurável | ⚠️ | `transfer_interval` (Daily/Weekly/Monthly) + `transfer_day` são gerais por recipient, não por transação. Para "D+7 após PIN" precisa lógica no backend Keepit. |
| 6 | Recipients (recebedores) | ✅ | KYC próprio, dados bancários, statuses claros (registration/affiliation/active/refused/suspended/blocked). |
| 7 | Saque / transferência ao lojista | ✅ | Via API, respeitando `transfer_settings`. Taxa de saque ~R$ 3,67. |
| 8 | Chargeback | ✅ | Parâmetro `liable` no split define responsável. Se `liable=true` no recipient, ele absorve o chargeback. |
| 9 | KYC lojista (CNPJ) | ✅ | Full pipeline: criar recipient → aguardar `affiliation` → `active`. Conformidade com Circular BACEN 3.978/20 (vigente desde fev/2024). |
| 10 | Webhooks (postbacks) | ✅ | Eventos configuráveis por URL, retry manual, endpoint pra listar falhas. |
| 11 | Taxas competitivas | ⚠️ | Cartão ~5,59% + R$ 0,99 (uma fonte); PIX ~1,19%; saque ~R$ 3,67. Planos personalizados via comercial para volume relevante. |
| 12 | Sandbox | ✅ | Chaves `sk_test_*`/`pk_test_*`, mesmo endpoint da produção, tipo de chave define o ambiente. |
| 13 | SDK Node.js | ⚠️ | Sem SDK oficial Node.js mantido publicamente. Há SDK PHP oficial (`pagarme/pagarme-php`). API REST é bem documentada. |
| 14 | Restrição de acesso | ⚠️ | Split disponível **apenas quando Pagar.me é o adquirente** (não PSPs terceiros). Requer credenciamento formal. |

---

## Detalhamento por tema

### Split de pagamentos (recipients)

Estrutura do split (v5):
- `amount`: valor destinado ao recipient (em centavos).
- `recipient_id`: código do recipient (`rp_XXXXXXXXXXXXXXXX`).
- `type`: `flat` (valor fixo) ou `percentage`.
- `options.liable` (bool): recipient assume responsabilidade em caso de chargeback.
- `options.charge_processing_fee` (bool): recipient tem taxas do gateway debitadas da parte dele.
- `options.charge_remainder_fee`: quem fica com o remainder após divisão.

Regras importantes:
- **Pelo menos um recipient** precisa aceitar chargeback (`liable=true`) e taxas (`charge_processing_fee=true`).
- Para o modelo Keepit, sugestão: Keepit é `liable=true` na conta master (assume chargeback), lojista `liable=false`, e Keepit debita R$ 40 do saldo do lojista via transferência interna quando chargeback ocorre. Isso mantém compatibilidade com a regra de negócio decidida.

### PIX

- Nativo, com QR Code e copia-e-cola.
- Conciliação instantânea; valor "disponível para saque na mesma hora" segundo documentação.
- Suporta split em transações PIX.
- Taxa aproximada: **1,19%** por PIX recebido (fonte: pesquisa de mercado — não confirmado no site oficial, **verificar com comercial**).

### Cartão de crédito

- Tokenização (`tokens` API) → uso do token na criação do `order`.
- Parcelado suportado; regras podem ser aplicadas por recipient (`charge_processing_fee`).
- MDR aproximado: **5,59% + R$ 0,99** (fonte: pesquisa de mercado — **planos personalizados para volume relevante**, verificar com comercial).
- **A partir de 2026** o MDR de intercâmbio tem teto de 3,6% por regulação BACEN.

### Custódia / retenção / repasse customizado

**Este é o ponto crítico do MVP.**

- Cartão de crédito no Pagar.me segue o ciclo padrão de adquirência: o valor fica no ambiente Pagar.me e é distribuído aos recipients conforme `transfer_settings`.
- PIX cai instantaneamente no saldo do recipient — se houver split, é dividido no ato.
- **Para reter até PIN confirmado + D+7 (regra Keepit), duas abordagens:**
  1. **Recipient com `transfer_enabled=false`** — recipient recebe o crédito no saldo mas as transferências pra conta bancária são bloqueadas até a Keepit habilitar via API. Combinado com a lógica no backend: dispara transferência via API quando PIN confirmado + D+7.
  2. **Não fazer split no ato** — receber tudo na conta master da Keepit e disparar transferência para recipient depois via API de transferências. Mais controle, mais chamadas de API.

Ambas exigem lógica de estado no backend Keepit. Nenhuma é "configuração pronta" do Pagar.me.

### Recipients (recebedores)

Ciclo de vida:
1. `registration` — pré-credenciamento; pode transacionar; **não pode sacar**.
2. `affiliation` — aguardando aprovação Pagar.me; transacionável, sem saque.
3. `active` — aprovado; transaciona e saca.
4. `refused` — negado; nenhuma operação.
5. `suspended` — problema pendente; bloqueado.
6. `blocked/inactive` — bloqueado por comportamento suspeito pós-ativação.

Campos obrigatórios na criação:
- `name`, `email`, `document` (CPF/CNPJ), `type` (`individual`/`company`), `default_bank_account`.

Compliance:
- Circular BACEN 3.978/20 (vigente desde fev/2024) exige documentação adicional; o cadastro do recipient reflete essa exigência.
- **Tempo de aprovação não publicado — verificar com comercial.**

### Saque / transferências

- `transfer_settings.transfer_enabled` (bool): permite ou não saque automático.
- `transfer_settings.transfer_interval`: `Daily`, `Weekly`, `Monthly`.
- `transfer_settings.transfer_day`: dia do mês/semana.
- Taxa de saque aproximada: **R$ 3,67**.
- Regra Keepit ("mínimo R$ 200 sob demanda"): implementar no backend do Keepit — quando o lojista solicitar, disparar transferência via API se saldo >= 200.

### Chargeback e liability

- Parâmetro `liable` no split define quem assume o chargeback.
- Se `liable=true` para um recipient, o gateway estorna direto do saldo desse recipient (sujeito a saldo positivo — se ele já sacou, entra em dívida).
- Regra Keepit ("R$ 40 fixo debitado do saldo do lojista"): implementar no backend Keepit — quando webhook de chargeback dispara, dedução do saldo do recipient via transferência interna.

### KYC / onboarding

- Pipeline formal via `POST /recipients` + `POST /recipients/{id}/kyc_link` (link para envio de documentos).
- Documentação de KYC exigida conforme regulação BACEN.
- **Tempo de aprovação: não publicado — verificar com comercial.**
- Para o MVP com poucos lojistas curados, dá pra tratar isso como parte do onboarding manual (o admin Keepit espera o `status: active` antes de liberar o lojista pra operar).

### Webhooks e API

- REST + JSON, autenticação via API key (basic auth).
- Endpoint único: `https://api.pagar.me/core/v5`.
- Chaves determinam ambiente (sandbox vs produção).
- Webhooks configuráveis por URL e por evento.
- Eventos disponíveis incluem `customer.created`, `card.created`, `charge.paid`, `order.paid`, `chargeback.*`, `transfer.*` (lista completa em `/reference/eventos-de-webhook-1`).
- Retry configurável + endpoint para reenvio manual de webhooks que falharam.

### Taxas (tabela aproximada — verificar com comercial)

| Operação | Valor aproximado | Fonte |
|---|---|---|
| Cartão de crédito | 5,59% + R$ 0,99 | Pesquisa de mercado, planos personalizados |
| PIX | 1,19% | Pesquisa de mercado |
| Transação (fixa) | R$ 0,99 | Pesquisa de mercado |
| Saque / transferência | R$ 3,67 | Pesquisa de mercado |
| Boleto pago | R$ 3,49 | Pesquisa de mercado |
| MDR teto 2026 | 3,6% | Regulação BACEN |

**Não localizei uma tabela oficial pública consolidada.** O Pagar.me trabalha com planos negociados para volume relevante. Para MVP com volume baixo, esperar taxas de balcão (topo da faixa).

### Sandbox e SDK

- **Sandbox**: chaves `sk_test_*` (secret) e `pk_test_*` (public); mesmo endpoint que produção. Tipo da chave define o comportamento.
- **SDK oficial Node.js**: não localizei um SDK oficial mantido pelo Pagar.me. Existe SDK PHP oficial (`pagarme/pagarme-php`). Para Node.js: consumir a API REST direto ou usar SDK comunitário.

### Limitações e riscos

- **Split restrito a Pagar.me como adquirente** — não dá para usar Pagar.me como camada de split com outro PSP.
- **Credenciamento formal necessário** para operar como marketplace — tempo de aprovação não publicado.
- Sem SDK oficial Node.js — mais desenvolvimento manual.
- Taxas não são públicas — negociação com comercial obrigatória para ter previsibilidade de custo.
- Setup inicial mais burocrático que Asaas.
- **Vantagem estrutural**: melhor para escalar (recipients robustos, chargeback com liability granular, integração Stone completa).

---

## Conclusão

**Recomendação: adequado com ressalvas — bom para escala, exagerado para MVP.**

Cobre todos os requisitos técnicos, com dois pontos a considerar:
1. **Escrow via `transfer_enabled=false` + transferência manual** exige lógica no backend igual (ou um pouco mais complexa que) ao workaround do Asaas.
2. **Credenciamento como marketplace** adiciona latência para começar a testar — sandbox está aberto pra desenvolvimento, mas produção depende de aprovação Pagar.me.

Se o objetivo é **acelerar o MVP**, o Asaas é mais direto. Se a Keepit já tem planos de crescer volume rapidamente e quer infra robusta desde o início, o Pagar.me compensa o setup extra.

**Próximos passos se for adotado:**
1. Criar conta sandbox e testar: criar recipient → transacionar via PIX e cartão → simular chargeback → forçar transferência via API.
2. Falar com comercial para: (a) taxa negociada para o volume esperado, (b) SLA de credenciamento como marketplace, (c) SLA de aprovação de recipients (`registration → active`).
3. Decidir com stakeholder se a robustez extra do Pagar.me justifica o esforço de integração maior comparado ao Asaas.
