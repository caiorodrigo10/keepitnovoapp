# Android Form Keyboard Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Padronizar formulários e o bottom sheet de CPF do app Cliente para que campos e ações permaneçam utilizáveis com teclado, safe areas e navegação Android, sem alterar regras de negócio ou identidade visual.

**Architecture:** Dois componentes pequenos de layout, `FormScreen` e `FormSheet`, compõem apenas APIs já instaladas (`SafeAreaView`, `KeyboardAvoidingView` e `ScrollView`). Um módulo puro concentra a política de teclado/scroll e as props acessíveis do checkbox; as telas ativas migram mecanicamente para esses primitives, enquanto a validação visual e de foco acontece em um APK Android release.

**Tech Stack:** Expo 57, React 19, React Native 0.86, TypeScript 5.9, React Navigation 7, `react-native-safe-area-context` 5.7, Vitest 1.2 e `@keepit/ui-tokens`.

**Spec:** `docs/superpowers/specs/2026-09-04-estabilizacao-beta-android-cliente-design.md` (§§ 2, 8, 9, 22 e 23) e `docs/stories/12.3.story.md`

## Global Constraints

- Preservar cores, tipografia, espaçamentos, componentes e conteúdo atuais; esta story não redesenha telas.
- Não adicionar dependência, renderer React Native, biblioteca de keyboard-aware scroll nem biblioteca de bottom sheet.
- Usar somente `KeyboardAvoidingView`, `ScrollView`, `Platform` e `react-native-safe-area-context`, já presentes no app.
- Manter `Screen` como wrapper geral; `FormScreen` é usado somente nas superfícies ativas que recebem input.
- `FormSheet` é layout de uma rota modal já controlada pelo React Navigation; não criar um segundo `Modal` nativo nem mudar a apresentação da rota.
- Não alterar submit, validação, máscara, persistência, mensagens ou navegação de cadastro, login, recuperação, perfil, cartão, CEP e CPF.
- Não antecipar o tratamento de falha, instrumentação ou profiling do CPF, que pertencem à Story 12.6.
- Não reativar `ConfirmacaoSMS`: a tela é um stub inalcançável e não faz parte do fluxo ativo de autenticação.
- Manter toda estilização em `@keepit/ui-tokens`; não introduzir cor, raio, fonte ou espaçamento literal.
- Automatizar somente os contratos puros críticos. A geometria real de teclado, foco, barras do sistema e fonte ampliada deve ser aprovada em APK Android release.
- Não criar teste por tela: a migração é mecânica e seu gate automatizado é o teste dos helpers mais o typecheck do pacote Cliente.

---

### Task 1: Primitive compartilhado de formulário e contrato acessível do checkbox

**Files:**
- Create: `apps/cliente/src/components/ui/formContracts.ts`
- Create: `apps/cliente/src/components/ui/formContracts.test.ts`
- Create: `apps/cliente/src/components/ui/FormScreen.tsx`
- Modify: `apps/cliente/src/components/ui/Checkbox.tsx`
- Modify: `apps/cliente/src/components/ui/index.ts`
- Modify: `apps/cliente/src/screens/auth/CriarConta.tsx`
- Modify: `apps/cliente/src/screens/home/Checkout.tsx`

**Interfaces:**
- Consumes: `spacing`, `lightColors`, `radii` e `typography` de `@keepit/ui-tokens`; `SafeAreaView` de `react-native-safe-area-context`.
- Produces: `getKeyboardAvoidingBehavior(platform: string): 'padding' | 'height'`.
- Produces: `FORM_SCROLL_PROPS`, com `keyboardShouldPersistTaps: 'handled'` e `keyboardDismissMode: 'on-drag'`.
- Produces: `getCheckboxAccessibilityProps(label: string, checked: boolean, error?: string): CheckboxAccessibilityProps`.
- Produces: `FormScreen(props: FormScreenProps)`, com `children`, `footer?`, `contentContainerStyle?`, `footerStyle?` e `keyboardVerticalOffset?`.
- Altera: `Checkbox` passa a exigir `label: string` e aceita `error?: string`; `checked`, `onToggle` e `children` permanecem.

