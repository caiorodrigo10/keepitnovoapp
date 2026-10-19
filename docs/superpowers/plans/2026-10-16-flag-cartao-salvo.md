# Flag de cartão salvo — Implementation Plan

**Nível: MVP / mudança delimitada (bounded).**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:subagent-driven-development only when delegation is explicitly authorized. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** desabilitar cartões salvos por padrão, preservando pagamento com cartão digitado sem salvar e Pix.

**Architecture:** completar os handlers e as telas existentes com duas flags de ambiente estritas. Backend bloqueia operações antes de efeitos; app oculta controles, protege rotas restauradas e normaliza consentimento. Sem infraestrutura adicional.

**Tech Stack:** TypeScript, Supabase Edge Functions/Deno, Expo/React Native, Vitest e react-test-renderer já instalados.

**Spec:** [2026-10-16-flag-cartao-salvo-design.md](../specs/2026-10-16-flag-cartao-salvo-design.md).

## Global Constraints

- Nesta entrega: somente spec e plano, com commit local exclusivamente desses dois documentos.
- Sem implementação, push, deploy, produção, chamadas ao Asaas ou alterações em telecodex/hermes/app-server.
- Implementação futura: sem dependências novas, migrations, serviço de flags, endpoint de capabilities, cron ou mudanças no esquema.
- Não imprimir segredos nem dados de cartão; testes somente com fixtures sintéticas e dependências simuladas.
- `CARD_TOKENIZATION_ENABLED` e `EXPO_PUBLIC_CARD_TOKENIZATION_ENABLED`: somente `'true'` liga; padrão desligado. Não aceitar override por request, datasource ou QA.
- HTTP 503, código `CARD_TOKENIZATION_DISABLED`, mensagem `Cartões salvos estão temporariamente indisponíveis. Digite os dados do cartão sem salvar ou use Pix.`.
- Bloquear requests válidos/autorizados antes de dependências privilegiadas, claims e gateway; preservar CORS/OPTIONS, autenticação, autorização e validação existentes.
- Não apagar cartões; não alterar webhook, consulta/encerramento de tentativa ou reconciliação financeira de compras iniciadas.

## Contexto e execução

**7 tasks; nenhuma executada.** Não existe flag equivalente encontrada na base `8e540f2`; existem fluxos completos de cartão salvo. `CARD_VALIDATION_AMOUNT_CENTS` não substitui a flag. Reusar `Deno.env.get(...) === 'true'` de `process-account-deletions/index.ts` e acesso estático `process.env.EXPO_PUBLIC_...` de `apps/cliente/src/config/buildInfo.ts`.

Executar futuramente na raiz deste worktree. Cada passo é uma ação curta; repetir RED/GREEN por cenário antes do commit da task. Os exemplos são inserções nos testes existentes e reutilizam seus imports/fixtures/harness explicitamente identificados. Para testes de fluxo antigo, configurar flag ligada explicitamente; nunca mudar o default para fazer a suíte passar. Os comandos de commit abaixo são checkpoints de implementação futura, não autorização para implementá-la agora.

Não criar gráfico de arquitetura, instalar ferramentas ou consultar serviços externos: a investigação necessária é local. `docs/superpowers` é ignorado pelo Git; nesta entrega o pedido explícito de commit autoriza adicionar à força somente os dois paths solicitados, sem mudar `.gitignore`.

## Mapa de arquivos

Todos os paths abaixo são relativos à raiz. Cada task detalha seus testes.

| Task | Unidade / arquivos de implementação | Responsabilidade |
| --- | --- | --- |
| 1 | `apps/supabase/supabase/functions/_shared/card-tokenization.ts` (novo); `tokenize-card/{handler,index}.ts` sob o mesmo diretório de functions | Erro comum e bloqueio de cadastro/configuração |
| 2 | `apps/supabase/supabase/functions/reconcile-card-validation/{handler,index}.ts` | Bloqueio administrativo antes do serviço |
| 3 | `apps/supabase/supabase/functions/create-card-payment/{handler,index}.ts`; `packages/core-data/src/payment-errors.ts` | Bloqueio de compra salva/salvamento e erro público tipado |
| 4 | `apps/cliente/src/config/featureFlags.ts` (novo); `apps/cliente/src/hooks/useSavedCards.ts` | Flag pública e ausência de consultas/mutações |
| 5 | `apps/cliente/src/components/checkout/CardPaymentForm.tsx`; `apps/cliente/src/hooks/usePagamentoReal.ts` | Formulário sem salvar e proteção do envio |
| 6 | `apps/cliente/src/screens/perfil/{Perfil,Cartoes}.tsx`; `apps/cliente/src/screens/home/AdicionarCartao.tsx` | Ocultar entrada de perfil e proteger rotas diretas |
| 7 | `apps/cliente/src/screens/home/{Pagamento,Checkout}.tsx`; `apps/cliente/src/screens/modals/ModalProcessandoPagamento.tsx`; `apps/supabase/README.md` | Checkout/retomada, divergência entre flags e instruções de configuração |

