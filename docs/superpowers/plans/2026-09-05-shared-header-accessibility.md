# Shared Header and Structural Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir os headers titulados duplicados do app Cliente por um `AppHeader` centralizado, acessível e com retorno seguro, além de corrigir semântica e área de toque dos controles compartilhados já ativos.

**Architecture:** `AppHeader` permanece dentro do conteúdo das telas porque os stacks atuais usam `headerShown: false`; ele recebe a navegação estrutural e um fallback explícito, usa `Ionicons` já instalado e reserva dois slots laterais idênticos. Helpers puros testam retorno/fallback e props acessíveis sem renderer; uma migração mecânica cobre o inventário titulado e os controles compartilhados recebem semântica sem mudar regras de negócio.

**Tech Stack:** Expo 57, React 19, React Native 0.86, React Navigation 7, TypeScript 5.9, `@expo/vector-icons` 15, Vitest 1.2 e `@keepit/ui-tokens`.

**Spec:** `docs/superpowers/specs/2026-09-04-estabilizacao-beta-android-cliente-design.md` (§§ 2, 16, 22 e 23) e `docs/stories/12.4.story.md`

## Global Constraints

- Preservar cores, tipografia, espaçamentos, componentes e referências visuais atuais; esta story não redesenha telas.
- Não adicionar dependência, renderer React Native, biblioteca de navegação ou nova arquitetura de headers.
- Manter `headerShown: false` em `AuthStack`, `HomeStack`, `PedidosStack`, `PerfilStack`, `MainTabs` e `RootNavigator`; `AppHeader` continua no layout das telas.
- Usar `Ionicons` de `@expo/vector-icons`, já instalado, para o ícone `chevron-back`; nenhum glyph textual representa a ação voltar no inventário migrado.
- Usar apenas tokens de `@keepit/ui-tokens`; o slot/toque lateral usa `spacing['12']` (48 px) e cresce, em vez de truncar, com escala de fonte.
- O título não usa `numberOfLines`; subtitle e badge podem quebrar linha e a altura do header é mínima, não fixa.
- Renderizar slots esquerdo e direito com a mesma largura mesmo quando um deles está vazio, mantendo o centro geométrico do conteúdo central.
- Toda configuração de back exige `navigation.canGoBack()`, `navigation.goBack()` e `fallback(): void`; não permitir back sem fallback explícito.
- Não alterar params, ordem de stack, fluxo, submit, consultas, estado local nem copy das telas migradas.
- Escopo de migração: `Carrinho`, `Checkout`, `EscolhaRetirada`, `Pagamento`, `AdicionarCartao`, `CancelarPedido`, `ChegueiAoHub`, `LojistaNaoVeio`, `Recibo`, `ModalConfirmarPin`, `ModalPagamentoPix`, `ModalProcessandoPagamento` e `PainelQA`.
- Back-only contextual de `Hub`, `Loja` e `DetalheProduto`, títulos raiz de tabs e linhas de busca ficam fora deste MVP; migrá-los exigiria decidir títulos/acessórios e alteraria composição visual além do padrão titulado repetido.
- Não criar comportamento de favorito nem estado de loja novo; Stories 12.10 e 12.11 continuam donas dessas funcionalidades.
- Corrigir acessibilidade estrutural somente em controles compartilhados já interativos: `Button`, `CategoryChips` e `SelectableRow`.
- Não criar teste por tela ou matriz automatizada extensa; usar testes puros dos contratos, typecheck e smoke consolidado em APK Android release.

---

### Task 1: Contrato puro e componente `AppHeader`

**Files:**
- Create: `apps/cliente/src/components/ui/appHeaderContracts.ts`
- Create: `apps/cliente/src/components/ui/appHeaderContracts.test.ts`
- Create: `apps/cliente/src/components/ui/AppHeader.tsx`
- Modify: `apps/cliente/src/components/ui/index.ts`

