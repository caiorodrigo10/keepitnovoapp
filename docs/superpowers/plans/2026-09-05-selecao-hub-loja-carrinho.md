# Hub/Store Selection and Controlled Cart Clearing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar hub ou loja de forma explícita e persistida, limpando um carrinho preenchido somente depois da confirmação do cliente.

**Architecture:** Regras puras produzem um plano de mutação sem tocar no estado atual; um executor pequeno persiste o próximo snapshot antes de publicá-lo no `CartContext`. Seleção de hub e adição de item consomem o mesmo resultado discriminado para pedir confirmação, bloquear hub indisponível, navegar após sucesso ou exibir falha.

**Tech Stack:** React 19, React Native 0.86, TypeScript 5.9, Vitest 1.2, AsyncStorage 2.2 e React Navigation 7 já instalados.

**Spec:** `docs/superpowers/specs/2026-09-04-estabilizacao-beta-android-cliente-design.md` (§§ 2, 5, 13, 21–23) e `docs/stories/12.9.story.md`

## Global Constraints

- Tocar em hub disponível inicia a gravação imediatamente e volta somente após sucesso; remover o botão “Confirmar ponto”.
- Trocar hub ou adicionar item de outra loja com `items.length > 0` retorna `confirmation_required`; nenhum item, hub, loja ou pagamento muda antes da confirmação.
- Confirmar uma troca limpa itens e pagamento, persiste a nova seleção e só então publica o snapshot; cancelar preserva o objeto anterior integralmente.
- Carrinho vazio troca sem diálogo; adicionar na mesma loja acumula quantidade sem diálogo; um snapshot nunca contém itens de duas lojas.
- Hub com `ativo === false` é bloqueado mesmo se chegar por cache, rota antiga ou fixture de teste.
- Falha de `AsyncStorage.setItem` retorna erro observável e mantém o estado anterior em memória e no fluxo de navegação; não exibir sucesso.
- `estabelecimentoId`, `items`, `hubId` e `payment` continuam na chave existente `@keepit/cliente:carrinho`; não criar segunda fonte de carrinho.
- O campo `selectedHubId` reservado no snapshot mock da Story 12.1 não vira fonte concorrente; seleção de compra continua no snapshot atômico do carrinho em ambos os datasources.
- Não adicionar reducer/library de estado, renderer React Native ou outra dependência; os testes automatizam regras, atomicidade e storage em ambiente Node.
- Preservar layout, rotas e componentes atuais; o comportamento visual, reinício real e diálogos no APK Android QA release serão verificados somente no smoke consolidado da Story 12.14.

---

### Task 1: Planos puros para troca de hub e loja

**Files:**
- Modify: `apps/cliente/src/lib/cartRules.ts`
- Modify: `apps/cliente/src/lib/cartRules.test.ts`

**Interfaces:**
- Produces: `CartOrderState = Pick<PersistedCartState, 'estabelecimentoId' | 'items' | 'hubId' | 'payment'>` e `AddItemInput`, ambos exportados de `cartRules.ts` para o contexto.
- Produces: `CartTransition = { kind: 'ready'; next: CartOrderState } | { kind: 'unchanged' } | { kind: 'confirmation_required'; reason: 'hub_switch' | 'store_switch' } | { kind: 'blocked'; reason: 'hub_unavailable' }`.
- Produces: `planHubSelection(current, hub, confirmed)` e `planItemAddition(current, input, confirmed)`.

- [ ] **Step 1: Escrever o RED da matriz de decisão**

Adicionar casos com snapshots completos e sem mocks de React:

```ts
const filled: CartOrderState = {
  estabelecimentoId: 'loja-a',
  hubId: 'hub-a',
  payment: { type: 'pix' },
  items: [{ produtoId: 'p-a', nome: 'Item A', precoSnapshotReais: 10, quantidade: 1 }],
};

it('não produz próximo estado antes de confirmar troca de hub', () => {
  expect(planHubSelection(filled, { id: 'hub-b', ativo: true }, false)).toEqual({
    kind: 'confirmation_required', reason: 'hub_switch',
  });
  expect(filled).toMatchObject({ hubId: 'hub-a', estabelecimentoId: 'loja-a', items: [{ produtoId: 'p-a' }] });
});

it('confirma a troca de hub limpando carrinho/loja/pagamento no mesmo snapshot', () => {
  expect(planHubSelection(filled, { id: 'hub-b', ativo: true }, true)).toEqual({
    kind: 'ready',
    next: { hubId: 'hub-b', estabelecimentoId: null, items: [], payment: null },
  });
});

it('bloqueia hub inativo e troca hub com carrinho vazio sem confirmação', () => {
  expect(planHubSelection(filled, { id: 'hub-off', ativo: false }, true)).toEqual({
    kind: 'blocked', reason: 'hub_unavailable',
  });
  expect(planHubSelection({ ...filled, items: [], estabelecimentoId: null }, { id: 'hub-b', ativo: true }, false))
    .toMatchObject({ kind: 'ready', next: { hubId: 'hub-b' } });
});
```