- [ ] **Step 1: Escrever os testes RED dos contratos puros**

Criar `apps/cliente/src/components/ui/formContracts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  FORM_SCROLL_PROPS,
  getCheckboxAccessibilityProps,
  getKeyboardAvoidingBehavior,
} from './formContracts';

describe('formContracts', () => {
  it('reduz a altura útil no Android e usa padding no iOS', () => {
    expect(getKeyboardAvoidingBehavior('android')).toBe('height');
    expect(getKeyboardAvoidingBehavior('ios')).toBe('padding');
  });

  it('mantém taps tratados e fecha o teclado ao arrastar', () => {
    expect(FORM_SCROLL_PROPS).toEqual({
      keyboardShouldPersistTaps: 'handled',
      keyboardDismissMode: 'on-drag',
    });
  });

  it('expõe label, seleção e erro do checkbox ao leitor de tela', () => {
    expect(
      getCheckboxAccessibilityProps(
        'Aceito os Termos e a Política de Privacidade',
        false,
        'É preciso aceitar os Termos e a Política de Privacidade.',
      ),
    ).toEqual({
      accessibilityRole: 'checkbox',
      accessibilityLabel: 'Aceito os Termos e a Política de Privacidade',
      accessibilityState: { checked: false },
      accessibilityHint: 'É preciso aceitar os Termos e a Política de Privacidade.',
    });

    expect(getCheckboxAccessibilityProps('Solicitar nota fiscal', true)).toEqual({
      accessibilityRole: 'checkbox',
      accessibilityLabel: 'Solicitar nota fiscal',
      accessibilityState: { checked: true },
    });
  });
});
```

- [ ] **Step 2: Executar o teste e confirmar a falha esperada**

Run: `pnpm --filter @keepit/cliente test -- src/components/ui/formContracts.test.ts`

Expected: FAIL porque `./formContracts` ainda não existe.

- [ ] **Step 3: Implementar os contratos mínimos**

Criar `apps/cliente/src/components/ui/formContracts.ts`:

```ts
export const FORM_SCROLL_PROPS = {
  keyboardShouldPersistTaps: 'handled',
  keyboardDismissMode: 'on-drag',
} as const;

export interface CheckboxAccessibilityProps {
  accessibilityRole: 'checkbox';
  accessibilityLabel: string;
  accessibilityState: { checked: boolean };
  accessibilityHint?: string;
}

export function getKeyboardAvoidingBehavior(platform: string): 'padding' | 'height' {
  return platform === 'ios' ? 'padding' : 'height';
}

export function getCheckboxAccessibilityProps(
  label: string,
  checked: boolean,
  error?: string,
): CheckboxAccessibilityProps {
  return {
    accessibilityRole: 'checkbox',
    accessibilityLabel: label,
    accessibilityState: { checked },
    ...(error ? { accessibilityHint: error } : {}),
  };
}
```

- [ ] **Step 4: Criar o `FormScreen` com scroll comprimível e footer fixo dentro da área ajustada pelo teclado**

Criar `apps/cliente/src/components/ui/FormScreen.tsx`:

```tsx
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { lightColors, spacing } from '@keepit/ui-tokens';

import { FORM_SCROLL_PROPS, getKeyboardAvoidingBehavior } from './formContracts';

export interface FormScreenProps {
  children: ReactNode;
  footer?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  footerStyle?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
}

export function FormScreen({
  children,
  footer,
  contentContainerStyle,
  footerStyle,
  keyboardVerticalOffset = 0,
}: FormScreenProps) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={getKeyboardAvoidingBehavior(Platform.OS)}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <ScrollView
          {...FORM_SCROLL_PROPS}
          contentContainerStyle={[styles.content, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        {footer ? <View style={[styles.footer, footerStyle]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: lightColors.bg.primary },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing['6'],
    paddingTop: spacing['6'],
    paddingBottom: spacing['5'],
  },
  footer: {
    backgroundColor: lightColors.bg.primary,
    paddingHorizontal: spacing['6'],
    paddingTop: spacing['3'],
    paddingBottom: spacing['4'],
  },
});
```

