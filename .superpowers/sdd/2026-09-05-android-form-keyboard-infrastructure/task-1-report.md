# Task 1 — Primitive compartilhado de formulário e checkbox acessível

## Status

Implementada, revisada e commitada em 2026-09-05 no worktree
`story-12-1-mock-cliente`. O hash do commit está registrado no handoff da
task.

## Entregas

- `FormScreen` compartilhado com safe area, `KeyboardAvoidingView`, conteúdo
  rolável e footer opcional fora do scroll, mas dentro da área comprimida pelo
  teclado.
- Contratos puros para comportamento de teclado por plataforma, props de
  scroll e semântica acessível do checkbox.
- `Checkbox` passa a exigir label acessível, expõe estado checked e usa o erro
  como hint; o próprio componente renderiza o erro como região live/alert.
- `CriarConta` delega semântica e erro dos termos ao checkbox; `Checkout`
  fornece o label da opção de nota fiscal.
- Barrel de UI exporta `FormScreen`.

## Evidência TDD

### RED

```text
pnpm --filter @keepit/cliente test -- src/components/ui/formContracts.test.ts
Test Files  1 failed (1)
Tests       no tests
```

A falha esperada foi `Failed to load url ./formContracts`: o módulo de
contratos ainda não existia.

### GREEN focado

```text
pnpm --filter @keepit/cliente test -- src/components/ui/formContracts.test.ts
Test Files  1 passed (1)
Tests       3 passed (3)
Exit 0
```

Os testes usam valores literais e exercitam os helpers reais, sem mocks. Eles
detectam inversão do comportamento de plataforma, alteração indevida dos props
de scroll e perda de label/estado/hint do checkbox.

## Verificação final

```text
pnpm --filter @keepit/cliente test
Test Files  29 passed (29)
Tests       211 passed (211)
Exit 0
```

```text
pnpm --filter @keepit/cliente typecheck
> tsc --noEmit
Exit 0
```

`git diff --check` terminou com exit 0 e sem saída. A busca global encontrou
somente dois consumidores de `Checkbox`, ambos atualizados para o novo
contrato obrigatório.

## Self-review

- O footer permanece fora do `ScrollView` e dentro do
  `KeyboardAvoidingView`, preservando o CTA na área útil ajustada pelo teclado.
- O fallback de plataforma é `height`, portanto Android e plataformas não-iOS
  não recebem comportamento de padding por engano.
- A linha inteira do checkbox continua sendo o alvo pressionável; os estilos
  de caixa/texto e o alinhamento da primeira linha foram preservados.
- O deslocamento do erro usa a largura existente da caixa (`22`) mais o token
  `spacing['3']`, equivalente ao layout anterior de `CriarConta`.
- Erro ausente não produz `accessibilityHint` nem espaço visual adicional.
- Não foram adicionados renderer, dependência, redesign, timer, estado ou
  comportamento além do brief.

## Preocupações remanescentes

- O MVP não possui teste de renderer para a hierarquia visual de `FormScreen`
  ou o anúncio live do erro; por restrição explícita, essa montagem foi
  validada pelo TypeScript e os contratos críticos ficaram em helpers puros.
- A suíte mantém o aviso preexistente de depreciação da API CJS do Vite, sem
  falhas.