Manter nomes de rotas, estrutura dos stacks, contratos de pagamento e schemas. Não mudar `CartContext` nem criar um motor geral de flags.

### Task 1: Bloquear cadastro e configuração de cartão no backend

**Arquivos:** criar `apps/supabase/supabase/functions/_shared/card-tokenization.ts`; modificar `apps/supabase/supabase/functions/tokenize-card/handler.ts`, `index.ts`, `handler.test.ts`, `index.test.ts`.

**Interfaces:** `createTokenizeCardHttpHandler` passa a aceitar `enabled?: boolean` (ausência desliga). Exportar `cardTokenizationDisabled(): { status: number; body: { error: { code: string; message: string } } }` no novo shared. Sem import de Deno no handler.

- [ ] **RED — escrever teste de bloqueio**, no `tokenize-card/handler.test.ts`, usando `request`, `operationId`, `sandboxCard` e `sandboxHolder` já existentes:

```ts
it.each([
  { acao: 'configuracao' },
  { acao: 'cadastrar', operacao_id: operationId, cartao: sandboxCard, titular: sandboxHolder },
])('desliga por padrão sem construir serviço', async (body) => {
  const createDeps = vi.fn();
  const amountCents = vi.fn(() => 137);
  const handler = createTokenizeCardHttpHandler({
    allowedOrigins: [], amountCents, authenticate: async () => 'cliente-a',
    authorizeClient: async () => true, createDeps,
  });
  const response = await handler(request(body));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: {
    code: 'CARD_TOKENIZATION_DISABLED',
    message: 'Cartões salvos estão temporariamente indisponíveis. Digite os dados do cartão sem salvar ou use Pix.',
  } });
  expect(createDeps).not.toHaveBeenCalled();
  expect(amountCents).not.toHaveBeenCalled();
});
```

- [ ] **Executar RED:** `pnpm --filter @keepit/supabase test -- supabase/functions/tokenize-card/handler.test.ts`. Falha esperada: configuração retorna 200 ou cadastro chega ao serviço.
- [ ] **GREEN — acrescentar flag e guarda mínima.** No shared:

```ts
export function cardTokenizationDisabled() {
  return { status: 503, body: { error: {
    code: 'CARD_TOKENIZATION_DISABLED',
    message: 'Cartões salvos estão temporariamente indisponíveis. Digite os dados do cartão sem salvar ou use Pix.',
  } } };
}
```

No tipo de deps acrescentar `enabled?: boolean`. No começo de `execute`, autenticação e body já foram validados. Mover a autorização atual de cadastro para antes da guarda, removendo sua duplicata posterior:

```ts
if (body.acao === 'cadastrar' && !await deps.authorizeClient(token, usuarioId)) {
  return { status: 403, body: { error: { code: 'ACESSO_NEGADO' } } };
}
if (deps.enabled !== true) return cardTokenizationDisabled();
```

Importar o shared com extensão `.ts`. No objeto de `createTokenizeCardHttpHandler` em `index.ts`, inserir:

```ts
enabled: Deno.env.get('CARD_TOKENIZATION_ENABLED') === 'true',
```

- [ ] **RED/GREEN dos limites:** parametrizar `index.test.ts` com env ausente, `''`, `'false'`, `'1'`, `'TRUE'`, `' true '` e `'true'`; usar `vi.stubGlobal('Deno', ...)`, capturar `Deno.serve` e chamar configuração com autenticação simulada. Só `'true'` retorna 200 com valor 137. Acrescentar `enabled: true` aos testes de fluxo antigo. Verificar sessão inválida 401, cliente não autorizado 403, body inválido 400 e OPTIONS 204 com flag falsa; nenhuma factory chamada.
- [ ] **Verificar GREEN:** `pnpm --filter @keepit/supabase test -- supabase/functions/tokenize-card` — todos passam, inclusive valor de validação ausente quando flag ligada.
- [ ] **Commit local futuro:** `git add apps/supabase/supabase/functions/_shared/card-tokenization.ts apps/supabase/supabase/functions/tokenize-card && git commit -m "feat: gate card registration behind tokenization flag"`.

### Task 2: Bloquear reconciliação de validação de cartão

**Arquivos:** modificar `apps/supabase/supabase/functions/reconcile-card-validation/handler.ts`, `index.ts`, `handler.test.ts`, `index.test.ts`.

**Interfaces:** consumir `cardTokenizationDisabled()` da task 1; acrescentar `enabled?: boolean` exclusivamente nas deps de `createReconcileCardValidationHttpHandler`. Não alterar assinatura/algoritmo de `handleReconcileCardValidation` interno.