O `footer` fica fora do `ScrollView`, mas dentro do `KeyboardAvoidingView`: o teclado reduz o host inteiro, o scroll absorve a compressão e o CTA não desce sob o teclado. Sem `footer`, a tela continua sendo um formulário rolável comum.

- [ ] **Step 5: Tornar o checkbox autocontido para semântica e erro**

Atualizar a interface e o retorno de `apps/cliente/src/components/ui/Checkbox.tsx`, preservando os estilos atuais de caixa/texto:

```tsx
interface CheckboxProps {
  checked: boolean;
  onToggle: () => void;
  label: string;
  error?: string;
  children: ReactNode;
}

export function Checkbox({ checked, onToggle, label, error, children }: CheckboxProps) {
  return (
    <View>
      <Pressable
        {...getCheckboxAccessibilityProps(label, checked, error)}
        style={styles.row}
        onPress={onToggle}
        hitSlop={8}
      >
        <View style={[styles.box, checked && styles.boxChecked]}>
          {checked && <Text style={styles.check}>✓</Text>}
        </View>
        <Text style={styles.text}>{children}</Text>
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
```

Adicionar o import de `getCheckboxAccessibilityProps` e mover o estilo hoje local de erro de termos para `Checkbox`:

```ts
error: {
  marginTop: spacing['1'],
  marginLeft: 22 + spacing['3'],
  fontFamily: 'HankenGrotesk-Regular',
  fontSize: typography.sizes.sm.fontSize,
  color: lightColors.accent.warning,
},
```

A linha inteira continua sendo o `Pressable`; `alignItems: 'flex-start'` e `marginTop: 2` da caixa permanecem, alinhando-a à primeira linha mesmo com fonte ampliada.

- [ ] **Step 6: Conectar o novo contrato nos dois consumidores existentes**

Em `CriarConta.tsx`, substituir o bloco do checkbox e o `Text` de erro adjacente por:

```tsx
<View style={styles.checkboxBlock}>
  <Checkbox
    checked={aceiteTermos}
    onToggle={() => setAceiteTermos((previous) => !previous)}
    label="Aceito os Termos e a Política de Privacidade"
    error={errors.termos}
  >
    Aceito os <Text style={styles.bold}>Termos</Text> e a{' '}
    <Text style={styles.bold}>Política de Privacidade</Text>.
  </Checkbox>
</View>
```

Remover `styles.termsError`, agora centralizado no componente. Em `Checkout.tsx`, adicionar o label à chamada existente sem mudar filhos ou callback:

```tsx
<Checkbox
  checked={cart.nfSolicitada}
  onToggle={() => cart.setNfSolicitada(!cart.nfSolicitada)}
  label="Solicitar nota fiscal"
>
  Solicitar nota fiscal
</Checkbox>
```

- [ ] **Step 7: Exportar o primitive e validar GREEN**

Adicionar a `apps/cliente/src/components/ui/index.ts`:

```ts
export * from './FormScreen';
```

Run: `pnpm --filter @keepit/cliente test -- src/components/ui/formContracts.test.ts`

Expected: PASS, 3 testes.

Run: `pnpm --filter @keepit/cliente typecheck`

Expected: PASS sem erros.

- [ ] **Step 8: Commit**