Adicionar no mesmo arquivo:

```ts
expect(planHubSelection(filled, { id: 'hub-a', ativo: true }, false)).toEqual({ kind: 'unchanged' });

const itemB: AddItemInput = {
  estabelecimentoId: 'loja-b', produtoId: 'p-b', nome: 'Item B', precoReais: 20, quantidade: 2,
};
expect(planItemAddition(filled, itemB, false)).toEqual({
  kind: 'confirmation_required', reason: 'store_switch',
});
expect(planItemAddition(filled, itemB, true)).toEqual({
  kind: 'ready',
  next: {
    estabelecimentoId: 'loja-b', hubId: 'hub-a', payment: null,
    items: [{ produtoId: 'p-b', nome: 'Item B', precoSnapshotReais: 20, quantidade: 2 }],
  },
});

const sameStore = planItemAddition(filled, { ...itemB, estabelecimentoId: 'loja-a', produtoId: 'p-a' }, false);
expect(sameStore).toMatchObject({ kind: 'ready', next: { items: [{ produtoId: 'p-a', quantidade: 3 }] } });
expect(filled.items).toEqual([{ produtoId: 'p-a', nome: 'Item A', precoSnapshotReais: 10, quantidade: 1 }]);
```

Cancelamento é a ausência da segunda chamada: o primeiro resultado não contém `next`, como provado pelas expectativas de `confirmation_required`.

- [ ] **Step 2: Executar o teste e confirmar o RED**

Run: `pnpm --filter @keepit/cliente test -- src/lib/cartRules.test.ts`

Expected: FAIL porque os tipos e planners ainda não existem.

- [ ] **Step 3: Implementar funções imutáveis e uma única regra de loja**

Reusar `shouldConfirmStoreSwitch` dentro de `planItemAddition`. Clonar arrays/itens no ramo `ready`; nunca mutar `current`. A troca confirmada de loja deve construir a base vazia antes de inserir o novo item, enquanto a mesma loja procura `produtoId` e soma `quantidade`.

```ts
export function planHubSelection(
  current: CartOrderState,
  hub: Pick<Hub, 'id' | 'ativo'>,
  confirmed: boolean,
): CartTransition;

export function planItemAddition(
  current: CartOrderState,
  input: AddItemInput,
  confirmed: boolean,
): CartTransition;
```

- [ ] **Step 4: Validar GREEN e commit**

Run: `pnpm --filter @keepit/cliente test -- src/lib/cartRules.test.ts`

Expected: PASS para carrinho vazio/cheio, confirmar, mesma loja, hub indisponível e imutabilidade.

```bash
git add apps/cliente/src/lib/cartRules.ts apps/cliente/src/lib/cartRules.test.ts
git commit -m "feat(cliente): plan safe cart selection changes"
```

### Task 2: Commit persistido antes da publicação no contexto

**Files:**
- Modify: `apps/cliente/src/lib/cartStorage.ts`
- Modify: `apps/cliente/src/lib/cartStorage.test.ts`
- Create: `apps/cliente/src/lib/cartTransaction.ts`
- Create: `apps/cliente/src/lib/cartTransaction.test.ts`
- Modify: `apps/cliente/src/context/CartContext.tsx`
- Modify: `apps/cliente/src/screens/home/DetalheProduto.tsx`

**Interfaces:**
- Consumes: `CartTransition` e `CartOrderState` da Task 1.
- Produces: `CartStorageWriteResult = { status: 'saved' } | { status: 'failed' }` de `saveCartState(state)`.
- Produces: `executeCartTransition(current, transition, persist): Promise<CartMutationResult>` onde `CartMutationResult = { status: 'confirmation_required'; reason } | { status: 'blocked'; reason } | { status: 'unchanged'; state } | { status: 'committed'; state } | { status: 'persistence_error'; state }`.
- Produces: `CartContext.selectHub(hub, confirmed?)` e `CartContext.addItem(input, confirmed?)`, ambas assíncronas e sem `Alert` interno.