- [ ] **RED — acrescentar ao `handler.test.ts`:**

```ts
it('bloqueia admin autorizado por padrão antes do serviço', async () => {
  const createDeps = vi.fn();
  const handler = createReconcileCardValidationHttpHandler({
    authenticateAdmin: async () => ({ authenticated: true, adminId: 'admin-1' }),
    createDeps,
  });
  const response = await handler(request({ operacaoId: operationId }));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: 'CARD_TOKENIZATION_DISABLED' } });
  expect(createDeps).not.toHaveBeenCalled();
});
```

- [ ] **Executar RED:** `pnpm --filter @keepit/supabase test -- supabase/functions/reconcile-card-validation/handler.test.ts`. Falha esperada: factory é chamada e/ou código genérico de reconciliação.
- [ ] **GREEN — importar shared; após validar admin e body, antes de `handleReconcileCardValidation`:**

```ts
if (deps.enabled !== true) {
  const disabled = cardTokenizationDisabled();
  return json(disabled.status, disabled.body);
}
```

Em `index.ts`, passar `enabled: Deno.env.get('CARD_TOKENIZATION_ENABLED') === 'true'` à factory HTTP. Manter OPTIONS antes da guarda e segurança antes de criar client privilegiado.
- [ ] **RED/GREEN dos limites:** `enabled: false` também bloqueia; flag ligada preserva operação concluída e a reconciliação atual; sem sessão 401, não admin 403 e body inválido 400 continuam. Substituir o teste vazio atual de `index.test.ts` (`expect(true).toBe(true)`) por import do entrypoint com `Deno.serve` capturado, env simulada e `createClient` mockado: autenticar usuário, autorizar admin e usar operação concluída no repositório. Ausência/falso/valor inválido não habilitam e `'true'` habilita. Os testes internos de algoritmo continuam independentes da flag HTTP.
- [ ] **Verificar GREEN:** `pnpm --filter @keepit/supabase test -- supabase/functions/reconcile-card-validation` — nenhum acesso ao repositório/Asaas em requests bloqueados.
- [ ] **Commit local futuro:** `git add apps/supabase/supabase/functions/reconcile-card-validation && git commit -m "feat: gate card validation reconciliation"`.

### Task 3: Bloquear token/salvamento na compra e propagar erro claro

**Arquivos:** modificar `apps/supabase/supabase/functions/create-card-payment/handler.ts`, `index.ts`, `handler.test.ts`, `index.test.ts`; modificar `packages/core-data/src/payment-errors.ts` e `packages/core-data/src/supabase/payment.supabase.test.ts`. O adapter `payment.supabase.ts` já usa a lista de códigos permitidos; não precisa de novo transporte.

**Interfaces:** `CardDeps` e deps de `createCardHttpHandler` recebem `enabled?: boolean`; ausência desliga apenas uso/salvamento de token. Consumir shared da task 1. `PaymentActionErrorCode` ganha `'CARD_TOKENIZATION_DISABLED'` e sua mensagem definida na spec.

- [ ] **RED — no `handler.test.ts`, reusar `setup` e fixtures existentes:**

```ts
it.each([false, undefined])('digitado sem salvar continua com flag desligada: %s', async (salvar_cartao) => {
  const t = setup();
  const result = await handleCreateCardPayment({ ...input, salvar_cartao }, { ...t.deps, enabled: false });
  expect(result).toMatchObject({ ok: true, data: { tentativa: { estado: 'pendente' } } });
  expect(t.payloads).toHaveLength(1);
  expect(t.savedTokens).toHaveLength(0);
});
it.each([
  { ...input, salvar_cartao: true },
  { pedido_id: id, operacao_id: id, usuario_id: 'owner', remoteIp: '203.0.113.10', cartao_salvo_id: 'cartao-a' },
])('recusa operação dependente de token antes do claim', async (paymentInput) => {
  const t = setup();
  const claim = vi.spyOn(t.deps.pedidos, 'claim');
  const result = await handleCreateCardPayment(paymentInput, { ...t.deps, enabled: false });
  expect(result).toMatchObject({ ok: false, error: { status: 503, code: 'CARD_TOKENIZATION_DISABLED' } });
  expect(claim).not.toHaveBeenCalled();
  expect(t.payloads).toHaveLength(0);
  expect(t.cardOperations).toHaveLength(0);
  expect(t.savedTokens).toHaveLength(0);
  expect(t.writes).toHaveLength(0);
});
```