```bash
git add apps/cliente/src/components/ui/formContracts.ts apps/cliente/src/components/ui/formContracts.test.ts apps/cliente/src/components/ui/FormScreen.tsx apps/cliente/src/components/ui/Checkbox.tsx apps/cliente/src/components/ui/index.ts apps/cliente/src/screens/auth/CriarConta.tsx apps/cliente/src/screens/home/Checkout.tsx
git commit -m "feat(cliente): add keyboard-aware form screen"
```

### Task 2: Primitive compartilhado de bottom sheet/modal

**Files:**
- Create: `apps/cliente/src/components/ui/FormSheet.tsx`
- Modify: `apps/cliente/src/components/ui/index.ts`
- Test: `apps/cliente/src/components/ui/formContracts.test.ts`

**Interfaces:**
- Consumes: `FORM_SCROLL_PROPS` e `getKeyboardAvoidingBehavior(platform)` da Task 1.
- Produces: `FormSheet(props: FormSheetProps)`, com `children`, `footer?`, `contentContainerStyle?`, `footerStyle?` e `keyboardVerticalOffset?`.
- Mantém: visibilidade, dismiss e hardware back continuam sob responsabilidade da rota modal de `RootNavigator`; `FormSheet` trata somente layout.

- [ ] **Step 1: Criar o RED de compilação para o novo export**

Adicionar a `apps/cliente/src/components/ui/index.ts` antes de criar o arquivo:

```ts
export * from './FormSheet';
```

Run: `pnpm --filter @keepit/cliente typecheck`

Expected: FAIL com TS2307 para `./FormSheet`.

- [ ] **Step 2: Implementar o `FormSheet` mínimo, sem montar outro sistema de modal**

Criar `apps/cliente/src/components/ui/FormSheet.tsx`:

```tsx
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { lightColors, radii, spacing } from '@keepit/ui-tokens';

import { FORM_SCROLL_PROPS, getKeyboardAvoidingBehavior } from './formContracts';

export interface FormSheetProps {
  children: ReactNode;
  footer?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  footerStyle?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
}

export function FormSheet({
  children,
  footer,
  contentContainerStyle,
  footerStyle,
  keyboardVerticalOffset = 0,
}: FormSheetProps) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={getKeyboardAvoidingBehavior(Platform.OS)}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <View style={styles.sheet}>
          <ScrollView
            {...FORM_SCROLL_PROPS}
            contentContainerStyle={[styles.content, contentContainerStyle]}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={[styles.footer, footerStyle]}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '100%',
    overflow: 'hidden',
    backgroundColor: lightColors.bg.primary,
    borderTopLeftRadius: radii.modal,
    borderTopRightRadius: radii.modal,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing['6'],
    paddingTop: spacing['6'],
    paddingBottom: spacing['3'],
  },
  footer: {
    backgroundColor: lightColors.bg.primary,
    paddingHorizontal: spacing['6'],
    paddingTop: spacing['3'],
    paddingBottom: spacing['4'],
  },
});
```

`maxHeight: '100%'` faz a folha encolher dentro das safe areas e do teclado; conteúdo longo rola, e o footer permanece na área útil. Não adicionar backdrop ou gesto próprio, pois isso mudaria a apresentação atual da rota.

- [ ] **Step 3: Validar o contrato compartilhado e a compilação parcial**

Run: `pnpm --filter @keepit/cliente test -- src/components/ui/formContracts.test.ts`

Expected: PASS, 3 testes.

Run: `pnpm --filter @keepit/cliente typecheck`

Expected: PASS sem erros.

- [ ] **Step 4: Commit**

```bash
git add apps/cliente/src/components/ui/FormSheet.tsx apps/cliente/src/components/ui/index.ts
git commit -m "feat(cliente): add keyboard-aware form sheet"
```

### Task 3: Migrar formulários críticos em um lote mecânico