**Interfaces:**
- Produces: `HeaderNavigation = { canGoBack(): boolean; goBack(): void }`.
- Produces: `runHeaderBack(navigation: HeaderNavigation, fallback: () => void): void`.
- Produces: `getHeaderControlAccessibility(label: string, state?: { disabled?: boolean; selected?: boolean }): HeaderControlAccessibility`.
- Produces: `AppHeaderBadge = { label: string; tone?: 'neutral' | 'success' | 'warning' }`.
- Produces: `AppHeaderAction = { icon: IoniconsName; label: string; onPress(): void; disabled?: boolean; selected?: boolean }`.
- Produces: `AppHeaderProps = { title: string; subtitle?: string; badge?: AppHeaderBadge; back?: AppHeaderBack; action?: AppHeaderAction }`.
- Produces: `AppHeaderBack = { navigation: HeaderNavigation; fallback(): void; label?: string }`.

- [ ] **Step 1: Escrever o RED do retorno, fallback, acessibilidade e shape das variantes**

Criar `apps/cliente/src/components/ui/appHeaderContracts.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { AppHeaderProps } from './AppHeader';
import { getHeaderControlAccessibility, runHeaderBack } from './appHeaderContracts';

describe('appHeaderContracts', () => {
  it('volta pelo histórico sem acionar fallback', () => {
    const navigation = { canGoBack: vi.fn(() => true), goBack: vi.fn() };
    const fallback = vi.fn();

    runHeaderBack(navigation, fallback);

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('usa o fallback quando não há histórico', () => {
    const navigation = { canGoBack: vi.fn(() => false), goBack: vi.fn() };
    const fallback = vi.fn();

    runHeaderBack(navigation, fallback);

    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('expõe label e estado de controles laterais', () => {
    expect(getHeaderControlAccessibility('Voltar')).toEqual({
      accessibilityRole: 'button',
      accessibilityLabel: 'Voltar',
      accessibilityState: {},
    });
    expect(getHeaderControlAccessibility('Favoritar produto', { selected: true, disabled: false })).toEqual({
      accessibilityRole: 'button',
      accessibilityLabel: 'Favoritar produto',
      accessibilityState: { selected: true, disabled: false },
    });
  });

  it('tipa título, subtítulo, badge e ação lateral como variantes combináveis', () => {
    const onPress = vi.fn();
    const variants = [
      { title: 'Pedidos' },
      { title: 'Pedido', subtitle: 'Retirada no Hub Centro' },
      { title: 'Loja', badge: { label: 'Aberta', tone: 'success' } },
      { title: 'Produto', action: { icon: 'heart-outline', label: 'Favoritar produto', onPress } },
    ] satisfies AppHeaderProps[];

    expect(variants.map(({ title }) => title)).toEqual(['Pedidos', 'Pedido', 'Loja', 'Produto']);
  });
});
```

- [ ] **Step 2: Executar o teste e confirmar a falha esperada**

Run: `pnpm --filter @keepit/cliente test -- src/components/ui/appHeaderContracts.test.ts`

Expected: FAIL porque `AppHeader` e `appHeaderContracts` ainda não existem.

- [ ] **Step 3: Implementar o contrato puro mínimo**

Criar `apps/cliente/src/components/ui/appHeaderContracts.ts`:

```ts
export interface HeaderNavigation {
  canGoBack(): boolean;
  goBack(): void;
}

export interface HeaderControlAccessibility {
  accessibilityRole: 'button';
  accessibilityLabel: string;
  accessibilityState: { disabled?: boolean; selected?: boolean };
}

export function runHeaderBack(navigation: HeaderNavigation, fallback: () => void): void {
  if (navigation.canGoBack()) {
    navigation.goBack();
    return;
  }
  fallback();
}

export function getHeaderControlAccessibility(
  label: string,
  state: { disabled?: boolean; selected?: boolean } = {},
): HeaderControlAccessibility {
  return {
    accessibilityRole: 'button',
    accessibilityLabel: label,
    accessibilityState: state,
  };
}
```

- [ ] **Step 4: Implementar `AppHeader` com slots simétricos e altura flexível**

Criar `apps/cliente/src/components/ui/AppHeader.tsx`:

```tsx
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import {
  getHeaderControlAccessibility,
  runHeaderBack,
  type HeaderNavigation,
} from './appHeaderContracts';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];
export type AppHeaderBadgeTone = 'neutral' | 'success' | 'warning';

export interface AppHeaderBadge {
  label: string;
  tone?: AppHeaderBadgeTone;
}

export interface AppHeaderBack {
  navigation: HeaderNavigation;
  fallback: () => void;
  label?: string;
}

export interface AppHeaderAction {
  icon: IoniconsName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  badge?: AppHeaderBadge;
  back?: AppHeaderBack;
  action?: AppHeaderAction;
}

export function AppHeader({ title, subtitle, badge, back, action }: AppHeaderProps) {
  const backLabel = back?.label ?? 'Voltar';
  const badgeTone = badge?.tone ?? 'neutral';

  return (
    <View style={styles.container}>
      <View style={styles.sideSlot}>
        {back ? (
          <Pressable
            {...getHeaderControlAccessibility(backLabel)}
            onPress={() => runHeaderBack(back.navigation, back.fallback)}
            hitSlop={spacing['1']}
            style={({ pressed }) => [styles.control, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={spacing['6']} color={lightColors.text.primary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.centerSlot}>
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {badge ? (
            <View style={[styles.badge, styles[`badge_${badgeTone}`]]}>
              <Text style={[styles.badgeLabel, styles[`badgeLabel_${badgeTone}`]]}>{badge.label}</Text>
            </View>
          ) : null}
        </View>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      <View style={styles.sideSlot}>
        {action ? (
          <Pressable
            {...getHeaderControlAccessibility(action.label, {
              disabled: action.disabled,
              selected: action.selected,
            })}
            disabled={action.disabled}
            onPress={action.onPress}
            hitSlop={spacing['1']}
            style={({ pressed }) => [styles.control, pressed && !action.disabled && styles.pressed]}
          >
            <Ionicons name={action.icon} size={spacing['6']} color={lightColors.text.primary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: spacing['12'],
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing['4'],
  },
  sideSlot: {
    width: spacing['12'],
    minHeight: spacing['12'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  control: {
    width: spacing['12'],
    minHeight: spacing['12'],
    borderRadius: radii.full,
    backgroundColor: lightColors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.75 },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing['2'],
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing['2'],
  },
  title: {
    flexShrink: 1,
    textAlign: 'center',
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
    lineHeight: typography.sizes.xl.lineHeight,
    color: lightColors.text.primary,
  },
  subtitle: {
    marginTop: spacing['1'],
    textAlign: 'center',
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    lineHeight: typography.sizes.sm.lineHeight,
    color: lightColors.text.secondary,
  },
  badge: {
    borderRadius: radii.badge,
    paddingHorizontal: spacing['2'],
    paddingVertical: spacing['1'],
  },
  badge_neutral: { backgroundColor: lightColors.bg.muted },
  badge_success: { backgroundColor: lightColors.accent.successBg },
  badge_warning: { backgroundColor: lightColors.accent.warning },
  badgeLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    lineHeight: typography.sizes.sm.lineHeight,
  },
  badgeLabel_neutral: { color: lightColors.text.secondary },
  badgeLabel_success: { color: lightColors.accent.successFg },
  badgeLabel_warning: { color: lightColors.text.primary },
});
```

- [ ] **Step 5: Exportar e validar GREEN**

Adicionar a `apps/cliente/src/components/ui/index.ts`:

```ts
export * from './AppHeader';
```

Run: `pnpm --filter @keepit/cliente test -- src/components/ui/appHeaderContracts.test.ts`

Expected: PASS, 4 testes.

Run: `pnpm --filter @keepit/cliente typecheck`

