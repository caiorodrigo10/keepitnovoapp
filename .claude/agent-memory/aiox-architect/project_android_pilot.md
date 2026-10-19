---
name: project-android-pilot
description: Piloto Android/Play Internal Testing (Fase 0-Android do Épico 9) analisado; gated em decisão de conta Google Play
metadata:
  type: project
---

Análise de arquitetura do piloto Android (paridade do piloto iOS/TestFlight) feita em 2026-08-09, documentada em `docs/architecture/08-mvp-pilot-android.md`. Plano: stories 9.0.9–9.0.13 como "Fase 0-Android" dentro do Épico 9 (não novo épico). Gap é config+conta, não código: falta `android.package` + `android.versionCode` no app.json e bloco `android` (app-bundle) + `submit.pilot.android` (track internal) no eas.json dos dois apps.

**Why:** stakeholder/Caio quer o dono testar o app instalado via Play Store, equivalente ao que já existe no iOS.

**How to apply:**
- **Conta Google Play Developer (US$25 one-time) NÃO está aprovada** — é pré-requisito de negócio/ops, não assumir como decidido. Bloqueia stories @devops/ops, não as de @dev (config).
- `android.package` recomendados `com.keepithub.cliente`/`com.keepithub.lojista` — imutáveis após publish, precisam confirmação de Caio antes de commitar (mesmo padrão dos bundle IDs iOS).
- `EXPO_ACCESS_TOKEN` do `.env` estava inválido na Story 9.0.7 — renovar antes de qualquer `eas build` Android.
- Keystore recomendado: EAS-managed (não local). Ver [[project-epic0-uifirst]] para o contexto UI-first/mock.