Acrescentar também casos de `enabled` ausente; em testes HTTP montar body salvo com **somente** os três IDs (não usar o helper que inclui cartão digitado). Verificar 503 e `createDeps` não chamada para salvo e salvar=true. Replays com token também bloqueiam; consulta de tentativa segue disponível.
- [ ] **Executar RED:** `pnpm --filter @keepit/supabase test -- supabase/functions/create-card-payment`. Falha esperada: cobranças são executadas nos casos bloqueados.
- [ ] **GREEN — guarda HTTP após `authorizeOrder` e antes de IP/factory; guarda de domínio no início de `handleCreateCardPayment`:**

```ts
// Dentro de execute HTTP, com body já validado:
if (deps.enabled !== true && ('cartao_salvo_id' in body || body.salvar_cartao === true)) {
  return cardTokenizationDisabled();
}
// Dentro de handleCreateCardPayment, antes de getById/claim:
if (deps.enabled !== true && ('cartao_salvo_id' in input || input.salvar_cartao === true)) {
  const disabled = cardTokenizationDisabled();
  return failure(disabled.status, disabled.body.error.code, disabled.body.error.message);
}
```

No entrypoint, declarar `const enabled = Deno.env.get('CARD_TOKENIZATION_ENABLED') === 'true'` e passar **o mesmo valor** no objeto da factory HTTP e no retorno de `createDeps`. Preservar ramo digitado sem salvamento; não fazer guarda global em `asaas.ts` ou Pix. Nos testes antigos de salvar/token, acrescentar `enabled: true` às deps de domínio e HTTP.
- [ ] **RED/GREEN do erro público:** acrescentar literal à união e entrada ao `messages` em `payment-errors.ts`. Em `payment.supabase.test.ts`, usar `fakeClient` existente:

```ts
it('preserva código de feature indisponível vindo do HTTP', async () => {
  const { client } = fakeClient({ data: null, error: { context: new Response(
    JSON.stringify({ error: { code: 'CARD_TOKENIZATION_DISABLED' } }), { status: 503 },
  ) } });
  await expect(createPaymentSupabase(client).pagarCartao({
    pedidoId: 'pedido-1', operacaoId: 'op-1', cartaoSalvoId: 'card-1',
  })).rejects.toMatchObject({
    code: 'CARD_TOKENIZATION_DISABLED',
    message: 'Cartões salvos estão temporariamente indisponíveis. Digite os dados do cartão sem salvar ou use Pix.',
  });
});
```

Repetir contrato com `{ data: { error: { code: 'CARD_TOKENIZATION_DISABLED' } }, error: null }`. Manter mensagem local sanitizada; não repassar mensagem arbitrária do gateway. Estender entrypoint tests para ausência/falso/inválido/true e verificar que valor propagado às duas guardas é consistente.
- [ ] **Verificar GREEN:** `pnpm --filter @keepit/supabase test -- supabase/functions/create-card-payment supabase/functions/create-pix-payment` e `pnpm --filter @keepit/core-data test -- src/supabase/payment.supabase.test.ts`. Cobrir metadados presentes na resposta sem persistência quando salvar=false/ausente, idempotência e segurança HTTP.
- [ ] **Commit local futuro:** `git add apps/supabase/supabase/functions/create-card-payment packages/core-data/src/payment-errors.ts packages/core-data/src/supabase/payment.supabase.test.ts && git commit -m "feat: reject saved card payments while tokenization is disabled"`.

### Task 4: Flag pública e hook de cartões sem chamadas quando desligado

**Arquivos:** criar `apps/cliente/src/config/featureFlags.ts` e `featureFlags.test.ts`; modificar `apps/cliente/src/hooks/useSavedCards.ts` e `useSavedCards.test.ts`.

**Interfaces:** exportar constante booleana `CARD_TOKENIZATION_ENABLED`; assinatura/retorno público de `useSavedCards(clienteId)` permanece igual. Sem nova prop, contexto ou storage.

- [ ] **RED — teste da constante no arquivo novo:**

```ts
import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
it.each([undefined, '', 'false', '1', 'TRUE', ' true ', 'true'])('flag pública estrita: %s', async (value) => {
  vi.resetModules();
  vi.stubEnv('EXPO_PUBLIC_CARD_TOKENIZATION_ENABLED', value);
  const { CARD_TOKENIZATION_ENABLED } = await import('./featureFlags');
  expect(CARD_TOKENIZATION_ENABLED).toBe(value === 'true');
});
```

Em `useSavedCards.test.ts`, adicionar mock controlável da constante; `flags` é definido no próprio arquivo e resetado para true após cada teste para preservar os casos antigos:

```ts
const flags = vi.hoisted(() => ({ enabled: true }));
vi.mock('../config/featureFlags', () => ({ get CARD_TOKENIZATION_ENABLED() { return flags.enabled; } }));
it('desligado não consulta nem muta cartões', async () => {
  flags.enabled = false;
  await mount();
  await act(async () => {
    await result.refresh();
    await result.definirPrincipal('card-1');
    await result.remover('card-1');
  });
  expect(result).toMatchObject({ cards: [], loading: false, error: null });
  expect(savedCards.listar).not.toHaveBeenCalled();
  expect(savedCards.definirPrincipal).not.toHaveBeenCalled();
  expect(savedCards.remover).not.toHaveBeenCalled();
});
```