**Files:**
- Modify: `apps/cliente/src/screens/auth/CriarConta.tsx`
- Modify: `apps/cliente/src/screens/auth/Login.tsx`
- Modify: `apps/cliente/src/screens/auth/EsqueciSenha.tsx`
- Modify: `apps/cliente/src/screens/auth/RecuperarSenha.tsx`
- Modify: `apps/cliente/src/screens/perfil/Perfil.tsx`
- Modify: `apps/cliente/src/screens/home/AdicionarCartao.tsx`
- Modify: `apps/cliente/src/screens/home/EscolhaRetirada.tsx`
- Modify: `apps/cliente/src/screens/modals/ModalCPF.tsx`
- Test: `apps/cliente/src/components/ui/formContracts.test.ts`

**Interfaces:**
- Consumes: `FormScreen`, `FormSheet` e `Checkbox(label, error)` das Tasks 1–2.
- Preserva: todas as funções `handle*`, estados locais, máscaras, validações, loading, mensagens e chamadas de `getDataClient()` existentes.
- Produz: cinco CTAs primários no `footer` de `FormScreen` (`CriarConta`, `Login`, `EsqueciSenha`, `RecuperarSenha`, `AdicionarCartao`) e o CTA do CPF no `footer` de `FormSheet`.
- Produz: `Perfil` e `EscolhaRetirada` com scroll ajustável ao teclado, mantendo ações condicionais inline.

- [ ] **Step 1: Registrar a linha de base antes do lote**

Run: `pnpm --filter @keepit/cliente test -- src/components/ui/formContracts.test.ts`

Expected: PASS, 3 testes.

Run: `rg -n "<Screen|<FormScreen|<FormSheet" apps/cliente/src/screens/auth/CriarConta.tsx apps/cliente/src/screens/auth/Login.tsx apps/cliente/src/screens/auth/EsqueciSenha.tsx apps/cliente/src/screens/auth/RecuperarSenha.tsx apps/cliente/src/screens/perfil/Perfil.tsx apps/cliente/src/screens/home/AdicionarCartao.tsx apps/cliente/src/screens/home/EscolhaRetirada.tsx apps/cliente/src/screens/modals/ModalCPF.tsx`

Expected: os sete formulários de tela usam `Screen`; `ModalCPF` não usa nenhum dos novos primitives.

- [ ] **Step 2: Migrar cadastro e login sem mover links secundários nem regras de submit**

Em `CriarConta.tsx`, substituir o import de UI e as tags externas exatamente assim:

```diff
-import { Button, Checkbox, Screen, TextField } from '../../components/ui';
+import { Button, Checkbox, FormScreen, TextField } from '../../components/ui';
@@
-    <Screen>
+    <FormScreen footer={<Button title="Criar conta" onPress={handleCriarConta} loading={loading} />}>
@@
-      <Button title="Criar conta" onPress={handleCriarConta} loading={loading} />
-
@@
-    </Screen>
+    </FormScreen>
```

Não mover `loginRow`: ele continua no conteúdo rolável. Em `Login.tsx`, aplicar:

```diff
-import { Button, Screen, TextField } from '../../components/ui';
+import { Button, FormScreen, TextField } from '../../components/ui';
@@
-    <Screen>
+    <FormScreen
+      footer={<Button title="Entrar" onPress={handleEntrar} loading={loading} disabled={!email || !senha} />}
+    >
@@
-      <Button title="Entrar" onPress={handleEntrar} loading={loading} disabled={!email || !senha} />
-
@@
-    </Screen>
+    </FormScreen>
```

Não mover `signupRow`: ele continua no conteúdo rolável.

- [ ] **Step 3: Migrar somente os estados com input das duas telas de recuperação**

Em `EsqueciSenha.tsx`, manter o retorno `enviado` em `Screen` e aplicar somente ao segundo retorno:

```diff
-import { Button, Screen, TextField } from '../../components/ui';
+import { Button, FormScreen, Screen, TextField } from '../../components/ui';
@@
-    <Screen>
+    <FormScreen
+      footer={<Button title="Enviar" onPress={handleEnviar} loading={loading} disabled={!email.trim()} />}
+    >
@@
-      <Button title="Enviar" onPress={handleEnviar} loading={loading} disabled={!email.trim()} />
-    </Screen>
+    </FormScreen>
```

