# Persistência de Sessão — `@keepit/supabase-client` e o bootstrap dos apps

**Autor:** @architect (Aria)
**Data:** 2026-07-31
**Escopo:** Como a sessão do Supabase Auth sobrevive ao reinício do app, num pacote compartilhado entre dois apps React Native (Expo) e um app web (Next.js). Decisão escalada pelo @po (Story 2.3.1, Change Log 0.2, item 5) e pelo @qa (gate `2.3.1-navegacao-reativa-sessao.yaml`, `recommendations.future[0]`).

Este documento é normativo para a Story 2.6 (AC5) e para a story de infraestrutura que a precede.

---

## 1. Estado real verificado

Tudo abaixo foi conferido arquivo a arquivo nesta sessão. Nada é herdado de leitura de terceiros — o Épico 2 já teve três fontes falsas passarem por dev e QA.

### 1.1 O defeito reportado — **confirmado**

`packages/supabase-client/src/index.ts` L38-43:

```ts
export function createClient(): SupabaseClient<Database> {
  const url = requireEnv('SUPABASE_URL');
  const anonKey = requireEnv('SUPABASE_ANON_KEY');

  return createSupabaseClient<Database>(url, anonKey);
}
```

Sem terceiro argumento — sem `storage`, sem `persistSession`, sem `autoRefreshToken`. E `createServiceRoleClient()`, L62-67 do mesmo arquivo, **passa** `{ auth: { autoRefreshToken: false, persistSession: false } }`. O contraste apontado pelo @po está correto: a ausência no `createClient()` é omissão, não decisão deliberada.

Em React Native não existe `localStorage`; o `supabase-js` cai num storage em memória e a sessão morre com o processo.

### 1.2 Uma correção ao enunciado da escalação — **nenhum app importa `@keepit/supabase-client`**

`grep -rn "@keepit/supabase-client" apps/ packages/` (excluindo `node_modules`) devolve, fora de comentários:

| Consumidor | Natureza |
|---|---|
| `packages/core-data/package.json` | dependência `workspace:*` |
| `packages/core-data/src/supabase/{auth,store,product,hub,order,wallet,admin,analytics}.supabase.ts` | 8 `import { createClient }` |

**Zero** ocorrências em `apps/cliente`, `apps/lojista` ou `apps/admin` (a única citação em `apps/cliente/src/navigation/RootNavigator.tsx` L37 é texto de JSDoc). Os três apps dependem de `@keepit/core-data`, não de `@keepit/supabase-client` — confirmado nos três `package.json`.

Isso muda a natureza do problema: **a fronteira de injeção não é app → `supabase-client`, é app → `core-data` → `supabase-client`.** Qualquer solução que só mexa em `createClient()` não chega no app; e qualquer solução que peça ao app importar `supabase-client` direto fura a camada `core-data` que o Épico 0 construiu de propósito.

### 1.3 A tensão web × nativo — **confirmada, e menor do que parece**

- `apps/cliente` e `apps/lojista`: Expo `~57.0.8` / React Native `0.86.0`.
- `apps/admin`: Next.js `16.2.12`, sem nenhuma dependência React Native.
- `@react-native-async-storage/async-storage@2.2.0` está **só** em `apps/cliente/package.json` (L19), consumido por `apps/cliente/src/lib/onboardingFlag.ts` e seu teste (Story 2.1). Não está em `lojista` nem em `admin`. **Confirmado.**
- `expo-secure-store`: **não existe** em nenhum `package.json` do repo.

O risco descrito é real: um `import AsyncStorage from '@react-native-async-storage/async-storage'` dentro de `packages/supabase-client` arrastaria dependência RN para o bundle do Next.js e quebraria o SSR. Mas ele só se materializa se o pacote **importar** o storage. Se o pacote apenas **receber** um storage, não há acoplamento nenhum — nem de build, nem de tipo (`SupportedStorage` é um tipo do próprio `@supabase/supabase-js`, agnóstico de plataforma).

### 1.4 Dois bloqueadores adicionais que ninguém registrou

Ambos impedem a AC5 da 2.6 tanto quanto o `storage` ausente. Encontrados nesta investigação:

**(a) `process.env.SUPABASE_URL` não existe no bundle React Native.**

