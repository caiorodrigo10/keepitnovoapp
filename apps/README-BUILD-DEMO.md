# Build — Modo Demo vs Produção (Cliente / Lojista)

Os apps `cliente` e `lojista` (Expo) leem a env var **`EXPO_PUBLIC_DATA_SOURCE`**
em build-time (ver `apps/*/src/lib/dataClientBootstrap.ts`) para decidir a
camada de dados de `@keepit/core-data`:

- Ausente ou qualquer valor diferente de `supabase` → **mock** (100% em
  memória, sem rede, nada quebra).
- `supabase` → client Supabase real (exige `EXPO_PUBLIC_SUPABASE_URL` +
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`, via EAS secrets/env — a anon key é pública
  por design, mas **nunca** hardcode a `service_role` key aqui).

## Perfis disponíveis (`eas.json` de cada app)

| Perfil | `EXPO_PUBLIC_DATA_SOURCE` | Distribuição | Uso |
|--------|---------------------------|---------------|-----|
| `demo` | `mock` | `internal` (APK Android) | APK que os donos da Keepit instalam para navegar o app inteiro com dados mock realistas. Não precisa de Supabase configurado. |
| `production` | `supabase` | `store` (App Bundle) | Build para as lojas (Play Store / App Store). Exige as env vars do Supabase configuradas via EAS secrets. |
| `pilot` | `mock` | `store` | Perfil legado do piloto Android (Internal Testing) — mantido por compatibilidade. |

## Comandos

```bash
# APK de demo (mock) — instalação direta no device
eas build --profile demo --platform android

# Build de produção (Supabase real)
eas build --profile production --platform android
eas build --profile production --platform ios
```

Antes de rodar `--profile production`, configure as secrets no projeto EAS:

```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://xxxx.supabase.co"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ..."
```

## Admin (Next.js — web)

O Admin não usa Expo, então não lê `EXPO_PUBLIC_*`. Ele lê `DATA_SOURCE`
(sem prefixo) em `apps/admin/src/lib/dataClientBootstrap.ts` — mesmo padrão
de flag (ausente/≠`supabase` → mock; `supabase` → real), configurado via
variável de ambiente do processo Next (`.env.local` ou env do host de
deploy), não via `eas.json`.