- [ ] **Executar RED:** `pnpm --filter @keepit/cliente test -- src/config/featureFlags.test.ts src/hooks/useSavedCards.test.ts`. Falha esperada: módulo ausente; depois, chamada de listagem.
- [ ] **GREEN — implementar constante e guardas mantendo a ordem de hooks:**

```ts
// config/featureFlags.ts — acesso literal necessário ao bundle Expo.
export const CARD_TOKENIZATION_ENABLED = process.env.EXPO_PUBLIC_CARD_TOKENIZATION_ENABLED === 'true';
```

Importar no hook. No ramo de limpeza de `refresh`, trocar condição por `!CARD_TOKENIZATION_ENABLED || !clienteId`. Em `mutate` retornar antes de gerar operação/enfileirar se desligado. No retorno projetar `cards: []`, `loading: false`, `error: null` quando desligado; quando ligado conservar a lógica atual de identidade. Não retornar antes de declarar hooks e não depender só de passar `clienteId=null` nas telas.
- [ ] **Verificar GREEN:** executar o mesmo comando. Casos de logout, leitura atrasada, fila de mutações e principal continuam passando com flag ligada explicitamente. Não criar serviço/configuração compartilhada entre Deno e Expo.
- [ ] **Commit local futuro:** `git add apps/cliente/src/config/featureFlags.ts apps/cliente/src/config/featureFlags.test.ts apps/cliente/src/hooks/useSavedCards.ts apps/cliente/src/hooks/useSavedCards.test.ts && git commit -m "feat: disable saved card loading by default in client"`.

### Task 5: Pagamento digitado sempre disponível sem salvar

**Arquivos:** modificar `apps/cliente/src/components/checkout/CardPaymentForm.tsx`, `apps/cliente/src/screens/home/cardPaymentForm.test.ts`, `apps/cliente/src/hooks/usePagamentoReal.ts`, `usePagamentoReal.test.ts`.

**Interfaces:** consumir constante da task 4 e erro da task 3. `CardPaymentFormProps`, `PublicCardPaymentInput` e o port de pagamento permanecem iguais.

- [ ] **RED — em `cardPaymentForm.test.ts`, mockar `../../config/featureFlags` com getter de `flags.enabled`, inicialmente true; resetar após cada teste. Usar `fill`, `renderer`, `values` existentes:**

```ts
it('oculta salvar e paga digitado com consentimento falso', async () => {
  flags.enabled = false;
  const submit = vi.fn(async () => {});
  await act(async () => { renderer = create(React.createElement(CardPaymentForm, {
    mode: 'compra', initialHolder: {}, valorValidacaoCentavos: null,
    onSubmit: submit, disabled: false,
  })); });
  expect(renderer!.root.findAllByType('Checkbox' as never)
    .some((node) => node.props.label === 'Salvar este cartão')).toBe(false);
  await fill();
  expect(renderer!.root.findByType('Button' as never).props.disabled).toBe(false);
  await act(async () => { renderer!.root.findByType('Button' as never).props.onPress(); });
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ salvarCartao: false }));
  expect(renderer!.root.findAllByType('TextField' as never).every((node) => node.props.value === '')).toBe(true);
});
```

No teste do hook, mockar `../config/featureFlags` da mesma maneira; `t`, `mount`, `result` já existem:

```ts
it('bloqueia chamada local com cartão salvo antes do port', async () => {
  flags.enabled = false;
  t.read.mockResolvedValue(null);
  await mount();
  await act(async () => { await result.pagarCartao({ type: 'cartao_salvo', cartaoSalvoId: 'card-1' }); });
  expect(t.card).not.toHaveBeenCalled();
  expect(result.actionCode).toBe('CARD_TOKENIZATION_DISABLED');
});
```

O mock atual de `PaymentActionError` é uma classe vazia: dar-lhe `code` e mensagem no teste, ou usar a classe real por import parcial, para não testar uma cópia sem o contrato.
- [ ] **Executar RED:** `pnpm --filter @keepit/cliente test -- src/screens/home/cardPaymentForm.test.ts src/hooks/usePagamentoReal.test.ts`. Falhas esperadas: checkbox visível e port chamado.
- [ ] **GREEN — aplicar condições mínimas no formulário:**