`createClient()` lê `process.env.SUPABASE_URL` e `process.env.SUPABASE_ANON_KEY` (L39-40) e **lança** se ausentes. O Expo só inlineia no bundle variáveis com o prefixo `EXPO_PUBLIC_`. Verificado no repo:

- `grep -rn "EXPO_PUBLIC"` em todo o projeto → **zero ocorrências**;
- `apps/cliente` não tem `babel.config.js`, `metro.config.js` nem `.env` próprio (`ls -a apps/cliente`);
- nenhum `package.json` do monorepo declara `dotenv`, `react-native-dotenv` ou `babel-plugin-inline-dotenv`;
- `.env.example` L24-25 define `SUPABASE_URL` / `SUPABASE_ANON_KEY` **sem** prefixo.

Consequência: com `DATA_SOURCE=supabase`, o primeiro `createClient()` do app Cliente lança `Variável de ambiente obrigatória ausente`. O caminho Supabase **nunca rodou dentro do app Cliente** — o `signUp` da Story 2.3 e o `onAuthStateChange` da 2.3.1 foram validados contra o adapter e contra o mock, nunca no runtime RN. Coerente com o gate da 2.3.1, que declara não ter tido device/simulador.

O mesmo vale para `DATA_SOURCE`: `resolveDataSource()` (`core-data/src/index.ts` L67) lê `process.env.DATA_SOURCE`, e o próprio JSDoc L57-59 registra que **nenhum app passa `{ source }`** hoje. O app Cliente é 100% mock hoje, e não há como sair disso sem tocar no bootstrap.

**(b) Oito `SupabaseClient` distintos por `DataClient`.**

`createDataClient()` (L83-92) chama os 8 factories **sem argumento**, e cada adapter faz seu próprio `createClient()`. São 8 instâncias, 8 `GoTrueClient` internos. Hoje isso é inofensivo porque só o `auth` fala com a rede. A partir do momento em que houver `persistSession: true`, passam a ser 8 refreshers concorrentes sobre a mesma chave de storage — além do aviso `Multiple GoTrueClient instances detected`. E a partir do Épico 4+, um `order.supabase.ts` com sessão própria consultaria o Postgres como anônimo e bateria na RLS.

Boa notícia: **os 8 factories já aceitam `client?: SupabaseClient<Database>`** — verificado por grep nas 8 assinaturas. O ponto de injeção já existe; só não é usado.

---

## 2. Opções avaliadas

| # | Opção | Arquivos tocados | Quebra consumidor? | Muda API pública? | Manutenção |
|---|---|---|---|---|---|
| **A** | Parâmetro opcional em `createClient(options?)` | 1 (`supabase-client`) | Não (param opcional) | Aditiva | Trivial |
| **B** | Factory por plataforma dentro do pacote (detecção de runtime) | 1-2 | Não | Não | Ruim — detecção de plataforma é frágil e o pacote passa a conhecer RN |
| **C** | Sub-exports `@keepit/supabase-client/native` e `/web` | pacote + `exports` + resolução do Metro/Next | Não | Sim (novo contrato de import) | Ruim — dois artefatos para manter, config de bundler em 3 apps, e o pacote **ainda** teria que importar AsyncStorage no `/native` |
| **D** | Cada app constrói o próprio client | 3 apps + `core-data` | Sim | Sim | Ruim — triplica leitura de env, fura a camada `core-data`, e `supabase-client` perde a razão de existir |
| **A+E** | **A** + injeção de **um** client já pronto em `createDataClient({ supabaseClient })`, repassado aos 8 adapters | 1 + 1 + bootstrap do app | Não | Aditiva nos dois pontos | Trivial — usa um ponto de extensão que já existe |

Descartes:

- **B** viola o princípio nº2 (`CLAUDE.md`): detecção de plataforma é sofisticação para um problema que a injeção resolve com um parâmetro.
- **C** é a solução "correta de biblioteca" — e é abstração para um problema que ainda não existe. Temos três apps neste repo, todos sob nosso controle; não publicamos o pacote.
- **D** desfaz deliberadamente a fronteira do Épico 0 (telas → port → adapter) por um detalhe de storage.
- **A sozinha** resolve o `storage`, mas não chega no app: `core-data` continua chamando `createClient()` sem argumento em 8 lugares. Precisaria propagar um `storage` por `CreateDataClientOptions` → 8 adapters → 8 `createClient(...)`, e o storage do RN atravessaria a camada de dados como dado de configuração. É mais encanamento, não menos.