Expected: PASS sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/cliente/src/components/ui/appHeaderContracts.ts apps/cliente/src/components/ui/appHeaderContracts.test.ts apps/cliente/src/components/ui/AppHeader.tsx apps/cliente/src/components/ui/index.ts
git commit -m "feat(cliente): add shared accessible app header"
```

### Task 2: Migrar o inventário titulado de headers manuais

**Files:**
- Modify: `apps/cliente/src/screens/home/Carrinho.tsx`
- Modify: `apps/cliente/src/screens/home/Checkout.tsx`
- Modify: `apps/cliente/src/screens/home/EscolhaRetirada.tsx`
- Modify: `apps/cliente/src/screens/home/Pagamento.tsx`
- Modify: `apps/cliente/src/screens/home/AdicionarCartao.tsx`
- Modify: `apps/cliente/src/screens/pedidos/CancelarPedido.tsx`
- Modify: `apps/cliente/src/screens/pedidos/ChegueiAoHub.tsx`
- Modify: `apps/cliente/src/screens/pedidos/LojistaNaoVeio.tsx`
- Modify: `apps/cliente/src/screens/pedidos/Recibo.tsx`
- Modify: `apps/cliente/src/screens/modals/ModalConfirmarPin.tsx`
- Modify: `apps/cliente/src/screens/modals/ModalPagamentoPix.tsx`
- Modify: `apps/cliente/src/screens/modals/ModalProcessandoPagamento.tsx`
- Modify: `apps/cliente/src/screens/perfil/PainelQA.tsx`
- Test: `apps/cliente/src/components/ui/appHeaderContracts.test.ts`

**Interfaces:**
- Consumes: `AppHeader(props: AppHeaderProps)` da Task 1.
- Produces: fallback Home para telas de `HomeStack`, fallback `MeusPedidos` para telas de `PedidosStack` e modais de pedido/pagamento, e fallback `Perfil` para o Painel QA.
- Preserva: títulos literais/dinâmicos atuais, conteúdo abaixo do header e todos os handlers que não sejam o back manual removido.

- [ ] **Step 1: Registrar a linha de base do inventário**

Run:

```bash
rg -n "topBar|roundButtonIcon|<Text style=\{styles\.backLabel\}>Voltar" apps/cliente/src/screens/home/Carrinho.tsx apps/cliente/src/screens/home/Checkout.tsx apps/cliente/src/screens/home/EscolhaRetirada.tsx apps/cliente/src/screens/home/Pagamento.tsx apps/cliente/src/screens/home/AdicionarCartao.tsx apps/cliente/src/screens/pedidos/CancelarPedido.tsx apps/cliente/src/screens/pedidos/ChegueiAoHub.tsx apps/cliente/src/screens/pedidos/LojistaNaoVeio.tsx apps/cliente/src/screens/pedidos/Recibo.tsx apps/cliente/src/screens/modals/ModalConfirmarPin.tsx apps/cliente/src/screens/modals/ModalPagamentoPix.tsx apps/cliente/src/screens/modals/ModalProcessandoPagamento.tsx apps/cliente/src/screens/perfil/PainelQA.tsx
```

Expected: ocorrências nos 13 arquivos do inventário; este comando delimita o lote e evita capturar headers de cards ou linhas de busca.

- [ ] **Step 2: Migrar as cinco telas do `HomeStack`**

Adicionar `AppHeader` aos imports de `../../components/ui`, remover cada bloco `topBar` e inserir exatamente uma destas chamadas na mesma posição:

```tsx
// Carrinho.tsx
<AppHeader title="Carrinho" back={{ navigation, fallback: () => navigation.navigate('Home') }} />

// Checkout.tsx
<AppHeader title="Checkout" back={{ navigation, fallback: () => navigation.navigate('Home') }} />

// EscolhaRetirada.tsx
<AppHeader
  title="Escolha o ponto de retirada"
  back={{ navigation, fallback: () => navigation.navigate('Home') }}
/>

// Pagamento.tsx
<AppHeader title="Pagamento" back={{ navigation, fallback: () => navigation.navigate('Home') }} />

// AdicionarCartao.tsx
<AppHeader title="Adicionar cartão" back={{ navigation, fallback: () => navigation.navigate('Home') }} />
```

Em cada arquivo, remover os estilos `topBar`, `roundButton`, `roundButtonIcon` e `title`. Remover `Pressable` de `react-native` quando ele era usado somente pelo header (`Carrinho`, `Checkout`, `EscolhaRetirada` e `AdicionarCartao`); mantê-lo em `Pagamento`, que ainda possui ações próprias. Remover `radii` de `Checkout`, `EscolhaRetirada` e `Pagamento` porque nesses três arquivos ele era usado somente pelo botão antigo.

- [ ] **Step 3: Migrar as quatro telas do `PedidosStack`**

Adicionar `AppHeader` ao import de UI e substituir os quatro blocos duplicados por:

```tsx
// CancelarPedido.tsx
<AppHeader title="Cancelar pedido" back={{ navigation, fallback: () => navigation.navigate('MeusPedidos') }} />

// ChegueiAoHub.tsx
<AppHeader title="Cheguei ao hub" back={{ navigation, fallback: () => navigation.navigate('MeusPedidos') }} />

