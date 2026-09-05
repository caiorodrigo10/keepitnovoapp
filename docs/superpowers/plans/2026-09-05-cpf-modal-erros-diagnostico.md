# CPF Modal Errors and Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o modal de CPF seguro contra validação silenciosa, falha de persistência e submit concorrente, mantendo o layout com teclado e adicionando medição de performance somente em builds QA.

**Architecture:** A máscara continua pura em `cpf.ts`; um controller sem React valida, serializa a única chamada em voo e devolve resultados discriminados sem executar efeitos de sucesso. `ModalCPF` usa o `FormSheet` existente, aplica efeitos apenas após `success` e conecta um coletor QA pequeno para medir `onChangeText` e contagem de renders sem alterar o caminho de produção.

**Tech Stack:** Expo 57, React 19, React Native 0.86, TypeScript 5.9, Vitest 1.2, `@keepit/core-data`, `FormSheet` e `@keepit/ui-tokens`.

**Spec:** `docs/superpowers/specs/2026-09-04-estabilizacao-beta-android-cliente-design.md` (§§ 2, 8, 9, 21, 22 e 23) e `docs/stories/12.6.story.md`

## Global Constraints

- Não adicionar dependência, renderer React Native, biblioteca de máscara, profiler ou bottom sheet.
- Reutilizar `FormSheet`; não criar outro `Modal`, portal ou wrapper de teclado.
- Preservar máscara `000.000.000-00`, limite de 11 dígitos e algoritmo atual de dois dígitos verificadores.
- CPF inválido usa mensagem local; ausência de cliente ou rejeição de `auth.updateCpf` usa mensagem de persistência distinta.
- `markCpfCollected`, `route.params?.onSubmit` e `navigation.goBack` só executam após `updateCpf` resolvida com sucesso.
- Uma segunda chamada enquanto há submit em voo retorna `busy` e não dispara outra persistência nem efeitos de sucesso.
- Instrumentação fica inativa quando `QA_BUILD_ENABLED === false` e nunca aparece na UI.
- Não aplicar memoização, debounce ou outra otimização nesta story sem comparação antes/depois no APK release.
- Gboard, telas pequena/grande, gestos/três botões, campo/CTA visíveis e coleta dos logs de performance pertencem ao smoke Android consolidado no encerramento do Épico 12, não a uma tarefa manual desta story.
- O gate local desta story é composto apenas por testes Vitest direcionados e typecheck do pacote Cliente.

---

### Task 1: Máscara canônica e controller single-flight

**Files:**
- Modify: `apps/cliente/src/lib/cpf.ts`
- Modify: `apps/cliente/src/lib/cpf.test.ts`
- Create: `apps/cliente/src/lib/cpfSubmission.ts`
- Create: `apps/cliente/src/lib/cpfSubmission.test.ts`

**Interfaces:**
- Produces: `maskCpf(value: string): string` em `cpf.ts`.
- Produces: `CpfSubmitResult = { status: 'success'; digits: string } | { status: 'invalid' } | { status: 'save-failed' } | { status: 'busy' }`.
- Produces: `createCpfSubmissionController(): { isPending(): boolean; submit(input: CpfSubmitInput): Promise<CpfSubmitResult> }`.
- Consumes: `CpfSubmitInput = { cpf: string; clienteId?: string; updateCpf(clienteId: string, digits: string): Promise<void> }`.

- [ ] **Step 1: Escrever o RED da máscara, erros e concorrência**

Adicionar a `cpf.test.ts`:

```ts
it('aplica a máscara e limita a entrada a 11 dígitos', () => {
  expect(maskCpf('11144477735')).toBe('111.444.777-35');
  expect(maskCpf('111.444.777-35123')).toBe('111.444.777-35');
});
```

Criar `cpfSubmission.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createCpfSubmissionController } from './cpfSubmission';

describe('cpfSubmission', () => {
  it('distingue CPF inválido sem persistir', async () => {
    const updateCpf = vi.fn();
    const controller = createCpfSubmissionController();
    await expect(controller.submit({ cpf: '111.444.777-36', clienteId: 'c1', updateCpf })).resolves.toEqual({ status: 'invalid' });
    expect(updateCpf).not.toHaveBeenCalled();
  });

  it('converte ausência de cliente ou rejeição em save-failed', async () => {
    const controller = createCpfSubmissionController();
    await expect(controller.submit({ cpf: '111.444.777-35', updateCpf: vi.fn() })).resolves.toEqual({ status: 'save-failed' });
    await expect(controller.submit({ cpf: '111.444.777-35', clienteId: 'c1', updateCpf: vi.fn().mockRejectedValue(new Error('offline')) })).resolves.toEqual({ status: 'save-failed' });
  });

  it('aceita somente uma persistência por vez', async () => {
    let release!: () => void;
    const updateCpf = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const controller = createCpfSubmissionController();
    const first = controller.submit({ cpf: '111.444.777-35', clienteId: 'c1', updateCpf });
    await expect(controller.submit({ cpf: '111.444.777-35', clienteId: 'c1', updateCpf })).resolves.toEqual({ status: 'busy' });
    release();
    await expect(first).resolves.toEqual({ status: 'success', digits: '11144477735' });
    expect(updateCpf).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Executar os testes e confirmar a falha esperada**

Run: `pnpm --filter @keepit/cliente test -- src/lib/cpf.test.ts src/lib/cpfSubmission.test.ts`

Expected: FAIL porque `maskCpf` não é exportada e `cpfSubmission` ainda não existe.

- [ ] **Step 3: Centralizar a máscara e implementar o controller mínimo**

Mover a máscara hoje privada em `ModalCPF.tsx` para `cpf.ts` como export. Criar `cpfSubmission.ts`:

```ts
import { apenasDigitosCpf, isCpfValido } from './cpf';

