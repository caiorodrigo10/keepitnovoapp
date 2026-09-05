# Task 3 review — confirmação honesta e callback demo

Data: 2026-09-05
Commit revisado: `05e709d`
Range: `05e709d^..05e709d`
Veredito: **CONCERNS — 1 finding MEDIUM no CTA demonstrável**

## Finding

### MEDIUM — dois toques no CTA reapresentam o callback e podem trocar `ready` por `invalid`

O botão “Abrir callback de demonstração” não recebe `loading`/`disabled` e
`handleAbrirCallbackDemo` não possui guarda single-flight
(`apps/cliente/src/screens/auth/EsqueciSenha.tsx:59-65,81-85`). No mock, o
consumo da URL tem a latência padrão de 350 ms antes de começar
(`packages/core-data/src/mock/async-helpers.ts:3-4,20-37`), portanto o CTA
permanece acionável tempo suficiente para um segundo toque comum.

Cada evento de URL é processado independentemente e cada resultado não nulo é
entregue ao listener de navegação
(`apps/cliente/src/navigation/passwordRecoveryLinking.ts:82-88`). A primeira
entrega muda a solicitação `requested → ready`; a segunda entrega do mesmo ID
é corretamente recusada pelo adapter porque o estado já não é `requested`
(`packages/core-data/src/mock/auth.mock.ts:171-181`). Assim, a navegação pode
receber `recovery=ready` seguida de `recovery=invalid`, terminando na tela de
link inválido embora o usuário tenha acabado de gerar um callback válido. Isso
torna a demonstração sensível a double tap justamente durante o atraso visível
do mock.

**Correção requerida:** tornar a ação de abertura single-flight e desabilitar
o CTA desde o primeiro acionamento até a navegação, garantindo que apenas uma
abertura do callback guardado seja iniciada. Uma regressão focada pode invocar
a ação duas vezes antes da primeira conclusão e provar uma única abertura; não
é necessário adicionar renderer ou ampliar a matriz de testes.

## Controles aprovados

- A apresentação deriva exclusivamente da capacidade discriminada da port:
  `email` mantém confirmação neutra sem CTA, enquanto `demo` mostra
  explicitamente “Modo demonstração” e “nenhum e-mail real foi enviado”. Não
  há leitura de `DATA_SOURCE` nas telas.
- O presenter devolve apenas strings constantes e `showDemoAction`; não
  devolve nem interpola e-mail, callback ou detalhe técnico. O callback opaco
  permanece restrito ao resultado demo guardado pela tela.
- No caminho normal de um único acionamento, a URL mock volta pelo mesmo
  `createPasswordRecoveryLinking`: a URL bruta é consumida pela port e somente
  a URL interna `?recovery=ready|invalid` chega ao React Navigation. A falha de
  `Linking.openURL` também navega somente com `invalid`.
- `RecuperarSenha` trata qualquer valor diferente de `ready`, inclusive params
  ausentes, como inválido e compartilha mensagem genérica para expiração e
  consumo. Sucesso continua usando `navigation.reset` para Login, sem deixar a
  tela de redefinição na pilha.
- A capacidade real continua coerente com o Supabase atual: o commit não
  simula envio nem expõe CTA técnico quando a port retorna `{ delivery:
  'email' }`. A referência oficial confirma suporte de
  `resetPasswordForEmail` a PKCE e o fluxo `PASSWORD_RECOVERY` →
  `updateUser({ password })`; o changelog atual não contém breaking change
  aplicável a esta apresentação.

## Evidência executada

- `pnpm --filter @keepit/cliente test -- src/lib/passwordRecoveryPresentation.test.ts`:
  **5/5 PASS**, 1/1 arquivo.
- `git diff --check 05e709d^ 05e709d`: **PASS**.
- Inspeção estrutural Graphify limitada aos quatro arquivos de código do
  commit: **15 nós, 16 relações, 4 comunidades**; confirmou a cadeia
  `EsqueciSenha → resolvePasswordResetConfirmation` e a ação
  `handleAbrirCallbackDemo`.
- Revisão manual do commit e de seus consumidores diretos confirmou o fluxo
  `Linking.openURL → subscribe → consumePasswordRecoveryUrl → AuthPort`, sem
  sinks de log ou passagem da URL bruta ao estado de navegação.
- CodeRabbit CLI indisponível no ambiente. Nenhum renderer, suíte ampla, APK
  ou alteração de implementação foi executado.
- O worktree contém mudanças concorrentes fora do commit revisado; elas foram
  ignoradas e não foram alteradas.

## Decisão

A separação real/demo, a copy honesta e a sanitização estão corretas no caminho
de um único acionamento. O double tap pode converter um callback recém-criado
em navegação inválida e afeta diretamente a capacidade demonstrável desta
task; por isso o gate fica em **CONCERNS** até a ação ser single-flight.