// LojistaNaoVeio.tsx
<AppHeader title="Lojista não veio" back={{ navigation, fallback: () => navigation.navigate('MeusPedidos') }} />

// Recibo.tsx
<AppHeader
  title={pedido ? `Pedido #${pedido.numero}` : 'Pedido'}
  back={{ navigation, fallback: () => navigation.navigate('MeusPedidos') }}
/>
```

Nos quatro arquivos, remover os estilos `topBar`, `roundButton`, `roundButtonIcon` e `title`, além de `Pressable` do import de `react-native`. Preservar `radii` e `typography`, ainda usados pelos cards e textos do corpo.

- [ ] **Step 4: Migrar os três modais e o Painel QA**

Nos três modais, adicionar `AppHeader` ao import de UI e usar o mesmo destino seguro de pedidos:

```tsx
// ModalConfirmarPin.tsx
<AppHeader
  title="Seu pedido"
  back={{
    navigation,
    fallback: () =>
      navigation.navigate('Main', { screen: 'PedidosTab', params: { screen: 'MeusPedidos' } }),
  }}
/>

// ModalPagamentoPix.tsx
<AppHeader
  title="Pagamento PIX"
  back={{
    navigation,
    fallback: () =>
      navigation.navigate('Main', { screen: 'PedidosTab', params: { screen: 'MeusPedidos' } }),
  }}
/>

// ModalProcessandoPagamento.tsx
<AppHeader
  title="Pagamento"
  back={{
    navigation,
    fallback: () =>
      navigation.navigate('Main', { screen: 'PedidosTab', params: { screen: 'MeusPedidos' } }),
  }}
/>
```

Remover os quatro estilos do header nos três arquivos. Remover `Pressable` apenas de `ModalProcessandoPagamento`; `ModalConfirmarPin` e `ModalPagamentoPix` ainda o usam no corpo.

Em `PainelQA.tsx`, substituir o bloco `styles.header` por:

```tsx
<AppHeader title="Painel QA" back={{ navigation, fallback: () => navigation.navigate('Perfil') }} />
```

Remover `styles.header`, `styles.title` e `styles.backLabel`; manter `Pressable`, `radii`, `spacing` e `typography`, usados pelos controles do painel.

- [ ] **Step 5: Verificar o lote sem teste por tela**

Run: `pnpm --filter @keepit/cliente test -- src/components/ui/appHeaderContracts.test.ts`

Expected: PASS, 4 testes.

Run: `pnpm --filter @keepit/cliente typecheck`

Expected: PASS sem imports ou tipos ociosos.

Run:

```bash
rg -n "topBar|roundButtonIcon|<Text style=\{styles\.backLabel\}>Voltar|>‹<" apps/cliente/src/screens/home/Carrinho.tsx apps/cliente/src/screens/home/Checkout.tsx apps/cliente/src/screens/home/EscolhaRetirada.tsx apps/cliente/src/screens/home/Pagamento.tsx apps/cliente/src/screens/home/AdicionarCartao.tsx apps/cliente/src/screens/pedidos/CancelarPedido.tsx apps/cliente/src/screens/pedidos/ChegueiAoHub.tsx apps/cliente/src/screens/pedidos/LojistaNaoVeio.tsx apps/cliente/src/screens/pedidos/Recibo.tsx apps/cliente/src/screens/modals/ModalConfirmarPin.tsx apps/cliente/src/screens/modals/ModalPagamentoPix.tsx apps/cliente/src/screens/modals/ModalProcessandoPagamento.tsx apps/cliente/src/screens/perfil/PainelQA.tsx
```

Expected: nenhuma ocorrência.

Run:

```bash
rg -l "<AppHeader" apps/cliente/src/screens/home apps/cliente/src/screens/pedidos apps/cliente/src/screens/modals apps/cliente/src/screens/perfil | sort
```

Expected: lista contendo exatamente os 13 arquivos desta task.

- [ ] **Step 6: Commit**

```bash
git add apps/cliente/src/screens/home/Carrinho.tsx apps/cliente/src/screens/home/Checkout.tsx apps/cliente/src/screens/home/EscolhaRetirada.tsx apps/cliente/src/screens/home/Pagamento.tsx apps/cliente/src/screens/home/AdicionarCartao.tsx apps/cliente/src/screens/pedidos/CancelarPedido.tsx apps/cliente/src/screens/pedidos/ChegueiAoHub.tsx apps/cliente/src/screens/pedidos/LojistaNaoVeio.tsx apps/cliente/src/screens/pedidos/Recibo.tsx apps/cliente/src/screens/modals/ModalConfirmarPin.tsx apps/cliente/src/screens/modals/ModalPagamentoPix.tsx apps/cliente/src/screens/modals/ModalProcessandoPagamento.tsx apps/cliente/src/screens/perfil/PainelQA.tsx
git commit -m "refactor(cliente): migrate titled screens to app header"
```

### Task 3: Corrigir semântica e área de toque dos controles compartilhados ativos

**Files:**
- Create: `apps/cliente/src/components/ui/interactionAccessibility.ts`
- Create: `apps/cliente/src/components/ui/interactionAccessibility.test.ts`
- Modify: `apps/cliente/src/components/ui/Button.tsx`
- Modify: `apps/cliente/src/components/discovery/CategoryChips.tsx`
- Modify: `apps/cliente/src/components/checkout/SelectableRow.tsx`

**Interfaces:**
- Produces: `getButtonAccessibility(label: string, disabled: boolean, busy: boolean): ButtonAccessibility`.
- Produces: `getSelectionAccessibility(role: 'tab' | 'radio', label: string, selected: boolean): SelectionAccessibility`.
- Consumes: props existentes de `Button`, `CategoryChips` e `SelectableRow`; nenhuma tela muda sua chamada.

- [ ] **Step 1: Escrever o RED dos estados acessíveis**

Criar `apps/cliente/src/components/ui/interactionAccessibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { getButtonAccessibility, getSelectionAccessibility } from './interactionAccessibility';