Em `RecuperarSenha.tsx`, manter o retorno `linkInvalido` em `Screen` e aplicar somente ao segundo retorno:

```diff
-import { Button, Screen, TextField } from '../../components/ui';
+import { Button, FormScreen, Screen, TextField } from '../../components/ui';
@@
-    <Screen>
+    <FormScreen
+      footer={
+        <Button
+          title="Redefinir senha"
+          onPress={handleRedefinir}
+          loading={loading}
+          disabled={!senha || !confirmacao}
+        />
+      }
+    >
@@
-      <Button
-        title="Redefinir senha"
-        onPress={handleRedefinir}
-        loading={loading}
-        disabled={!senha || !confirmacao}
-      />
-    </Screen>
+    </FormScreen>
```

- [ ] **Step 4: Migrar perfil, cartão e CEP preservando suas ramificações atuais**

Em `Perfil.tsx`, adicionar `FormScreen` ao import de UI. No retorno principal localizado imediatamente após `const showSummary`, trocar a tag de abertura `<Screen>` por `<FormScreen>` e a tag de fechamento correspondente por `</FormScreen>`. Não tocar nos três retornos anteriores de loading, erro e sem sessão, que continuam usando `Screen`. Os botões de edição ficam inline porque aparecem condicionalmente dentro de uma tela longa e precisam rolar com o bloco editado.

Em `AdicionarCartao.tsx`, aplicar estas substituições:

```diff
-import { Button, Screen, TextField } from '../../components/ui';
+import { Button, FormScreen, TextField } from '../../components/ui';
@@
-    <Screen>
+    <FormScreen
+      footer={<Button title="Adicionar cartão" onPress={handleAdicionar} disabled={!podeAdicionar} />}
+    >
@@
-      <Button title="Adicionar cartão" onPress={handleAdicionar} disabled={!podeAdicionar} />
-    </Screen>
+    </FormScreen>
```

Em `EscolhaRetirada.tsx`, substituir `Button, Screen, TextField` por `Button, FormScreen, TextField` no import de UI e trocar as tags externas `<Screen>`/`</Screen>` por `<FormScreen>`/`</FormScreen>`. Manter `Usar este CEP` e `Confirmar ponto` inline nas ramificações existentes, para não exibir CTA durante loading, erro ou vazio.

- [ ] **Step 5: Migrar o CPF para `FormSheet` sem absorver escopo da Story 12.6**

Em `ModalCPF.tsx`, remover `View` e os estilos `overlay`/`card` que passam a pertencer ao primitive, importar `FormSheet` e manter máscara, validação e submit como estão:

```tsx
return (
  <FormSheet
    footer={
      <Button
        title={salvando ? 'Confirmando...' : 'Confirmar'}
        onPress={handleConfirmar}
        disabled={!podeConfirmar}
      />
    }
  >
    <Text style={styles.title}>Confirme seu CPF</Text>
    <Text style={styles.subtitle}>
      Precisamos do seu CPF na primeira compra para emitir a nota fiscal e prevenir fraudes. Não pedimos de
      novo nos próximos pedidos.
    </Text>
    <TextField
      label="CPF"
      value={cpf}
      onChangeText={(value) => setCpf(maskCpf(value))}
      placeholder="000.000.000-00"
      keyboardType="number-pad"
    />
  </FormSheet>
);
```

Não adicionar estado de erro, log de render ou profiling aqui; a Story 12.6 fará essas mudanças sobre o host já padronizado.

- [ ] **Step 6: Executar os gates do lote mecânico**

Run: `pnpm --filter @keepit/cliente test -- src/components/ui/formContracts.test.ts`

Expected: PASS, 3 testes.