export interface CpfSubmitInput {
  cpf: string;
  clienteId?: string;
  updateCpf(clienteId: string, digits: string): Promise<void>;
}

export type CpfSubmitResult =
  | { status: 'success'; digits: string }
  | { status: 'invalid' }
  | { status: 'save-failed' }
  | { status: 'busy' };

export function createCpfSubmissionController() {
  let pending = false;
  return {
    isPending: () => pending,
    async submit({ cpf, clienteId, updateCpf }: CpfSubmitInput): Promise<CpfSubmitResult> {
      if (pending) return { status: 'busy' };
      const digits = apenasDigitosCpf(cpf);
      if (!isCpfValido(digits)) return { status: 'invalid' };
      if (!clienteId) return { status: 'save-failed' };
      pending = true;
      try {
        await updateCpf(clienteId, digits);
        return { status: 'success', digits };
      } catch {
        return { status: 'save-failed' };
      } finally {
        pending = false;
      }
    },
  };
}
```

- [ ] **Step 4: Validar GREEN e commit**

Run: `pnpm --filter @keepit/cliente test -- src/lib/cpf.test.ts src/lib/cpfSubmission.test.ts`

Expected: PASS para máscara, dígitos verificadores, falha e single-flight.

```bash
git add apps/cliente/src/lib/cpf.ts apps/cliente/src/lib/cpf.test.ts apps/cliente/src/lib/cpfSubmission.ts apps/cliente/src/lib/cpfSubmission.test.ts
git commit -m "fix(cliente): make cpf submission single flight"
```

### Task 2: Estados explícitos no `ModalCPF`

**Files:**
- Modify: `apps/cliente/src/screens/modals/ModalCPF.tsx`
- Test: `apps/cliente/src/lib/cpfSubmission.test.ts`

**Interfaces:**
- Consumes: `FormSheet`, `maskCpf`, `createCpfSubmissionController` e `CpfSubmitResult` da Task 1.
- Maintains: `route.params?.onSubmit()` continua executando antes de `navigation.goBack()`, mas somente após persistência confirmada.

- [ ] **Step 1: Instanciar um controller estável e mensagens distintas**

Adicionar ao módulo/componente:

```tsx
const CPF_INVALIDO = 'Digite um CPF válido.';
const CPF_NAO_SALVO = 'Não foi possível salvar seu CPF. Tente novamente.';

const controllerRef = useRef(createCpfSubmissionController());
const [erro, setErro] = useState<string | undefined>();
```

Remover a função `maskCpf` local e importá-la de `../../lib/cpf`.

- [ ] **Step 2: Aplicar efeitos de sucesso somente ao resultado `success`**

Substituir `handleConfirmar` por:

```tsx
const handleConfirmar = async () => {
  const controller = controllerRef.current;
  if (controller.isPending()) return;
  setErro(undefined);
  setSalvando(true);
  const result = await controller.submit({
    cpf,
    clienteId: cliente?.id,
    updateCpf: (clienteId, digits) => getDataClient().auth.updateCpf(clienteId, digits),
  });
  setSalvando(false);

  if (result.status === 'invalid') {
    setErro(CPF_INVALIDO);
    return;
  }
  if (result.status === 'save-failed') {
    setErro(CPF_NAO_SALVO);
    return;
  }
  if (result.status === 'busy') return;

  cart.markCpfCollected();
  route.params?.onSubmit?.();
  navigation.goBack();
};
```

- [ ] **Step 3: Exibir validação local e bloquear edição/submit durante a operação**

Calcular o erro do campo e conectar ao `TextField` existente:

```tsx
const invalidCpfError = digits.length === 11 && !isCpfValido(digits) ? CPF_INVALIDO : undefined;
const fieldError = erro ?? invalidCpfError;

<TextField
  label="CPF"
  value={cpf}
  onChangeText={(value) => {
    setErro(undefined);
    setCpf(maskCpf(value));
  }}
  placeholder="000.000.000-00"
  keyboardType="number-pad"
  editable={!salvando}
  error={fieldError}