```ts
const [salvarCartao, setSalvarCartao] = useState(CARD_TOKENIZATION_ENABLED && mode === 'compra');
// Acrescentar à condição de valid: (mode === 'compra' || CARD_TOKENIZATION_ENABLED).
// Substituir o consentimento do onSubmit:
void onSubmit({ cartao, titular, salvarCartao: CARD_TOKENIZATION_ENABLED && (mode === 'perfil' || salvarCartao) });
// Renderizar checkbox de salvar somente com CARD_TOKENIZATION_ENABLED && mode === 'compra'.
```

No hook, manter `perform` e trocar somente seu callback em `pagarCartao`:

```ts
pagarCartao: (input: PublicCardPaymentInput) => perform(() => {
  if (input.type === 'cartao_salvo') {
    if (!CARD_TOKENIZATION_ENABLED) throw new PaymentActionError('CARD_TOKENIZATION_DISABLED');
    return getDataClient().payment.pagarCartao({ pedidoId, operacaoId: operationId, cartaoSalvoId: input.cartaoSalvoId });
  }
  return getDataClient().payment.pagarCartao({
    pedidoId, operacaoId: operationId, cartao: input.cartao, titular: input.titular,
    salvarCartao: CARD_TOKENIZATION_ENABLED && input.salvarCartao,
  });
}),
```

- [ ] **RED/GREEN complementares:** hook com entrada digitada `salvarCartao:true` envia falso se flag desligada; modo perfil não submete; modo ligado conserva consentimento existente. Pix ainda chama `t.pix`; atualização/polling não repete cobrança. Erro remoto da task 3 conserva código/mensagem com flag pública ligada.
- [ ] **Verificar GREEN:** repetir o comando da task; manter testes de limpeza em blur/logout/background.
- [ ] **Commit local futuro:** `git add apps/cliente/src/components/checkout/CardPaymentForm.tsx apps/cliente/src/screens/home/cardPaymentForm.test.ts apps/cliente/src/hooks/usePagamentoReal.ts apps/cliente/src/hooks/usePagamentoReal.test.ts && git commit -m "feat: keep typed card payments available without saving"`.

### Task 6: Ocultar entrada de perfil e impedir cadastro por rota antiga

**Arquivos:** modificar `apps/cliente/src/screens/perfil/Perfil.tsx`, `Cartoes.tsx`, `Cartoes.test.ts`, `apps/cliente/src/screens/home/AdicionarCartao.tsx`; criar `apps/cliente/src/screens/perfil/Perfil.cardFlag.test.ts` para a entrada do menu.

**Interfaces:** nomes de rotas e props continuam iguais. Wrapper de `Cartoes` monta conteúdo atual apenas com flag ligada; `AdicionarCartao` já possui wrapper antes dos componentes real/demo. Usar `FormScreen`, `AppHeader` e `Text` existentes.

- [ ] **RED — em `Cartoes.test.ts`, adicionar mock de `../../config/featureFlags` com `flags.enabled` e reset após cada teste. Usar `navigation`, `cardsState`, `renderer` existentes:**

```ts
it('rota antiga de cadastro não consulta nem abre formulário', async () => {
  flags.enabled = false;
  await act(async () => { renderer = create(React.createElement(AdicionarCartao, {
    navigation, route: { params: { operacaoId: 'operation-1' } },
  })); });
  expect(renderer!.root.findAllByType('CardPaymentForm' as never)).toHaveLength(0);
  expect(cardsState.consultarConfiguracao).not.toHaveBeenCalled();
  expect(cardsState.consultarCadastro).not.toHaveBeenCalled();
  expect(cardsState.cadastrar).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer!.toJSON())).toContain('Cartões salvos estão temporariamente indisponíveis');
});
```

Acrescentar montagem de `Cartoes` desligada com cardsState não vazio: não mostrar `1111`/`2222`, principal, remover ou adicionar. Testar o wrapper de cadastro com datasource mock e Supabase. No teste novo de Perfil, montar com mocks dos hooks importados pelo componente e flag falsa/true; procurar os labels dos itens renderizados e acionar o item somente no caso true: `navigation.navigate` recebe `'Cartoes'`. Não verificar presença de strings no código-fonte.
- [ ] **Executar RED:** `pnpm --filter @keepit/cliente test -- src/screens/perfil/Cartoes.test.ts src/screens/perfil/Perfil.cardFlag.test.ts`. Esperar chamadas de configuração e item ainda visível.
- [ ] **GREEN — no array atual de menu de Perfil, substituir o item por spread condicional:**

```ts
...(CARD_TOKENIZATION_ENABLED
  ? [{ label: 'Formas de pagamento', onPress: () => navigation.navigate('Cartoes') }]
  : []),
```

Em `Cartoes.tsx`, renomear implementação atual para `CartoesContent` e manter export default wrapper. Em `AdicionarCartao`, acrescentar o mesmo retorno no início do wrapper, antes da escolha real/demo:

```tsx
if (!CARD_TOKENIZATION_ENABLED) return <FormScreen>
  <AppHeader title="Formas de pagamento" back={{ navigation, fallback: () => navigation.goBack() }} />
  <Text>Cartões salvos estão temporariamente indisponíveis. Digite os dados do cartão sem salvar ou use Pix.</Text>
</FormScreen>;
```

O wrapper `Cartoes` recebe `props: Props`, obtém `const { navigation } = props` e, ligado, retorna `<CartoesContent {...props} />`. Não pôr retorno condicional antes de hooks no mesmo componente que já os executa.
- [ ] **Verificar GREEN:** repetir os testes, cobrindo botão voltar e fluxos antigos ligados. A task 4 já verifica ausência de listagem; aqui verificar que nem o conteúdo de cadastro é montado.
- [ ] **Commit local futuro:** `git add apps/cliente/src/screens/perfil/Perfil.tsx apps/cliente/src/screens/perfil/Cartoes.tsx apps/cliente/src/screens/perfil/Cartoes.test.ts apps/cliente/src/screens/perfil/Perfil.cardFlag.test.ts apps/cliente/src/screens/home/AdicionarCartao.tsx && git commit -m "feat: hide saved card management while disabled"`.

### Task 7: Checkout, retomada e verificação do fluxo completo

**Arquivos:** modificar `apps/cliente/src/screens/home/Pagamento.tsx`, `Checkout.tsx`, `apps/cliente/src/screens/modals/ModalProcessandoPagamento.tsx`, `paymentScreens.test.ts`; criar `apps/cliente/src/screens/home/cardFlagCheckout.test.ts`; modificar `apps/supabase/README.md`. Manter `savedCardCheckout.test.ts` como regressão do helper puro existente.

**Interfaces:** consumir flag pública e `PaymentActionErrorCode` já definidos. Não mudar `RootStackParamList` nem `paymentSubmission`; filtro de IDs ocorre no ponto de consumo da tela.

- [ ] **RED — no `paymentScreens.test.ts`, mock controlável de `../../config/featureFlags`, reset de flag e `state.actionCode/error` após cada teste. Usar `state`, `props`, `renderer` existentes:**

```ts
it('rota antiga abre cartão digitado sem expor lista nem cobrar', async () => {
  flags.enabled = false;
  state.attempt = null;
  state.actionCode = null;
  state.error = null;
  state.cards = [{ id: 'card-1', bandeira: 'visa', ultimo4: '4242', principal: true }];
  await act(async () => { renderer = create(React.createElement(ModalProcessandoPagamento, {
    ...props, route: { params: { pedidoId: 'p', cartaoSalvoId: 'card-1' } },
  })); });
  expect(renderer!.root.findAllByType('CardPaymentForm' as never)).toHaveLength(1);
  expect(JSON.stringify(renderer!.toJSON())).not.toContain('4242');
  expect(state.pay).not.toHaveBeenCalled();
});
```

No novo teste `cardFlagCheckout.test.ts`, usar React act/test-renderer como nos testes de telas existentes e mocks dos hooks de cada tela. Casos comportamentais obrigatórios: (a) flag falsa + lista mock não vazia não exibe linhas/cartão principal; (b) `cart.payment` salvo chama `clearPayment` e submit antes do efeito não cria pedido; (c) novo cartão e Pix continuam selecionáveis; (d) texto não promete salvar; (e) retomada `pendingTarget` conserva pedido/forma, mas omite `cartaoSalvoId`; (f) flag true conserva lista e navegação. Não testar apenas o helper puro de seleção.
- [ ] **Executar RED:** `pnpm --filter @keepit/cliente test -- src/screens/home/cardFlagCheckout.test.ts src/screens/modals/paymentScreens.test.ts`. Esperar cartão antigo visível e formulário novo ausente.
- [ ] **GREEN — aplicar guardas nas três telas.** Em `Pagamento` e `Checkout`, derivar lista visível e usar essa lista em todos os `map`, `find`, `some` e sugestão:

```ts
const visibleCards = CARD_TOKENIZATION_ENABLED ? savedCards.cards : [];
```

Os efeitos existentes limpam seleção salva inválida com a lista vazia. Acrescentar bloqueio síncrono em `handleContinue` para seleção salva quando desligada **e não existir pendingTarget**; mostrar a mensagem da spec e retornar antes de criar pedido. Para `paymentSubmissionRef.current.submit`, passar:

```ts
cartaoSalvoId: CARD_TOKENIZATION_ENABLED
  ? (pendingTarget?.cartaoSalvoId ?? selectedSavedCardId)
  : undefined,
```

O controller conserva `pendingTarget` internamente e pode devolver um ID antigo mesmo quando o input já está filtrado. Por isso, filtrar também ao navegar após `result.status === 'ready'`, preservando `pedidoId` e o destino Pix/cartão:

```ts
rootNavigation.navigate('ModalProcessandoPagamento', {
  pedidoId: result.target.pedidoId,
  ...(CARD_TOKENIZATION_ENABLED && result.target.cartaoSalvoId
    ? { cartaoSalvoId: result.target.cartaoSalvoId }
    : {}),
});
```

Preservar retomada/cleanup de pedido existente; não criar novo pedido para contornar bloqueio. Condicionar link demo a `CARD_TOKENIZATION_ENABLED && !real`. Subtitle do novo cartão varia entre o texto atual (ligada) e `Informe os dados somente na revisão final.` (desligada).

No modal, inicializar choice com `CARD_TOKENIZATION_ENABLED && cartaoSalvoId`; derivar `selectedCard` e lista de alternativas somente de `visibleCards`. Para divergência pública=true/backend=false, incluir `payment.actionCode === 'CARD_TOKENIZATION_DISABLED'` em `canChangeMethod`. A opção “Usar novo cartão” deve limpar erro antes da nova tentativa:

```tsx
<Pressable onPress={() => { setChoice({ type: 'novo' }); payment.refresh(); }}>
  <Text>Usar novo cartão</Text>
</Pressable>
```

Nesse caso o usuário deve desmarcar salvar (flag pública ainda ligada), conforme mensagem do servidor. Manter botão Pix e erro visível até a escolha/atualização. Não habilitar pagamento durante tentativa pendente/reconciliação nem substituir `canSubmitCard`.
- [ ] **RED/GREEN complementares:** mesma rota antiga com tentativa pendente continua sem formulário/cobrança; erro remoto 503 permite novo cartão/Pix sem perder pedido; flags true preservam pagamento salvo; Pix continua mostrando QR/copiar e não chama simulação. Manter regressões de `paymentSubmission.test.ts` e `savedCardCheckout.test.ts`.
- [ ] **Documentar no README**, sem editar ambientes reais: tabela com nomes das flags, default `false`, leitura estrita, flag pública no bundle, comportamento quando divergentes e código de erro. Explicar que futura habilitação depende de liberação Asaas e coordenação das duas configurações; desligar backend bloqueia novas operações mesmo em apps antigos. Registrar que validações pendentes ficam pausadas, sem bloquear confirmação financeira existente. Não incluir comandos de deploy/produção ou valores de credenciais.
- [ ] **Verificar GREEN focado:** repetir comando da task e `pnpm --filter @keepit/cliente test -- src/lib/paymentSubmission.test.ts src/screens/home/savedCardCheckout.test.ts`.
- [ ] **Verificar integração local uma vez:**

```bash
pnpm --filter @keepit/supabase test
pnpm --filter @keepit/core-data test
pnpm --filter @keepit/cliente test
pnpm --filter @keepit/supabase typecheck
pnpm --filter @keepit/core-data typecheck
pnpm --filter @keepit/cliente typecheck
git diff --check
```

Esperado: suites e types passando. Se houver falha prévia, registrar separadamente com evidência; não atribuir sucesso à feature nem ampliar escopo por conta própria. Não rodar testes de banco remoto ou pagamentos reais. As suites existentes de webhook/reconciliação financeira devem continuar passando sem receber a nova guarda.
- [ ] **Commit local futuro:** `git add apps/cliente/src/screens/home/Pagamento.tsx apps/cliente/src/screens/home/Checkout.tsx apps/cliente/src/screens/home/cardFlagCheckout.test.ts apps/cliente/src/screens/modals/ModalProcessandoPagamento.tsx apps/cliente/src/screens/modals/paymentScreens.test.ts apps/supabase/README.md && git commit -m "feat: guard saved card checkout and recovery paths"`.

## Autorrevisão e rastreabilidade

| Requisito da spec | Tasks / evidência futura |
| --- | --- |
| Investigar/reusar padrão; default desligado/estrito | 1–4, entrypoints e flag pública |
| Cadastro/configuração e reconciliação bloqueados sem efeitos | 1–2, spies de factory e limites HTTP |
| Token e salvar=true rejeitados antes da cobrança | 3, HTTP + domínio + ausência de claim |
| Cartão digitado falso/ausente e Pix normais | 3, 5, 7, gateway simulado e regressões existentes |
| Nenhuma lista, checkbox ou cadastro exposto | 4–7, testes de hook, componentes e telas |
| Rotas/seleções antigas e divergência de flags | 3, 5–7, erro tipado, guardas síncronas e retomada |
| Ligado preserva comportamento; fatos financeiros preservados | Testes antigos explicitamente ligados; suite completa na task 7 |

Revisão documental: nenhuma decisão pendente; sem expansão para banco, infraestrutura ou deploy. A execução deste plano fica para nova solicitação. A entrega atual termina no commit local dos dois documentos e não inicia a Task 1.