Run: `pnpm --filter @keepit/cliente typecheck`

Expected: PASS sem erros.

Run: `rg -n "KeyboardAvoidingView|keyboardShouldPersistTaps|keyboardDismissMode" apps/cliente/src/screens/auth/CriarConta.tsx apps/cliente/src/screens/auth/Login.tsx apps/cliente/src/screens/auth/EsqueciSenha.tsx apps/cliente/src/screens/auth/RecuperarSenha.tsx apps/cliente/src/screens/perfil/Perfil.tsx apps/cliente/src/screens/home/AdicionarCartao.tsx apps/cliente/src/screens/home/EscolhaRetirada.tsx apps/cliente/src/screens/modals/ModalCPF.tsx`

Expected: nenhuma ocorrência; as decisões transversais ficam apenas nos primitives compartilhados.

Run: `rg -n "<FormScreen|<FormSheet" apps/cliente/src/screens/auth/CriarConta.tsx apps/cliente/src/screens/auth/Login.tsx apps/cliente/src/screens/auth/EsqueciSenha.tsx apps/cliente/src/screens/auth/RecuperarSenha.tsx apps/cliente/src/screens/perfil/Perfil.tsx apps/cliente/src/screens/home/AdicionarCartao.tsx apps/cliente/src/screens/home/EscolhaRetirada.tsx apps/cliente/src/screens/modals/ModalCPF.tsx`

Expected: `FormScreen` nos sete arquivos de tela e `FormSheet` em `ModalCPF.tsx`.

- [ ] **Step 7: Commit**

```bash
git add apps/cliente/src/screens/auth/CriarConta.tsx apps/cliente/src/screens/auth/Login.tsx apps/cliente/src/screens/auth/EsqueciSenha.tsx apps/cliente/src/screens/auth/RecuperarSenha.tsx apps/cliente/src/screens/perfil/Perfil.tsx apps/cliente/src/screens/home/AdicionarCartao.tsx apps/cliente/src/screens/home/EscolhaRetirada.tsx apps/cliente/src/screens/modals/ModalCPF.tsx
git commit -m "refactor(cliente): migrate critical forms to keyboard primitives"
```

### Task 4: Gates finais e smoke focado em APK Android release

**Files:**
- Create: `docs/qa/12.3-android-form-keyboard.md`
- Create: `docs/qa/evidence/12.3-cadastro-compacto.png`
- Create: `docs/qa/evidence/12.3-cartao-compacto.png`
- Create: `docs/qa/evidence/12.3-cpf-gboard.png`
- Create: `docs/qa/evidence/12.3-termos-talkback.png`
- Modify: `docs/stories/12.3.story.md`
- Test: `apps/cliente/src/components/ui/formContracts.test.ts`

**Interfaces:**
- Consumes: o APK do perfil `demo-apk` de `apps/cliente/eas.json` e as superfícies migradas na Task 3.
- Produces: evidência auditável com build EAS, aparelho/configuração, caso exercitado, resultado observado e captura de tela.
- Produces: Story 12.3 em `Ready for Review`, com resultados reais dos gates; qualquer falha mantém a story fora desse estado.

- [ ] **Step 1: Rodar o conjunto automatizado final sem cache de tarefa**

Run: `pnpm --filter @keepit/cliente test`

Expected: PASS em toda a suíte Cliente.

Run: `pnpm --filter @keepit/cliente typecheck`

Expected: PASS sem erros.

Run: `git diff --check`

Expected: saída vazia e exit code 0.

- [ ] **Step 2: Gerar um APK Android release pelo perfil interno existente**

Run: `cd apps/cliente && eas build --platform android --profile demo-apk`

Expected: build concluído com artifact `apk`; registrar em `docs/qa/12.3-android-form-keyboard.md` o ID, a URL do artifact, o commit SHA e a data efetivamente retornados pelo EAS. Não aprovar a story com build de desenvolvimento ou Expo Go.

