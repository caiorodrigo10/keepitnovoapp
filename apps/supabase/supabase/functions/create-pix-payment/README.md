# `create-pix-payment` — Edge Function

Cria (ou recupera, idempotente) a cobrança PIX real no Asaas para um pedido
já existente. Ver Story 7.2 (`docs/stories/7.2.story.md`) para o contexto
completo — este README cobre só "como rodar/testar", não repete os Dev
Notes.

## Fluxo

1. Chamada pelo client (`packages/core-data/src/supabase/payment.supabase.ts`,
   `PaymentPort.criarCobrancaPix`) via `supabase.functions.invoke('create-pix-payment', { body: { pedido_id } })`
   — **depois** que a RPC `criar_pedido`/`criar_pedido_com_ledger` já criou o
   pedido (não integrado na RPC — RPCs Postgres não fazem chamada HTTP).
2. `index.ts` (entrypoint `Deno.serve`) lê `{ pedido_id }`, monta
   `resolveAsaasConfig` (`config.ts`, AC2 — fecha CARRY-001 da Story 7.1),
   cria o `AsaasClient` (`_shared/asaas.ts`, Story 7.1) e um client Supabase
   real com a `service_role` key.
3. `handler.ts#handleCreatePixPayment` (puro, testado via Vitest): busca o
   pedido → idempotência (retorna direto se já tem cobrança) →
   `criarCliente` → `criarCobranca` (PIX) → `obterQrCodePix` →
   `pedidos.salvarCobrancaPix(...)`.
4. `index.ts` traduz o resultado em `200` (sucesso) ou `404`/`422`/`502`
   (erro), sempre em JSON.

## Decisão de arquitetura: testes em Vitest, não `deno test`

Mesma decisão da Story 7.1 (`_shared/README.md`): `deno` não está instalado
no ambiente de execução usado, e o gate do monorepo é `pnpm qa` (Vitest via
Turbo). `config.ts`/`handler.ts` são 100% portáveis (nunca importam `Deno`)
— só `index.ts` usa `Deno.serve`/`Deno.env`, e por isso não é (nem pode ser)
exercitado por Vitest. `_shared/deno-globals.d.ts` declara o subset mínimo
de `Deno` usado por `index.ts`, só para `tsc --noEmit` typechecar este
arquivo sob Node — não afeta o runtime real do Deno.

## Como rodar os testes offline

Da raiz do monorepo:

```bash
pnpm --filter @keepit/supabase test
# ou, direto no workspace:
cd apps/supabase && pnpm vitest run
```

Isso roda `config.test.ts` (4+ casos do AC2) e `handler.test.ts` (caminho
feliz completo, idempotência sem tocar `asaasClient`, cada etapa do Asaas
falhando isoladamente, `cliente_cpf` nulo) — todos 100% offline (nenhuma
chamada de rede real, `asaasClient`/`pedidos` sempre fakes injetados).

## Como testar manualmente contra o sandbox real

**Bloqueado hoje por `ASAAS-1`** (conta sandbox precisa estar aprovada) e
`ASAAS-2` (secrets `ASAAS_API_KEY`/`ASAAS_ENVIRONMENT`/`ASAAS_BASE_URL`
setados nos secrets do Supabase `keepit-dev`), mesmos dois itens que
bloqueiam a verificação manual da Story 7.1. Quando ambos estiverem
resolvidos, o roteiro é:

1. Criar um pedido real (`DATA_SOURCE=supabase`, app Cliente, checkout até
   "Pagar" com PIX) — anotar o `id` do pedido retornado.
2. Chamar a Edge Function diretamente (ou deixar `Pagamento.tsx` chamar
   automaticamente, best-effort — ver AC5):
   ```bash
   curl -i -X POST 'https://<project-ref>.supabase.co/functions/v1/create-pix-payment' \
     -H 'Authorization: Bearer <anon-ou-service-role-key>' \
     -H 'Content-Type: application/json' \
     -d '{"pedido_id": "<id-do-pedido>"}'
   ```
3. Confirmar `200` com `asaas_payment_id` (`pay_...`), `qr_code_pix` (PNG
   base64) e `pix_copia_e_cola` (BR Code EMV, começa com `000201...`).
4. Repetir a mesma chamada — confirmar que a 2ª resposta é idêntica à 1ª
   (idempotência, sem criar uma segunda cobrança no Asaas).
5. Conferir no banco (`keepit-dev`) que `pedidos.asaas_payment_id`/
   `qr_code_pix`/`pix_copia_e_cola` foram persistidos para aquele pedido.

## Segurança

- Nenhum segredo (`ASAAS_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) é logado ou
  incluído em mensagens de erro — só o corpo de erro devolvido pelo próprio
  Asaas (`_shared/asaas.ts`) ou mensagens genéricas deste módulo.
- `resolveAsaasConfig` nunca deriva para a base de produção por omissão
  (CARRY-001 do gate da Story 7.1) — default é sempre sandbox, a menos que
  `ASAAS_ENVIRONMENT === 'production'` explicitamente.
- Escrita em `pedidos` usa a `service_role` key (bypassa RLS) — mesmo padrão
  de toda escrita privilegiada do projeto (RPCs `SECURITY DEFINER`). O app
  nunca escreve essas colunas diretamente (RLS de `pedidos` já nega
  INSERT/UPDATE direto, ver `20260813004932_criar_pedidos.sql`).