## 3. Decisão

**Adotada a opção A+E.** Três mudanças aditivas, nenhuma quebrando consumidor existente.

### 3.1 `createClient()` aceita opções de auth (aditivo, opcional)

```ts
// packages/supabase-client/src/index.ts  — forma-alvo, não implementar aqui
import type { SupportedStorage } from '@supabase/supabase-js';

export interface CreateClientOptions {
  /** Adapter de storage. Omitido: default do supabase-js (localStorage no browser, memória no RN). */
  storage?: SupportedStorage;
  /** Default: true (default do supabase-js). */
  persistSession?: boolean;
  /** Default: true (default do supabase-js). */
  autoRefreshToken?: boolean;
}

export function createClient(options: CreateClientOptions = {}): SupabaseClient<Database> { ... }
```

Regras:

- **`@keepit/supabase-client` NUNCA importa `@react-native-async-storage/async-storage`, `expo-secure-store` ou qualquer módulo React Native.** `SupportedStorage` é tipo do `@supabase/supabase-js`, sem custo de runtime. Esta é a regra que preserva o build do `apps/admin`.
- Sem argumento, o comportamento é **exatamente** o de hoje. `apps/admin` (Next.js) não passa nada e recebe o default do `supabase-js` — `localStorage` no browser. Nenhuma mudança em SSR: `createClient()` só é chamado a partir de `core-data`, e nenhum código de servidor do admin o chama hoje.
- `createServiceRoleClient()` **não muda**. Continua `persistSession: false`.

### 3.2 `createDataClient()` aceita e compartilha um único client

```ts
// packages/core-data/src/index.ts — forma-alvo
export interface CreateDataClientOptions {
  source?: DataSource;
  /** Só usado com `source: 'supabase'`. Omitido: `createClient()` sem opções. */
  supabaseClient?: SupabaseClient<Database>;
}
```

No ramo `source === 'supabase'`, resolver **um** client (o injetado, ou um `createClient()` só) e passá-lo aos 8 factories — que já aceitam `client?`. Fecha o bloqueador 1.4(b) com uma linha e sem mudar nenhuma das 8 assinaturas.

### 3.3 O storage nativo vive no bootstrap do app

`apps/cliente` (e, no Épico 3+, `apps/lojista`) monta o client e o entrega ao `DataClient`:

```ts
// apps/cliente/App.tsx (ou src/lib/dataClient.ts) — forma-alvo
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@keepit/supabase-client';
import { getDataClient } from '@keepit/core-data';

getDataClient({
  source: 'supabase',
  supabaseClient: createClient({ storage: AsyncStorage, persistSession: true, autoRefreshToken: true }),
});
```

Este é o **único** ponto do repo onde `@keepit/supabase-client` é importado por um app, e é deliberado: é o bootstrap, o lugar cujo trabalho é conhecer a plataforma. As telas e hooks continuam falando só com `getDataClient()` — a fronteira do Épico 0 fica intacta.

Nota para a implementação: `getDataClient()` memoiza no primeiro uso (L116-121) e ignora `options` nas chamadas seguintes. A chamada de bootstrap **tem que acontecer antes** do primeiro `getDataClient()` de qualquer hook — incluindo o `useEffect` do `RootNavigator`. Módulo de bootstrap importado no topo do `App.tsx` resolve; um `useEffect` não.

### 3.4 Variáveis de ambiente: `EXPO_PUBLIC_`