- [ ] **Step 1: Escrever RED de escrita honesta e atomicidade**

Em `cartStorage.test.ts`, trocar a expectativa de erro silencioso:

```ts
mockedStorage.setItem.mockResolvedValue(undefined);
await expect(saveCartState(SAMPLE_STATE)).resolves.toEqual({ status: 'saved' });

mockedStorage.setItem.mockRejectedValue(new Error('storage indisponível'));
await expect(saveCartState(SAMPLE_STATE)).resolves.toEqual({ status: 'failed' });
```

Em `cartTransaction.test.ts`:

```ts
const filled: CartOrderState = {
  estabelecimentoId: 'loja-a', hubId: 'hub-a', payment: { type: 'pix' },
  items: [{ produtoId: 'p-a', nome: 'Item A', precoSnapshotReais: 10, quantidade: 1 }],
};

it('só devolve o próximo estado depois da persistência', async () => {
  const persist = vi.fn().mockResolvedValue({ status: 'saved' });
  const next = { ...filled, hubId: 'hub-b', estabelecimentoId: null, items: [], payment: null };
  await expect(executeCartTransition(filled, { kind: 'ready', next }, persist)).resolves.toEqual({
    status: 'committed', state: next,
  });
  expect(persist).toHaveBeenCalledWith(next);
});

it('falha de persistência devolve exatamente o snapshot anterior', async () => {
  const persist = vi.fn().mockResolvedValue({ status: 'failed' });
  const next = { ...filled, hubId: 'hub-b', estabelecimentoId: null, items: [], payment: null };
  await expect(executeCartTransition(filled, { kind: 'ready', next }, persist)).resolves.toEqual({
    status: 'persistence_error', state: filled,
  });
});
```

Em `cartStorage.test.ts`, comprovar o round-trip sem outra fonte:

```ts
let persisted: string | null = null;
mockedStorage.setItem.mockImplementation(async (_key, value) => { persisted = value; });
mockedStorage.getItem.mockImplementation(async () => persisted);
const switched = {
  estabelecimentoId: 'loja-b', hubId: 'hub-a', payment: null,
  items: [{ produtoId: 'p-b', nome: 'Item B', precoSnapshotReais: 20, quantidade: 1 }],
};
await expect(saveCartState(switched)).resolves.toEqual({ status: 'saved' });
await expect(loadCartState()).resolves.toEqual(switched);
```

- [ ] **Step 2: Executar testes e confirmar o RED**

Run: `pnpm --filter @keepit/cliente test -- src/lib/cartStorage.test.ts src/lib/cartTransaction.test.ts`

Expected: FAIL no novo retorno de storage e no módulo ausente.

- [ ] **Step 3: Agregar o estado persistido e executar todas as mutações pela mesma barreira**

`CartProvider` mantém um único `CartOrderState` e um `stateRef` atualizado. Remover o efeito de gravação posterior à renderização. Hidratação continua antes de liberar mutações; `selectHub`/`addItem` chamam os planners e `executeCartTransition`, publicando `result.state` somente em `committed`. Incrementar, decrementar, remover, escolher pagamento e `clearOrder` constroem `ready` e passam pela mesma função para não reintroduzir escrita fora de ordem.

```ts
const queueRef = useRef(Promise.resolve());

const applyTransition = useCallback(
  (plan: (current: CartOrderState) => CartTransition): Promise<CartMutationResult> => {
    const operation = queueRef.current.then(async () => {
      const current = stateRef.current;
      const result = await executeCartTransition(current, plan(current), saveCartState);
      if (result.status === 'committed') {
        stateRef.current = result.state;
        setOrderState(result.state);
      }
      return result;
    });
    queueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  },
  [],
);

const selectHub = (hub: Pick<Hub, 'id' | 'ativo'>, confirmed = false) =>
  applyTransition((current) => planHubSelection(current, hub, confirmed));
```

Serializar commits numa fila privada do provider para que toques rápidos leiam o último snapshot confirmado. `onCommitted` deixa de pertencer ao contexto; a tela navega ao receber `status: 'committed'`. Campos de perfil (`cpfCollected`, `cards`, `nfSolicitada`) permanecem com o comportamento atual.

