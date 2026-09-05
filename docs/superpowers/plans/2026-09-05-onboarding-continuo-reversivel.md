# Continuous and Reversible Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar as três rotas atuais de onboarding em uma única superfície paginada, reversível por swipe/botão/Android Back e concluída somente pelos três CTAs explícitos.

**Architecture:** `Onboarding1` permanece como a rota inicial compatível e passa a hospedar um `OnboardingPager`; fundo, marca e ilustração ficam fora da lista horizontal e permanecem montados. Um módulo puro decide índice, retorno e destinos de conclusão, permitindo testes Vitest sem adicionar renderer React Native.

**Tech Stack:** Expo 57, React 19, React Native 0.86 (`FlatList`, `BackHandler`, `Alert`), React Navigation 7, TypeScript 5.9, Vitest 1.2 e `@keepit/ui-tokens`.

**Spec:** `docs/superpowers/specs/2026-09-04-estabilizacao-beta-android-cliente-design.md` (§§ 2, 7, 22 e 23) e `docs/stories/12.5.story.md`

## Global Constraints

- Preservar textos, ilustração, fundo escuro, tipografia, tokens, indicadores e CTAs existentes.
- Não adicionar dependências, renderer React Native, biblioteca de carousel nem animação nova; usar apenas APIs já instaladas.
- Manter `Onboarding1` como nome da rota inicial para não migrar a flag nem o boot do `AuthStack`.
- A flag `@keepit/cliente:onboarding_visto` só pode ser gravada por `Pular`, `Criar conta` ou `Entrar`; avanço, swipe, botão `Voltar` e Android Back nunca a gravam.
- Na página zero, Android Back abre confirmação; somente a ação destrutiva confirmada chama `BackHandler.exitApp()`.
- Não alterar a semântica fail-open de `getOnboardingVisto`/`setOnboardingVisto` nem criar nova chave de storage.
- Manter a ilustração e o fundo fora da lista paginada para não remontá-los durante a mudança de índice.
- Não criar testes de snapshot ou por pixel; usar contrato puro, teste existente da flag e typecheck.
- Swipe, ausência de clarão, gesto/três botões e evidência visual do APK release pertencem ao smoke Android consolidado no encerramento do Épico 12, não a uma tarefa manual desta story.

---

### Task 1: Contrato puro de índice, retorno e conclusão

**Files:**
- Create: `apps/cliente/src/lib/onboardingFlow.ts`
- Create: `apps/cliente/src/lib/onboardingFlow.test.ts`

**Interfaces:**
- Produces: `ONBOARDING_PAGE_COUNT = 3` e `OnboardingPageIndex = 0 | 1 | 2`.
- Produces: `getOnboardingPageFromOffset(offsetX: number, viewportWidth: number): OnboardingPageIndex`.
- Produces: `resolveOnboardingBack(index: OnboardingPageIndex): { kind: 'previous'; index: OnboardingPageIndex } | { kind: 'confirm-exit' }`.
- Produces: `getOnboardingDestination(action: 'skip' | 'create-account' | 'login'): 'CriarConta' | 'Login'`.

- [ ] **Step 1: Escrever o RED dos caminhos de navegação**

Criar `apps/cliente/src/lib/onboardingFlow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  getOnboardingDestination,
  getOnboardingPageFromOffset,
  resolveOnboardingBack,
} from './onboardingFlow';

describe('onboardingFlow', () => {
  it('deriva e limita o índice após qualquer swipe', () => {
    expect(getOnboardingPageFromOffset(0, 320)).toBe(0);
    expect(getOnboardingPageFromOffset(320, 320)).toBe(1);
    expect(getOnboardingPageFromOffset(640, 320)).toBe(2);
    expect(getOnboardingPageFromOffset(999, 320)).toBe(2);
    expect(getOnboardingPageFromOffset(320, 0)).toBe(0);
  });

  it('volta uma página ou exige confirmação na primeira', () => {
    expect(resolveOnboardingBack(2)).toEqual({ kind: 'previous', index: 1 });
    expect(resolveOnboardingBack(1)).toEqual({ kind: 'previous', index: 0 });
    expect(resolveOnboardingBack(0)).toEqual({ kind: 'confirm-exit' });
  });

  it('limita conclusão aos três CTAs explícitos', () => {
    expect(getOnboardingDestination('skip')).toBe('CriarConta');
    expect(getOnboardingDestination('create-account')).toBe('CriarConta');
    expect(getOnboardingDestination('login')).toBe('Login');
  });
});
```

- [ ] **Step 2: Executar o teste e confirmar a falha esperada**

Run: `pnpm --filter @keepit/cliente test -- src/lib/onboardingFlow.test.ts`

Expected: FAIL porque `./onboardingFlow` ainda não existe.

- [ ] **Step 3: Implementar as decisões mínimas**

Criar `apps/cliente/src/lib/onboardingFlow.ts`:

```ts
export const ONBOARDING_PAGE_COUNT = 3;
export type OnboardingPageIndex = 0 | 1 | 2;
export type OnboardingCompletionAction = 'skip' | 'create-account' | 'login';

export function getOnboardingPageFromOffset(offsetX: number, viewportWidth: number): OnboardingPageIndex {
  if (viewportWidth <= 0) return 0;
  return Math.max(0, Math.min(2, Math.round(offsetX / viewportWidth))) as OnboardingPageIndex;
}

export function resolveOnboardingBack(index: OnboardingPageIndex) {
  return index === 0
    ? ({ kind: 'confirm-exit' } as const)
    : ({ kind: 'previous', index: (index - 1) as OnboardingPageIndex } as const);
}

export function getOnboardingDestination(action: OnboardingCompletionAction): 'CriarConta' | 'Login' {
  return action === 'login' ? 'Login' : 'CriarConta';
}
```

- [ ] **Step 4: Validar GREEN e commit**

Run: `pnpm --filter @keepit/cliente test -- src/lib/onboardingFlow.test.ts`

Expected: PASS, 3 testes.

```bash
git add apps/cliente/src/lib/onboardingFlow.ts apps/cliente/src/lib/onboardingFlow.test.ts
git commit -m "feat(cliente): define onboarding pager flow"
```

### Task 2: Pager único com chrome persistente e retorno Android

**Files:**
- Create: `apps/cliente/src/components/onboarding/OnboardingPager.tsx`

**Interfaces:**
- Consumes: helpers e tipos da Task 1; `Dots`, `Button`, `OnboardingIllustration` e tokens atuais.
- Produces: `OnboardingPagerProps = { onComplete(action: OnboardingCompletionAction): void }`.
- Maintains: o novo componente monta uma única vez `Screen`, marca, ilustração, área paginada e footer; as telas antigas seguem compiláveis até a Task 3.

- [ ] **Step 1: Montar o shell persistente sem mudar seu chrome**

Em `OnboardingPager.tsx`, manter `Screen`, wordmark e `OnboardingIllustration` fora da lista horizontal:

```tsx
export function OnboardingPager({ onComplete }: OnboardingPagerProps) {
  return (
    <Screen contentStyle={styles.content} backgroundColor={darkColors.bg.primary}>
      <Text style={styles.brand}>KEEPITHUB</Text>
      <OnboardingIllustration />
      <View style={styles.pageHost} onLayout={handleLayout}>
        <FlatList
          ref={listRef}
          horizontal
          pagingEnabled
          data={PAGES}
          keyExtractor={(_, index) => String(index)}
          showsHorizontalScrollIndicator={false}
          renderItem={renderPage}
          onMomentumScrollEnd={handleMomentumScrollEnd}
        />
      </View>
      <View style={styles.footer}>{footer}</View>
    </Screen>
  );
}
```

Copiar do shell atual somente os estilos de `content`, `brand`, heading, subtext e footer, com os mesmos tokens e valores; `pageHost` conserva `marginBottom: spacing['8']`. Não importar nem alterar `OnboardingScreen` nesta task.

- [ ] **Step 2: Criar as páginas horizontais e sincronizar todos os controles pelo mesmo índice**

Criar `OnboardingPager.tsx` com dados imutáveis e `FlatList` paginada:

```tsx
const PAGES = [
  { heading: 'Escolhe lojas locais na plataforma' },
  { heading: 'Pedido fica pronto no hub Keepit' },
  {
    heading: 'Tudo perto de você, retirado no hub.',
    subtext: 'Compre de farmácias, lojas e conveniências locais e retire tudo em um ponto de encontro Keepit.',
  },
] as const;

export interface OnboardingPagerProps {
  onComplete(action: OnboardingCompletionAction): void;
}
```

Definir o estado e callbacks usados pelo shell:

```tsx
type Page = (typeof PAGES)[number];
const listRef = useRef<FlatList<Page>>(null);
const [width, setWidth] = useState(0);
const [activeIndex, setActiveIndex] = useState<OnboardingPageIndex>(0);

const goTo = useCallback((index: OnboardingPageIndex) => {
  if (width <= 0) return;
  listRef.current?.scrollToOffset({ offset: index * width, animated: true });
  setActiveIndex(index);
}, [width]);

const handleLayout = ({ nativeEvent }: LayoutChangeEvent) => setWidth(nativeEvent.layout.width);
const handleMomentumScrollEnd = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
  setActiveIndex(getOnboardingPageFromOffset(nativeEvent.contentOffset.x, width));
};
const renderPage = ({ item }: ListRenderItemInfo<Page>) => (
  <View style={[styles.page, { width }]}>
    <Text style={styles.heading}>{item.heading}</Text>
    {'subtext' in item ? <Text style={styles.subtext}>{item.subtext}</Text> : null}
  </View>
);
```

Montar `footer` a partir do mesmo `activeIndex`:

```tsx
const footer = (
  <View>
    {activeIndex > 0 ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voltar etapa"
        onPress={() => goTo((activeIndex - 1) as OnboardingPageIndex)}
        hitSlop={8}
        style={styles.back}
      >
        <Text style={styles.backText}>Voltar</Text>
      </Pressable>
    ) : null}
    <View style={styles.dotsRow}>
      <Dots total={ONBOARDING_PAGE_COUNT} activeIndex={activeIndex} theme="dark" />
    </View>
    {activeIndex < 2 ? (
      <>
        <Button title="Avançar" onPress={() => goTo((activeIndex + 1) as OnboardingPageIndex)} />
        <Pressable onPress={() => onComplete('skip')} hitSlop={8} style={styles.secondaryAction}>
          <Text style={styles.secondaryText}>Pular</Text>
        </Pressable>
      </>
    ) : (
      <>
        <Button title="Criar conta" onPress={() => onComplete('create-account')} />
        <Pressable onPress={() => onComplete('login')} hitSlop={8} style={styles.secondaryAction}>
          <Text style={styles.secondaryText}>Já tenho conta · Entrar</Text>
        </Pressable>
      </>
    )}
  </View>
);
```

Aplicar a `back`, `backText`, `dotsRow`, `secondaryAction` e `secondaryText` os mesmos tokens escuros, tipografia e espaçamentos usados nas telas atuais; nenhum valor visual novo é introduzido.

- [ ] **Step 3: Interceptar Android Back com o mesmo `goTo`**

Registrar e limpar o listener dentro de `useEffect`:

```tsx
useEffect(() => {
  const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
    const result = resolveOnboardingBack(activeIndex);
    if (result.kind === 'previous') {
      goTo(result.index);
      return true;
    }
    Alert.alert('Sair do onboarding?', 'Seu progresso ainda não foi concluído.', [
      { text: 'Continuar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => BackHandler.exitApp() },
    ]);
    return true;
  });
  return () => subscription.remove();
}, [activeIndex, goTo]);
```

Na página 0/1, renderizar `Avançar` e `Pular`; na página 2, `Criar conta` e `Já tenho conta · Entrar`. Somente esses três últimos caminhos chamam `onComplete`.

- [ ] **Step 4: Typecheck e commit**

Run: `pnpm --filter @keepit/cliente typecheck`

Expected: PASS; o pager novo ainda não substituiu nenhum consumidor.

```bash
git add apps/cliente/src/components/onboarding/OnboardingPager.tsx
git commit -m "feat(cliente): add continuous onboarding pager"
```

### Task 3: Rota única, persistência explícita e gate automatizado

**Files:**
- Modify: `apps/cliente/src/screens/auth/Onboarding1.tsx`
- Delete: `apps/cliente/src/screens/auth/Onboarding2.tsx`
- Delete: `apps/cliente/src/screens/auth/Onboarding3.tsx`
- Delete: `apps/cliente/src/components/onboarding/OnboardingScreen.tsx`
- Modify: `apps/cliente/src/navigation/AuthStack.tsx`
- Modify: `apps/cliente/src/navigation/types.ts`
- Test: `apps/cliente/src/lib/onboardingFlow.test.ts`
- Test: `apps/cliente/src/lib/onboardingFlag.test.ts`

**Interfaces:**
- Consumes: `OnboardingPagerProps.onComplete` e `getOnboardingDestination` da Task 1/2.
- Maintains: `AuthStack` continua iniciando em `Onboarding1` quando `getOnboardingVisto()` retorna `false` e em `Login` quando retorna `true`.

- [ ] **Step 1: Tornar `Onboarding1` o único dono da conclusão**

Substituir seu conteúdo por:

```tsx
export default function Onboarding1({ navigation }: Props) {
  const handleComplete = async (action: OnboardingCompletionAction) => {
    await setOnboardingVisto();
    navigation.replace(getOnboardingDestination(action));
  };

  return <OnboardingPager onComplete={(action) => void handleComplete(action)} />;
}
```

O tipo fechado de `action` impede que avanço/retorno/swipe chamem persistência.

- [ ] **Step 2: Remover somente as duas rotas intermediárias**

Apagar imports e `<Stack.Screen>` de `Onboarding2`/`Onboarding3` em `AuthStack.tsx`, remover as duas chaves de `AuthStackParamList` e excluir os dois arquivos. Excluir também `OnboardingScreen.tsx`, agora substituído pelo shell persistente do pager. Manter a leitura da flag, loading escuro e `initialRouteName` existentes sem mudanças funcionais.

- [ ] **Step 3: Executar os gates mínimos da story**

Run: `pnpm --filter @keepit/cliente test -- src/lib/onboardingFlow.test.ts src/lib/onboardingFlag.test.ts`

Expected: PASS para índice/retorno/destinos e leitura/escrita/reset da flag.

Run: `pnpm --filter @keepit/cliente typecheck`

Expected: PASS sem referências restantes a `Onboarding2` ou `Onboarding3`.

- [ ] **Step 4: Commit**

```bash
git add apps/cliente/src/components/onboarding/OnboardingScreen.tsx apps/cliente/src/screens/auth/Onboarding1.tsx apps/cliente/src/screens/auth/Onboarding2.tsx apps/cliente/src/screens/auth/Onboarding3.tsx apps/cliente/src/navigation/AuthStack.tsx apps/cliente/src/navigation/types.ts
git commit -m "refactor(cliente): consolidate onboarding route"
```