describe('interactionAccessibility', () => {
  it('expõe botão ocupado como ocupado e desabilitado', () => {
    expect(getButtonAccessibility('Confirmar', true, true)).toEqual({
      accessibilityRole: 'button',
      accessibilityLabel: 'Confirmar',
      accessibilityState: { disabled: true, busy: true },
    });
  });

  it('expõe seleção de tab e radio com o estado correto', () => {
    expect(getSelectionAccessibility('tab', 'Farmácia', true)).toEqual({
      accessibilityRole: 'tab',
      accessibilityLabel: 'Farmácia',
      accessibilityState: { selected: true },
    });
    expect(getSelectionAccessibility('radio', 'PIX, Aprovação na hora', false)).toEqual({
      accessibilityRole: 'radio',
      accessibilityLabel: 'PIX, Aprovação na hora',
      accessibilityState: { checked: false },
    });
  });
});
```

- [ ] **Step 2: Executar o teste e confirmar a falha esperada**

Run: `pnpm --filter @keepit/cliente test -- src/components/ui/interactionAccessibility.test.ts`

Expected: FAIL porque `interactionAccessibility.ts` ainda não existe.

- [ ] **Step 3: Implementar o helper puro mínimo**

Criar `apps/cliente/src/components/ui/interactionAccessibility.ts`:

```ts
export interface ButtonAccessibility {
  accessibilityRole: 'button';
  accessibilityLabel: string;
  accessibilityState: { disabled: boolean; busy: boolean };
}

export interface SelectionAccessibility {
  accessibilityRole: 'tab' | 'radio';
  accessibilityLabel: string;
  accessibilityState: { selected: boolean } | { checked: boolean };
}

export function getButtonAccessibility(label: string, disabled: boolean, busy: boolean): ButtonAccessibility {
  return {
    accessibilityRole: 'button',
    accessibilityLabel: label,
    accessibilityState: { disabled, busy },
  };
}

export function getSelectionAccessibility(
  role: 'tab' | 'radio',
  label: string,
  selected: boolean,
): SelectionAccessibility {
  return {
    accessibilityRole: role,
    accessibilityLabel: label,
    accessibilityState: role === 'tab' ? { selected } : { checked: selected },
  };
}
```

- [ ] **Step 4: Aplicar semântica e crescimento por fonte no `Button`**

Em `Button.tsx`, calcular uma única vez o estado efetivo e espalhar as props no `Pressable`:

```tsx
const isDisabled = Boolean(disabled || loading);