- [ ] **Step 3: Instalar o APK e preparar as duas configurações de maior risco**

Run: `cd apps/cliente && eas build:run --platform android --latest`

Expected: o APK recém-gerado abre no emulador/dispositivo Android com Gboard.

Executar dois percursos, sem multiplicar todas as telas por todas as combinações:

1. Compacto (viewport aproximado de 360 × 640), navegação por gestos, Gboard e escala de fonte 1,3: cadastro, login, solicitar recuperação, redefinir senha, edição de perfil, cartão, fallback de CEP e CPF.
2. Grande (viewport aproximado de 412 × 915), navegação por três botões, Gboard e fonte padrão: repetir os três casos de maior altura/risco — cadastro, cartão e CPF.

Para forçar fonte ampliada via ADB antes do percurso compacto:

```bash
adb shell settings put system font_scale 1.3
```

Ao terminar, restaurar a configuração:

```bash
adb shell settings put system font_scale 1.0
```

- [ ] **Step 4: Aprovar cada comportamento crítico no aparelho**

Em cada superfície exercitada, focar o último campo visível e confirmar:

- o campo focado permanece integralmente visível;
- há scroll suficiente para alcançar título, erro e ações secundárias;
- o CTA primário fica acima do Gboard e da barra inferior;
- arrastar o conteúdo fecha o teclado e um toque no CTA é entregue;
- voltar por gesto ou pelo botão Android fecha primeiro o teclado e não deixa a tela travada;
- nenhum controle obrigatório trunca com fonte 1,3;
- no cadastro, a caixa continua alinhada à primeira linha e toda a linha alterna o aceite;
- com TalkBack no cadastro, a linha anuncia “Aceito os Termos e a Política de Privacidade”, o estado marcado/desmarcado e o erro após submit sem aceite;
- no CPF, título, explicação, campo e CTA cabem/rolam dentro da folha sem ultrapassar safe area.

Nos quatro estados citados, salvar as capturas com comandos executados depois de navegar manualmente até cada estado:

```bash
mkdir -p docs/qa/evidence
adb exec-out screencap -p > docs/qa/evidence/12.3-cadastro-compacto.png
adb exec-out screencap -p > docs/qa/evidence/12.3-cartao-compacto.png
adb exec-out screencap -p > docs/qa/evidence/12.3-cpf-gboard.png
adb exec-out screencap -p > docs/qa/evidence/12.3-termos-talkback.png
```

Se qualquer item falhar, registrar `FAIL` com reprodução exata e não mudar o status da story.

- [ ] **Step 5: Registrar evidência real e atualizar a story**

Criar `docs/qa/12.3-android-form-keyboard.md` somente após a execução. Usar o título `Story 12.3 — Evidência Android de formulários e teclado` e cinco seções: `Build verificado`, `Ambiente`, `Resultados`, `Evidências` e `Gates automatizados`. Registrar valores reais para ID/URL/SHA/data do EAS; modelo/API/resolução/modo de navegação/Gboard/escala; resultado e observação de cada superfície; os quatro caminhos de captura acima; e saída resumida com exit code dos três gates. Não escrever `PASS` para comportamento que não tenha sido observado no APK.

Em `docs/stories/12.3.story.md`, marcar os subtasks concluídos, mudar `Status` de `Draft` para `Ready for Review` e substituir `QA Results: Pendente` pelo resumo factual dos comandos, APK, aparelhos/configurações e eventuais limitações observadas.

- [ ] **Step 6: Commit**

```bash
git add docs/qa/12.3-android-form-keyboard.md docs/qa/evidence/12.3-cadastro-compacto.png docs/qa/evidence/12.3-cartao-compacto.png docs/qa/evidence/12.3-cpf-gboard.png docs/qa/evidence/12.3-termos-talkback.png docs/stories/12.3.story.md
git commit -m "test(cliente): record Android form keyboard verification"
```