No mesmo ciclo, adaptar `DetalheProduto` à Promise final: chamar `cart.addItem(input)`, exibir o diálogo compartilhado quando o resultado for `confirmation_required`, repetir com `confirmed: true` e navegar somente em `committed`. Cancelar não faz segunda chamada; `persistence_error` mostra o erro explícito. Isso mantém o pacote compilável ao final da task.

- [ ] **Step 4: Validar testes, typecheck e commit**

Run: `pnpm --filter @keepit/cliente test -- src/lib/cartRules.test.ts src/lib/cartStorage.test.ts src/lib/cartTransaction.test.ts`

Expected: PASS, inclusive preservação em falha e round-trip persistido.

Run: `pnpm --filter @keepit/cliente typecheck`

Expected: PASS com `DetalheProduto` consumindo a API assíncrona e os demais call sites compatíveis com retorno ignorado.

```bash
git add apps/cliente/src/lib/cartStorage.ts apps/cliente/src/lib/cartStorage.test.ts apps/cliente/src/lib/cartTransaction.ts apps/cliente/src/lib/cartTransaction.test.ts apps/cliente/src/context/CartContext.tsx apps/cliente/src/screens/home/DetalheProduto.tsx
git commit -m "feat(cliente): persist cart transitions atomically"
```

### Task 3: Seleção imediata de hub e reflexo nas telas

**Files:**
- Modify: `apps/cliente/src/screens/home/EscolhaRetirada.tsx`
- Modify: `apps/cliente/src/screens/home/Home.tsx`
- Modify: `apps/cliente/src/screens/home/Checkout.tsx`

**Interfaces:**
- Consumes: `CartMutationResult` e `selectHub` da Task 2; `DetalheProduto` já usa o mesmo protocolo para loja.
- Produces: navegação de hub somente após `committed`, diálogo idêntico ao de loja e erro explícito em `persistence_error`.

- [ ] **Step 1: Trocar seleção local/botão por commit no toque**

Remover `selecionado`, `handleConfirmar` e o botão “Confirmar ponto”. Cada `SelectableRow` chama `cart.selectHub(hub)`. Para `confirmation_required`, abrir:

```ts
Alert.alert('Limpar carrinho?', 'Ao trocar de hub ou loja, os itens atuais serão removidos.', [
  { text: 'Cancelar', style: 'cancel' },
  { text: 'Continuar', style: 'destructive', onPress: () => void selectHub(hub, true) },
]);
```

`selectHub(hub, true)` e o primeiro toque sem confirmação executam o mesmo helper local: `committed`/`unchanged` chama `navigation.goBack()`, `persistence_error` mostra “Não foi possível salvar sua seleção. Tente novamente.” e `blocked` mostra “Este hub não está disponível para novos pedidos.”. Desabilitar a linha quando `!hub.ativo` como defesa visual adicional.

- [ ] **Step 2: Expor a seleção única nas superfícies atuais**

Home mantém `cart.hubId` como fonte e mostra a ação textual “Alterar” ao lado do hub selecionado; busca já usa `cart.hubId`; Carrinho/Checkout continuam lendo o mesmo snapshot. Remover o fallback que grava `DEFAULT_HUB_ID` no mount do Checkout: sem seleção, mostrar “Selecionar hub” e bloquear pagamento até o cliente escolher um hub real.

- [ ] **Step 3: Executar o gate automatizado final**

Run: `pnpm --filter @keepit/cliente test -- src/lib/cartRules.test.ts src/lib/cartStorage.test.ts src/lib/cartTransaction.test.ts`

Expected: PASS para vazio/cheio, confirmar/cancelar, mesma/outra loja, falha e reabertura.

Run: `pnpm --filter @keepit/cliente typecheck`

Expected: PASS para todos os consumidores da API assíncrona.

Não gerar APK nem criar evidência manual nesta story. O único APK Android QA release da Story 12.14 validará diálogo, retorno imediato, reflexo Home/busca/Carrinho/Checkout e persistência após reinício.

- [ ] **Step 4: Commit**

```bash
git add apps/cliente/src/screens/home/EscolhaRetirada.tsx apps/cliente/src/screens/home/Home.tsx apps/cliente/src/screens/home/Checkout.tsx
git commit -m "feat(cliente): confirm hub and store switches"
```
