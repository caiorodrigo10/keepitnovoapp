# 07 — Arquitetura do backend essencial para o piloto

Este documento é um **overlay arquitetural**. Em conflitos sobre profundidade de
backend, ele prevalece sobre `docs/ARQUITETURA.md` e `docs/prd/04-technical.md`.
Stack, segurança e contratos existentes continuam válidos.

## Objetivo

Manter os três frontends detalhados e conectar uma única fatia vertical real,
sem construir automações destinadas a uma operação maior que o piloto.

```text
Cliente/Expo ─┐
Lojista/Expo ─┼─> supabase-js ─> PostgreSQL + RLS + Auth + Storage
Admin/Next ───┘                         │
                                       └─> Edge Functions mínimas ─> Asaas PIX
```

Não existe API Node separada, fila, cache, motor de workflow, barramento de
eventos ou camada analítica.

## Fronteira entre frontend e backend

Os contratos em `packages/core-data` permanecem como fronteira estável. Uma
implementação Supabase pode ser direta, mas não pode retornar sucesso fictício.

- Leitura e CRUD simples: `supabase-js` + RLS.
- Operação privilegiada ou com segredo: Edge Function.
- Métricas: views/queries SQL diretas.
- Atualização de pedido ativo: polling moderado e refresh manual.
- Ação manual: criar registro de solicitação/ocorrência com status e autoria.

## Edge Functions mínimas

| Função | Por que precisa existir |
|---|---|
| `create-pix-payment` | Protege a chave Asaas, cria cobrança e associa ao pedido. |
| `asaas-payment-webhook` | Valida origem, processa idempotentemente e confirma pagamento. |
| `confirm-order-pin` | Evita expor PIN e valida transição de entrega no servidor. |
| `admin-financial-action` | Registra reembolso/repasse manual com autorização administrativa. |

Cadastro, catálogo, busca e mudanças comuns de perfil não precisam de Edge
Function quando RLS e constraints cobrem a autorização.

## Fluxo do pedido no piloto

```text
draft -> awaiting_payment -> awaiting_acceptance -> preparing -> at_hub -> delivered
                         \-> cancelled       \---------------------> support_required
```

- `awaiting_payment`: cobrança PIX criada.
- `awaiting_acceptance`: somente após webhook confirmado.
- `preparing`: lojista aceitou e informou previsão.
- `at_hub`: um check-in operacional do lojista é suficiente.
- `delivered`: somente a função de PIN pode produzir este estado.
- `support_required`: exceções depois do aceite seguem para operação humana.

O modelo de dados pode manter estados mais detalhados já existentes. O piloto
apenas não depende de automações para transitar por todos eles.

## Financeiro mínimo

Mesmo com repasse manual, valores não podem viver apenas como soma recalculada
da UI. Manter um ledger simples e auditável com:

- referência ao pedido;
- tipo (`charge`, `platform_fee`, `merchant_credit`, `refund`, `payout`);
- valor imutável em centavos;
- status;
- identificador externo do Asaas quando existir;
- timestamps e ator administrativo.

O botão de saque cria uma solicitação. O admin executa o PIX fora do fluxo
automatizado, informa a referência e conclui a solicitação. Reembolso segue a
mesma lógica. Automatizar depois não exige mudar a experiência nem perder o
histórico.

## Descoberta

- Hubs cadastrados explicitamente pelo Admin.
- Cliente escolhe um hub em lista.
- Relação loja↔hub explícita no banco ou definida na aprovação.
- Busca por produto/loja com filtro case-insensitive do PostgreSQL.
- Sem GPS, Haversine, mapa, geocoding ou ranking especializado no piloto.

## O que permanece obrigatório

- RLS por papel e ownership.
- Segredos apenas em ambiente server-side.
- Webhook autenticado, idempotente e com evento persistido.
- Constraints e validação server-side para estados críticos.
- PIN não armazenado/exposto em texto puro quando o modelo atual permitir hash.
- Testes unitários do PIN, valores financeiros e transições do pedido.
- Smoke manual da fatia vertical antes de cada promoção para produção.

## Gatilhos para aumentar complexidade

| Gatilho observado | Capacidade a retomar |
|---|---|
| Operação perde pedidos por falta de aviso | Push nativo. |
| Admin não consegue acompanhar vencimentos | Job de timeout. |
| Clientes abandonam checkout por falta de opção | Cartão/tokenização. |
| Repasses manuais consomem tempo ou geram erro | Saque automático/subconta. |
| Número de hubs torna escolha manual ruim | GPS/Haversine/mapa. |
| Exceções recorrentes mostram padrão estável | Motor de cancelamento/no-show. |
