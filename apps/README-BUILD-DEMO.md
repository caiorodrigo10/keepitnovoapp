# Build — Modo Demo (mock) vs Produção · Android + iOS

Os apps `cliente` e `lojista` (Expo) leem **`EXPO_PUBLIC_DATA_SOURCE`** em
build-time (`apps/*/src/lib/dataClientBootstrap.ts`) para escolher a camada de
dados de `@keepit/core-data`:

- ausente ou ≠ `supabase` → **mock** (100% em memória, sem rede, dataset realista).
- `supabase` → client Supabase real (exige `EXPO_PUBLIC_SUPABASE_URL` +
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` via EAS secrets — a anon key é pública por
  design; **nunca** hardcode a `service_role`).

> A flag é **build-time** (perfil EAS), não um switch em runtime — o mock não
> vai no bundle de produção (mais seguro/leve).

## Perfis (`eas.json` de cada app)

| Perfil | `EXPO_PUBLIC_DATA_SOURCE` | Distribuição | Para quê |
|--------|---------------------------|--------------|----------|
| `demo` | `mock` | `store` | **Canal de teste dos donos**: iOS → **TestFlight**; Android → **Play Internal Testing**. Dataset mock realista. |
| `demo-apk` | `mock` | `internal` (APK) | **Android sem conta Play**: gera um `.apk` para instalar direto no aparelho (útil enquanto a conta Google Play — US$25 — não estiver ativa). |
| `production` | `supabase` | `store` | Release real (App Store / Play). Exige as secrets do Supabase. |

`autoIncrement: true` em todos → o EAS sobe o `buildNumber` (iOS) / `versionCode`
(Android) a cada build (o TestFlight/Play rejeitam número repetido — hoje ambos
estão em `1`).

## Comandos

### iOS — TestFlight (conta Apple já ativa ✅)
```bash
# por app (rode dentro de apps/cliente e apps/lojista)
eas build   --profile demo --platform ios
eas submit  --profile demo --platform ios     # sobe pro TestFlight
```
Depois: no App Store Connect, adicionar os donos como testers (Internal Testing
= sem revisão da Apple; External = revisão leve).

### Android — APK direto (não precisa de conta Play)
```bash
eas build --profile demo-apk --platform android
# baixar o .apk do link do EAS e enviar aos donos (instalar liberando "fontes desconhecidas")
```

### Android — Play Internal Testing (quando a conta US$25 existir)
```bash
eas build  --profile demo --platform android
eas submit --profile demo --platform android
```

### Produção (mais à frente)
```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://xxxx.supabase.co"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ..."
eas build --profile production --platform ios      # e/ou android
eas submit --profile production --platform ios
```

## O que depende de você (credenciais)

| Item | Estado | Para qual caminho |
|------|--------|-------------------|
| Conta Apple Developer + App Records (`ascAppId` no `eas.json`) | ✅ existe | iOS TestFlight (demo e produção) |
| `credentials/AuthKey.p8` (chave ASC API) presente no CI/local do build | conferir | `eas submit` iOS |
| Conta Google Play Developer (US$25) + `credentials/play-service-account.json` | ⏳ pendente (PUB-01) | Android via Play (`demo`/`production`). **Não** bloqueia o `demo-apk`. |
| Secrets `EXPO_PUBLIC_SUPABASE_*` no EAS | pendente | só `production` |

> Builds do EAS rodam **na nuvem** — não precisa de Mac para o iOS.

## Admin (Next.js — web)
Não usa Expo: lê `DATA_SOURCE` (sem prefixo) em
`apps/admin/src/lib/dataClientBootstrap.ts` (ausente/≠`supabase` → mock;
`supabase` → real), configurado via env do processo Next (`.env.local` / host de
deploy), não via `eas.json`.