return (
  <Pressable
    {...getButtonAccessibility(title, isDisabled, Boolean(loading))}
    onPress={onPress}
    disabled={isDisabled}
    style={({ pressed }) => [
      styles.base,
      variant === 'primary' && styles.primary,
      variant === 'outline' && styles.outline,
      variant === 'ghost' && styles.ghost,
      isDisabled && styles.disabled,
      pressed && !isDisabled && styles.pressed,
    ]}
  >
```

Importar `getButtonAccessibility`. Em `styles.base`, trocar `height: 52` por `minHeight: 52` e adicionar `paddingVertical: spacing['2']`; em `styles.ghost`, substituir `height: 'auto'` por `minHeight: spacing['12']`. Isso preserva 52 px como mínimo dos botões preenchidos e garante 48 px no ghost, permitindo crescimento de texto.

- [ ] **Step 5: Aplicar estado selecionado e toque mínimo nos chips**

Em `CategoryChips.tsx`, importar `getSelectionAccessibility`, marcar o container e cada chip:

```tsx
<ScrollView
  accessibilityRole="tablist"
  horizontal
  showsHorizontalScrollIndicator={false}
  contentContainerStyle={styles.row}
>
  {categorias.map((categoria) => {
    const active = categoria.id === selected;
    return (
      <Pressable
        {...getSelectionAccessibility('tab', categoria.label, active)}
        key={categoria.id}
        style={[styles.chip, active && styles.chipActive]}
        onPress={() => onSelect(categoria.id)}
      >
        <Text style={[styles.label, active && styles.labelActive]}>{categoria.label}</Text>
      </Pressable>
    );
  })}
</ScrollView>
```

Trocar `height: 36` por `minHeight: spacing['12']` em `styles.chip`; manter padding, cores e raio atuais.

- [ ] **Step 6: Aplicar semântica de radio à linha selecionável**

Em `SelectableRow.tsx`, importar `getSelectionAccessibility`, compor o label apenas com textos já visíveis e atualizar o `Pressable`:

```tsx
const accessibilityLabel = [title, highlight, subtitle].filter(Boolean).join(', ');

return (
  <Pressable
    {...getSelectionAccessibility('radio', accessibilityLabel, selected)}
    style={[styles.row, selected && styles.rowSelected]}
    onPress={onPress}
  >
```

Não alterar o radio visual, textos, cores ou callback existentes; a linha já excede 48 px por seu padding e conteúdo.

- [ ] **Step 7: Validar GREEN**

Run: `pnpm --filter @keepit/cliente test -- src/components/ui/interactionAccessibility.test.ts src/components/ui/appHeaderContracts.test.ts`

Expected: PASS, 6 testes nos dois arquivos.

Run: `pnpm --filter @keepit/cliente typecheck`

Expected: PASS sem erros.

- [ ] **Step 8: Commit**

```bash
git add apps/cliente/src/components/ui/interactionAccessibility.ts apps/cliente/src/components/ui/interactionAccessibility.test.ts apps/cliente/src/components/ui/Button.tsx apps/cliente/src/components/discovery/CategoryChips.tsx apps/cliente/src/components/checkout/SelectableRow.tsx
git commit -m "fix(cliente): expose structural accessibility states"
```

### Task 4: Gates finais e smoke consolidado em APK Android release

**Files:**
- Create: `docs/qa/12.4-shared-header-accessibility.md`
- Create: `docs/qa/evidence/12.4-header-compact-font.png`
- Create: `docs/qa/evidence/12.4-header-three-button.png`
- Create: `docs/qa/evidence/12.4-selection-talkback.png`
- Modify: `docs/stories/12.4.story.md`
- Test: `apps/cliente/src/components/ui/appHeaderContracts.test.ts`
- Test: `apps/cliente/src/components/ui/interactionAccessibility.test.ts`

**Interfaces:**
- Consumes: APK do perfil `demo-apk`, `AppHeader` migrado e controles acessíveis das Tasks 1–3.
- Produces: evidência factual do build, duas configurações Android, TalkBack e resultados automatizados.
- Produces: Story 12.4 em `Ready for Review` somente quando todos os gates passarem.

- [ ] **Step 1: Rodar os gates automatizados completos**

Run: `pnpm --filter @keepit/cliente test`

Expected: PASS em toda a suíte Cliente.

Run: `pnpm --filter @keepit/cliente typecheck`

Expected: PASS sem erros.

Run: `git diff --check`

Expected: saída vazia e exit code 0.

- [ ] **Step 2: Gerar e instalar um único APK Android release**

Run: `cd apps/cliente && eas build --platform android --profile demo-apk`

Expected: build concluído com artifact `apk`; registrar ID, URL, commit SHA e data retornados pelo EAS.

Run: `cd apps/cliente && eas build:run --platform android --latest`

Expected: o APK recém-gerado abre com Gboard e TalkBack disponíveis; não usar Expo Go ou build de desenvolvimento como evidência.

- [ ] **Step 3: Executar o percurso compacto com fonte ampliada e gestos**

Run: `adb shell settings put system font_scale 1.3`

No viewport aproximado de 360 × 640 e navegação por gestos:

1. Abrir `EscolhaRetirada` e confirmar que o título longo quebra sem truncar, permanece geometricamente centralizado e não desloca os slots de 48 px.
2. Voltar para Home pelo botão vetorial e reabrir a tela para confirmar que o fluxo existente não muda.
3. Abrir `Recibo` e validar o título dinâmico `Pedido #numero` em estado loading e carregado.
4. Abrir `PainelQA` e confirmar ícone à esquerda, título central e retorno ao Perfil.
5. Em busca e pagamento, percorrer `CategoryChips`, `SelectableRow` e botões primary/ghost; confirmar quebra de texto sem sobreposição e alvo mínimo de 48 px.

- [ ] **Step 4: Executar o percurso grande com três botões e TalkBack**

Restaurar fonte padrão:

```bash
adb shell settings put system font_scale 1.0
```

No viewport aproximado de 412 × 915 e navegação por três botões:

1. Abrir `Carrinho → Checkout → Pagamento → ModalPagamentoPix` e voltar em cada nível; cada toque deve chamar `goBack` quando há histórico.
2. Abrir `CancelarPedido` e `ModalConfirmarPin`; o botão Android e o controle vetorial não podem travar nem sair do app de forma inesperada.
3. Com TalkBack, confirmar anúncio do título como header, do controle como “Voltar, botão” e dos estados selecionado/desmarcado nos chips e radios.
4. Acionar um botão em loading e confirmar anúncio de ocupado/desabilitado sem submit duplicado.

O ramo sem histórico é provado pelo teste puro de `runHeaderBack`; não criar uma rota artificial no APK só para reproduzi-lo.

- [ ] **Step 5: Capturar e registrar a evidência observada**

Depois de navegar manualmente a cada estado, salvar três capturas:

```bash
mkdir -p docs/qa/evidence
adb exec-out screencap -p > docs/qa/evidence/12.4-header-compact-font.png
adb exec-out screencap -p > docs/qa/evidence/12.4-header-three-button.png
adb exec-out screencap -p > docs/qa/evidence/12.4-selection-talkback.png
```

Criar `docs/qa/12.4-shared-header-accessibility.md` somente após o smoke. Usar o título `Story 12.4 — Evidência Android de header e acessibilidade` e as seções `Build verificado`, `Ambientes`, `Headers`, `TalkBack e controles`, `Evidências` e `Gates automatizados`. Registrar valores reais do EAS/dispositivo, resultado e observação de cada passo, os três caminhos de captura e os exit codes. Não registrar `PASS` sem observação no APK.

Em `docs/stories/12.4.story.md`, marcar os quatro subtasks concluídos, mudar `Status` de `Draft` para `Ready for Review` e substituir `QA Results: Pendente` pelo resumo factual dos testes, typecheck, APK e configurações verificadas. Qualquer falha mantém a story em `Draft` e entra no documento com reprodução exata.

- [ ] **Step 6: Commit**

```bash
git add docs/qa/12.4-shared-header-accessibility.md docs/qa/evidence/12.4-header-compact-font.png docs/qa/evidence/12.4-header-three-button.png docs/qa/evidence/12.4-selection-talkback.png docs/stories/12.4.story.md
git commit -m "test(cliente): record shared header Android verification"
```