/>
```

Manter `disabled={!isCpfValido(digits) || salvando}` e o título `Confirmando...` no `Button`. O título, explicação, campo/erro e CTA continuam dentro do `FormSheet` já ajustado a teclado e safe area.

- [ ] **Step 4: Executar teste direcionado, typecheck e commit**

Run: `pnpm --filter @keepit/cliente test -- src/lib/cpf.test.ts src/lib/cpfSubmission.test.ts`

Expected: PASS.

Run: `pnpm --filter @keepit/cliente typecheck`

Expected: PASS sem erro.

```bash
git add apps/cliente/src/screens/modals/ModalCPF.tsx
git commit -m "fix(cliente): expose cpf save errors"
```

### Task 3: Diagnóstico QA sem otimização especulativa

**Files:**
- Create: `apps/cliente/src/lib/cpfDiagnostics.ts`
- Create: `apps/cliente/src/lib/cpfDiagnostics.test.ts`
- Modify: `apps/cliente/src/screens/modals/ModalCPF.tsx`

**Interfaces:**
- Produces: `CpfDiagnosticEvent = { event: 'render'; count: number; inputLength: number } | { event: 'onChangeText'; inputLength: number; durationMs: number }`.
- Produces: `createCpfDiagnostics(enabled: boolean, sink: (event: CpfDiagnosticEvent) => void, now?: () => number)` com `recordRender(inputLength)` e `measureOnChangeText(value, transform)`.
- Consumes: `QA_BUILD_ENABLED` de `src/config/buildInfo.ts`.

- [ ] **Step 1: Escrever o RED do gate e das duas métricas**

Criar `cpfDiagnostics.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createCpfDiagnostics } from './cpfDiagnostics';

describe('cpfDiagnostics', () => {
  it('não mede nem publica fora de QA', () => {
    const sink = vi.fn();
    const diagnostics = createCpfDiagnostics(false, sink, () => 10);
    diagnostics.recordRender(3);
    expect(diagnostics.measureOnChangeText('123', (value) => value)).toBe('123');
    expect(sink).not.toHaveBeenCalled();
  });

  it('publica contagem de render e duração do onChangeText em QA', () => {
    const sink = vi.fn();
    const times = [10, 12];
    const diagnostics = createCpfDiagnostics(true, sink, () => times.shift() ?? 12);
    diagnostics.recordRender(0);
    expect(diagnostics.measureOnChangeText('11144477735', (value) => value)).toBe('11144477735');
    expect(sink).toHaveBeenNthCalledWith(1, { event: 'render', count: 1, inputLength: 0 });
    expect(sink).toHaveBeenNthCalledWith(2, { event: 'onChangeText', inputLength: 11, durationMs: 2 });
  });
});
```

- [ ] **Step 2: Implementar o coletor mínimo**

Criar `cpfDiagnostics.ts`:

```ts
export type CpfDiagnosticEvent =
  | { event: 'render'; count: number; inputLength: number }
  | { event: 'onChangeText'; inputLength: number; durationMs: number };

export function createCpfDiagnostics(
  enabled: boolean,
  sink: (event: CpfDiagnosticEvent) => void,
  now: () => number = () => performance.now(),
) {
  let renderCount = 0;
  return {
    recordRender(inputLength: number) {
      if (enabled) sink({ event: 'render', count: ++renderCount, inputLength });
    },
    measureOnChangeText(value: string, transform: (value: string) => string): string {
      if (!enabled) return transform(value);
      const startedAt = now();
      const result = transform(value);
      sink({ event: 'onChangeText', inputLength: value.length, durationMs: now() - startedAt });
      return result;
    },
  };
}
```

- [ ] **Step 3: Ligar os logs somente ao build QA**

Em `ModalCPF`, criar uma única instância e contar renders após commit:

```tsx
const diagnosticsRef = useRef(
  createCpfDiagnostics(QA_BUILD_ENABLED, (event) => console.info('[cpf-performance]', JSON.stringify(event))),
);
useEffect(() => diagnosticsRef.current.recordRender(cpf.length));
```

No `onChangeText`, substituir a chamada direta da máscara por:

```tsx
setCpf(diagnosticsRef.current.measureOnChangeText(value, maskCpf));
```

Não incluir debounce, `memo`, cache ou alteração de algoritmo. O smoke final do épico captura `[cpf-performance]` no APK QA release e registra a comparação antes/depois caso uma correção posterior seja justificada.

- [ ] **Step 4: Executar gates e commit**

Run: `pnpm --filter @keepit/cliente test -- src/lib/cpf.test.ts src/lib/cpfSubmission.test.ts src/lib/cpfDiagnostics.test.ts`

Expected: PASS.

Run: `pnpm --filter @keepit/cliente typecheck`

Expected: PASS sem erro.

```bash
git add apps/cliente/src/lib/cpfDiagnostics.ts apps/cliente/src/lib/cpfDiagnostics.test.ts apps/cliente/src/screens/modals/ModalCPF.tsx
git commit -m "chore(cliente): add qa cpf diagnostics"
```
