# `_shared/asaas.ts` — cliente HTTP do Asaas

Wrapper HTTP tipado do Asaas, consumido por Edge Functions do piloto Keepit
(pagamento PIX, estorno, transferência). Ver Story 7.1
(`docs/stories/7.1.story.md`) para o contexto completo — este README cobre
só "como rodar/testar", não repete os Dev Notes.

## Decisão de arquitetura: testes em Vitest, não `deno test`

A Story 7.1 original previa `deno test` (o runtime de produção deste código
é o Edge Runtime do Supabase, Deno 2). A missão de implementação
**sobrepôs** essa decisão: `deno` não está instalado no ambiente de
execução usado e o gate do monorepo é `pnpm qa` (que roda Vitest via Turbo
em todos os workspaces, incluindo este). Por isso:

- `asaas.ts` é **100% portável** — não importa nem chama `Deno.env` em
  nenhum ponto. `createAsaasClient({ baseUrl, apiKey, fetchImpl? })` recebe
  a configuração já resolvida pelo chamador.
- O `fetch` usado é o global (nativo em Node 18+ e no Edge Runtime/Deno 2);
  `fetchImpl` é injetável para testes 100% offline.
- A leitura de `ASAAS_API_KEY`/`ASAAS_ENVIRONMENT`/`ASAAS_BASE_URL` via
  `Deno.env.get(...)` fica para o entrypoint da Edge Function que vai
  consumir este client — **fora do escopo desta Story** (Stories 7.2/7.5).

Se/quando `deno` for instalado no ambiente de CI/execução, este client
continua compatível com `deno test` (não usa nenhuma API exclusiva de
Node) — só não é isso que `pnpm qa` roda hoje.

## Como rodar os testes offline

Da raiz do monorepo:

```bash
pnpm --filter @keepit/supabase test
# ou, direto no workspace:
cd apps/supabase && pnpm vitest run
```

Isso roda `supabase/functions/_shared/asaas.test.ts` — todos os testes usam
um `fetchImpl` mockado (`vi.fn()`), nunca uma chamada de rede real. `pnpm qa`
na raiz do monorepo (via Turbo) já cobre este workspace (`test`/`typecheck`).

## Como testar cada método manualmente contra o sandbox real

**Bloqueado hoje por `ASAAS-1`** (conta sandbox precisa estar aprovada) e
`ASAAS-2` (secrets `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN`/`ASAAS_BASE_URL`
setados nos secrets do Supabase `keepit-dev`). Quando ambos estiverem
resolvidos, o roteiro por método é:

1. **`criarCliente`** — funciona mesmo **antes** da aprovação da conta
   sandbox (`ASAAS-1`). `POST {baseUrl}/customers` com `name`/`cpfCnpj` de
   teste; confirmar que o `id` retornado começa com `cus_`.
2. **`criarCobranca`** (PIX) — **exige conta aprovada** (`ASAAS-1`); antes
   disso o Asaas devolve erro "conta precisa estar aprovada". Usar o `id`
   de um cliente já criado; confirmar `status: "PENDING"` e `id` começando
   com `pay_`.
3. **`obterQrCodePix`** — chamar logo após uma cobrança PIX criada;
   confirmar que `encodedImage` é um PNG base64 válido (abre como imagem) e
   que `payload` é um BR Code EMV (começa com `000201...`).
4. **`estornarCobranca`** — chamar sobre uma cobrança PIX já `RECEIVED`
   (pagar via sandbox primeiro); testar uma vez sem body (estorno total) e
   uma vez com `{ value: <parcial> }`.
5. **`criarTransferencia`** — **reservado**: no piloto o repasse ao lojista
   é manual pelo admin (Story 7.8), este método não é chamado em produção.
   Se testado manualmente, usar uma `pixAddressKey` de teste sandbox e
   confirmar o shape real da resposta contra o tipo `AsaasTransfer` desta
   Story (documentado como best-effort, não verificado).

Além dos 5 métodos, quando o handler de webhook for implementado (Story
7.5), **registrar o webhook** via `POST {baseUrl}/webhooks` (não é um
método deste client — é uma chamada avulsa, feita uma vez por ambiente, com
`url`, `events` e `authToken` = `ASAAS_WEBHOOK_TOKEN`).

### Stubs não testáveis contra sandbox nesta fase

`criarSubconta` e `tokenizarCartao` são stubs reservados — devolvem sempre
`{ ok: false, error: { code: 'NOT_IMPLEMENTED_PILOT' } }` **sem fazer
nenhuma chamada HTTP**. Não há nada para testar contra o sandbox: o piloto
usa conta Asaas única (sem subconta por lojista) e cartão/tokenização estão
deferidos. Retomar quando essas features forem reabertas pós-piloto.

## Segurança

- Nenhum segredo (`ASAAS_API_KEY`) é logado ou incluído em `AsaasError.message`/`details` — só o corpo de erro devolvido pelo próprio Asaas.
- `apiKey` chega pronto via `AsaasClientConfig`; este arquivo nunca lê env.
