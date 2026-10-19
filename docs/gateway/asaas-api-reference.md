# Asaas API — referência prática para o Épico 7 (piloto PIX)

> Extraído da doc oficial (docs.asaas.com) em 2026-08-27 para fundamentar o
> client `_shared/asaas.ts` (Story 7.1) e as Edge Functions (7.2/7.5/7.11).
> Complementa a avaliação de capacidades em `asaas.md`. Piloto usa **sandbox**
> e **conta Asaas única da Keepit** (sem subconta por lojista).

## Autenticação e base

- **Base URL (sandbox):** `https://api-sandbox.asaas.com/v3` (env `ASAAS_BASE_URL`)
- **Auth de TODA chamada:** header **`access_token: <ASAAS_API_KEY>`** (a chave sandbox começa com `$aact_hmlg_`)
- Content-Type: `application/json`
- Secrets vivem no env server-side (Edge Function `Deno.env.get(...)`), nunca no bundle do app.

## Endpoints usados no piloto

### 1. Criar cliente — `POST /v3/customers`
Requerido: `name`, `cpfCnpj`. Opcional: `email`, `phone`, `mobilePhone`, `externalReference`.
```json
// req
{ "name": "Maria Silva", "cpfCnpj": "24971563792", "email": "m@x.com", "externalReference": "cliente-uuid" }
// res 200 (guardar o id)
{ "object": "customer", "id": "cus_000005401844", "name": "Maria Silva", "cpfCnpj": "24971563792", "personType": "FISICA", "deleted": false }
```

### 2. Criar cobrança PIX — `POST /v3/payments`
Requerido: `customer` (id `cus_…`), `billingType: "PIX"`, `value` (reais, decimal), `dueDate` (`YYYY-MM-DD`).
Opcional: `description`, `externalReference` (usar o `pedido.id` — é a ponte de volta no webhook).
```json
// req
{ "customer": "cus_000005401844", "billingType": "PIX", "value": 129.90, "dueDate": "2026-08-28", "description": "Pedido Keepit", "externalReference": "PED-uuid" }
// res (guardar id = asaas_payment_id)
{ "id": "pay_080225913252", "object": "payment", "status": "PENDING", "value": 129.90, "netValue": 124.90, "billingType": "PIX", "externalReference": "PED-uuid", "invoiceUrl": "https://www.asaas.com/i/080225913252", "dateCreated": "2026-08-27" }
```

### 3. Obter QR Code PIX — `GET /v3/payments/{id}/pixQrCode`
```json
// res → persistir em qr_code_pix (encodedImage) e pix_copia_e_cola (payload)
{ "encodedImage": "iVBORw0KGgoAAAANSUhEUgAA...", "payload": "00020101021226730014br.gov.bcb.pix...", "expirationDate": "2026-08-28T23:59:59.000Z" }
```
- `encodedImage`: PNG base64 do QR (renderizar direto).
- `payload`: BR Code EMV oficial (copia-e-cola).

### 4. Estornar cobrança — `POST /v3/payments/{id}/refund`
Body opcional `{ "value": <parcial>, "description": "..." }`. Sem body = estorno total. (Usado no cancelamento/reembolso.)

### 5. Transferência (repasse ao lojista) — `POST /v3/transfers`
Modelo-alvo (subconta). **No piloto o repasse é MANUAL pelo admin** (overlay 07) — este endpoint fica reservado, não no caminho ativo do piloto.

## Webhooks (receber eventos)

- **Registro:** `POST /v3/webhooks` (ou painel) com `url`, `events`, e um `authToken` (32–255 chars = nosso `ASAAS_WEBHOOK_TOKEN`).
- **Validação (obrigatória):** todo POST do Asaas traz o header **`asaas-access-token: <ASAAS_WEBHOOK_TOKEN>`**. A Edge Function DEVE comparar e rejeitar (401) se não bater.
- **Idempotência (obrigatória):** entrega é "at least once" — o MESMO evento pode chegar mais de uma vez. Deduplicar por `id` do evento (`evt_…`) e/ou pelo estado do pedido (não re-confirmar um pedido já pago).
- **Resposta:** retornar HTTP **2xx** senão o Asaas re-tenta.

### Payload
```json
{
  "id": "evt_05b708f961d739ea7eba7e4db318f621",
  "event": "PAYMENT_RECEIVED",
  "dateCreated": "2026-08-27 16:45:03",
  "payment": {
    "object": "payment",
    "id": "pay_080225913252",
    "value": 129.90,
    "netValue": 124.90,
    "status": "RECEIVED",
    "billingType": "PIX",
    "externalReference": "PED-uuid",
    "dueDate": "2026-08-28",
    "paymentDate": "2026-08-27"
  }
}
```

### Eventos que tratamos
| Evento | Ação no pedido |
|---|---|
| `PAYMENT_RECEIVED` / `PAYMENT_CONFIRMED` | achar pedido por `asaas_payment_id` (= `payment.id`) → `status = 'aguardando_aceite'`, `pago_em = now()` + entrada `charge` no ledger |
| `PAYMENT_REFUNDED` | pedido estornado (fluxo de cancelamento/reembolso) |
| `PAYMENT_CHARGEBACK_REQUESTED` | `status = 'estornado_chargeback'` + débito no ledger único + `estabelecimentos_falhas tipo='chargeback'` |

> Nota de reconciliação: buscar o pedido pelo `asaas_payment_id` persistido (mais robusto) ou, alternativamente, pelo `externalReference` (= `pedido.id`, que enviamos na criação).

## Restrições operacionais do sandbox (piloto)

- **ASAAS-1:** criar cobrança PIX exige a conta sandbox **aprovada** (`AWAITING_APPROVAL` → retorna "conta precisa estar aprovada"). Criar cliente e registrar webhook funcionam **antes** da aprovação.
- **ASAAS-2:** `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN`/`ASAAS_BASE_URL` precisam estar nos **secrets do Supabase `keepit-dev`** (as Edge Functions leem de lá).
- Limite: 20 subcontas/dia (irrelevante no piloto de conta única).