Sem isso a decisão acima não roda. Nos apps Expo, `SUPABASE_URL` e `SUPABASE_ANON_KEY` precisam chegar como `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Menor mudança que fecha isso sem quebrar Edge Functions, scripts e o admin:

```ts
function readEnv(name: string): string | undefined {
  const value = process.env[`EXPO_PUBLIC_${name}`] ?? process.env[name];
  ...
}
```

E `.env.example` ganha as duas variáveis com prefixo, documentadas como "duplicadas de propósito: o Expo só inlineia `EXPO_PUBLIC_*`". Mesmo tratamento para `DATA_SOURCE`, ou — mais simples e preferível — `apps/cliente` passa `source: 'supabase'` explicitamente no bootstrap, sem env var nenhuma.

**Não é vazamento de segredo.** A `anon key` é pública por construção (`05-security.md` §4.1 já a lista como "Todos"); a proteção é a RLS. A regra absoluta de `05-security.md` §4.1 permanece integralmente: `SUPABASE_SERVICE_ROLE_KEY` e `ASAAS_API_KEY` **nunca** ganham prefixo `EXPO_PUBLIC_` e nunca entram em bundle de app.

## 4. Segurança: `AsyncStorage` vs `expo-secure-store`

**Decisão: `AsyncStorage` no MVP.** Decisão técnica, tomada aqui.

| | AsyncStorage | expo-secure-store |
|---|---|---|
| Proteção | Sandbox do app; texto claro (SQLite no Android, arquivo no iOS) | Keychain (iOS) / Keystore (Android) |
| Limite por valor | Sem limite prático | ~2048 bytes — **uma sessão do Supabase costuma passar disso**; exige particionar o valor em chunks |
| Já no repo | Sim, `apps/cliente@2.2.0`, em uso desde a 2.1 | Não |
| Custo | Zero | Dependência nova + adapter com chunking + testes do chunking, nos dois apps RN |

Justificativa:

1. É o adapter que a documentação oficial do Supabase para React Native recomenda. Não estamos inventando um caminho.
2. O limite de 2 KB do SecureStore obriga a escrever um adapter com particionamento — código de infraestrutura sutil, com modo de falha silencioso (sessão parcialmente gravada), num MVP cujo princípio nº2 é "backend simples e funcional, sem sofisticação".
3. O ativo em risco é limitado. O que fica no storage é o refresh token do **próprio** cliente. A `service_role key` e a `ASAAS_API_KEY` nunca chegam no app (`05-security.md` §4.1); a chave PIX e a API key da subconta do lojista são criptografadas at-rest com `pgsodium` (§4.3); e o cliente é o papel de menor privilégio dos três. O cenário de exploração exige acesso físico ao dispositivo, ou root/jailbreak, ou backup não criptografado — momento em que o refresh token não é o pior problema do usuário.
4. A troca é **barata depois**. Pela decisão 3.3, o storage é escolhido em uma linha do bootstrap do app. Migrar para SecureStore não toca `supabase-client`, não toca `core-data`, não toca nenhuma tela.

**Revisitar quando** (qualquer um dos gatilhos): (a) o app do **Lojista** ganhar sessão persistida — lojista tem acesso a saldo, saque e chave PIX, perfil de risco diferente do cliente; (b) o app passar a guardar qualquer dado financeiro localmente; (c) auditoria de LGPD (pendência 7.1) exigir.

**Não é decisão de negócio** e portanto não vai para o stakeholder. O que **é** de negócio e foi registrado como pendência: por quanto tempo o cliente permanece logado sem reautenticar (ver §7).

## 5. O que a Story 2.6 deve implementar

E o que **não** deve. A 2.6 é a tela de login; ela não deve carregar infraestrutura de plataforma.

### Dentro da 2.6

1. Tela de login fiel ao protótipo (AC1-AC3 já escritas), respeitando a pendência 10.2 (sem login social enquanto não fechar).
2. Corpo de `signIn(email, senha)` em `auth.supabase.ts` — hoje `NotImplementedError`.
3. Remoção dos `getParent()?.navigate('Main')` mortos em `Login.tsx` e `ConfirmacaoSMS.tsx` — parte (b) do REL-006, explicitamente atribuída à 2.6 pelo @sm.
4. AC4 (navegação sem redirecionamento condicional) — sai de graça do `RootNavigator` reativo da 2.3.1.
5. **AC5 vira verificação, não implementação:** fechar o app, reabrir, continuar logado. A implementação estará na story de infraestrutura (§6); a 2.6 só prova o comportamento em device/simulador.
6. REL-007 (gate 2.3.1): timeout de ~5s no `RootNavigator` que, se `cliente` ainda for `undefined`, faz `setCliente(null)` + `console.warn`. Uma linha; a alternativa é tela branca permanente. Agora é obrigatório, porque com persistência a leitura inicial do storage é assíncrona de verdade.
7. REL-008 (gate 2.3.1): remover o fallback de fixture `auth.signIn(DEMO_EMAIL, ...)` de `useCurrentCliente.ts` — com login real ele deixa de ter razão de existir e passou a ter efeito colateral sobre a navegação raiz.

### Fora da 2.6

- Injeção de storage e bootstrap do client → story de infraestrutura (§6).
- `expo-secure-store` → post-MVP, gatilhos em §4.
- `apps/lojista` e `apps/admin` → não se tocam. Lojista entra no Épico 3+; admin fica no default web.
- SEC-002 (`cliente_atualiza_proprio` permite UPDATE de qualquer coluna) → story de RLS dedicada, como o gate já diz.
- TEST-003 (`@testing-library/react-native`) → decidir na 2.6, mas não é pré-requisito desta decisão.
- CFG-001 (`Confirm email` ON) → ação manual do Caio, Task 4 da 2.3.
- Qualquer tela ou mensagem nova de "verifique seu e-mail" → pendência 10.5, decisão de negócio.

## 6. É preciso uma story antes da 2.6? **Sim.**

**Story 2.5.1 — Bootstrap do client Supabase no app Cliente** (numeração a cargo do @sm; o que importa é que precede a 2.6).

Motivos para separar em vez de embutir na 2.6:

- É infraestrutura sem UI, verificável isoladamente por testes de unidade em `packages/`, enquanto a 2.6 é uma tela.
- Toca `packages/supabase-client`, `packages/core-data` e o bootstrap de `apps/cliente` — três pacotes que a 2.6 não deveria abrir.
- É o primeiro momento em que o app Cliente sai do mock. O bloqueador 1.4(a) significa que **nada** do caminho Supabase jamais rodou em runtime RN: o `signUp` da 2.3 vai ser exercitado de verdade pela primeira vez aqui. Isso vai gerar achados. Achados dentro de uma story de tela contaminam o gate da tela.
- A 2.6 já carrega 7 itens (§5), três deles herdados de gates anteriores.

Escopo da 2.5.1, em ordem: (1) `EXPO_PUBLIC_` em `readEnv` + `.env.example` (§3.4); (2) `CreateClientOptions` em `createClient` (§3.1); (3) `supabaseClient` em `CreateDataClientOptions` + client único para os 8 adapters (§3.2); (4) bootstrap em `apps/cliente` com AsyncStorage, antes do primeiro `getDataClient()` (§3.3); (5) verificação em device/simulador: `signUp` real → matar o app → reabrir → continuar em `Main`.

Critério de saída não-negociável: **`apps/admin` (`pnpm --filter @keepit/admin typecheck` + build do Next) continua verde e sem nenhuma dependência React Native no grafo.** É a garantia empírica de que a decisão não vazou RN para a web.

## 7. Pendência de stakeholder registrada

**10.9 — Por quanto tempo o cliente permanece logado sem reautenticar?** Registrada em `docs/PERGUNTAS_REGRAS_NEGOCIO.md` (🟡, → STAKEHOLDER). Nenhum default assumido nesta decisão: enquanto não fechar, vale a configuração de fábrica do projeto `keepit-dev`, sem nenhuma linha de código do MVP forçando expiração. A pergunta se liga à AC6 da 2.6, que faz do re-login o caminho de recuperação do PIN (decisão 10.4).

Não vira decisão técnica silenciosa: se o stakeholder quiser sessão curta, isso é configuração de projeto no painel do Supabase, não código.

---

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-07-31 | 1.0 | Decisão de persistência de sessão (opção A+E: opções opcionais em `createClient` + client único injetado em `createDataClient`, storage escolhido no bootstrap do app). `AsyncStorage` no MVP, `expo-secure-store` post-MVP com gatilhos. Dois bloqueadores adicionais descobertos e documentados: `EXPO_PUBLIC_` ausente (o caminho Supabase nunca rodou em runtime RN) e 8 `SupabaseClient` por `DataClient`. Escalada do @po (2.3.1 v0.2 item 5) e do @qa (gate 2.3.1, `recommendations.future[0]`) — respondida. | @architect (Aria) |
