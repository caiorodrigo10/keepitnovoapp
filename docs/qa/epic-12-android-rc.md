# Épico 12 — Android QA RC

## Estado do gate

**PENDING — artefato gerado; smoke Android da Task 3 ainda não executado.**

Este documento registra somente o gate automatizado e o APK inicial da Task
14.2. A decisão RC PASS/FAIL será emitida depois do smoke curto no único
aparelho/emulador, sem gerar outro APK.

## Gate automatizado

- Execução única: `pnpm qa` em 2026-09-05, no HEAD `a12ca07`.
- Resultado: PASS — 27/27 tarefas Turbo concluídas.
- Testes observados no gate: Cliente 354/354, core-data 671/671, Supabase
  57/57, Lojista 86/86, config 19/19 e supabase-client 9/9.
- A revisão final encontrou depois um HIGH no replay de categorias em buscas
  recentes. O defeito foi corrigido e aprovado em `f6a82e2`.
- Gate focado posterior, sem repetir `pnpm qa`: `searchViewState.test.ts`
  15/15 PASS e `@keepit/cliente typecheck` PASS.

## Configuração e metadados do artefato

| Campo | Evidência |
|---|---|
| Profile EAS | `demo-apk` |
| Plataforma / tipo | Android / `apk` |
| Distribuição | `internal` |
| Versão | `1.0.0` |
| VersionCode | `7` |
| Commit do build | `1cf88cf5f241db598cfa1841a42b7ce387aeb17f` |
| Fix de busca incluído | `f6a82e2` (ancestral direto) |
| Datasource | `mock` |
| Ambiente | `qa` |
| Painel QA | habilitado (`EXPO_PUBLIC_QA_ENABLED=true`) |
| Data do build | `2026-09-05T20:45:34Z` |

Antes do upload, `eas env:list preview --format long --scope project`
confirmou SHA/data como variáveis plaintext do projeto. `eas config
--platform android --profile demo-apk --json` confirmou datasource `mock`,
ambiente `qa`, QA habilitado e `buildType=apk`. O job remoto devolveu o mesmo
SHA de commit e `appBuildVersion=7`.

## APK efetivo

- Build ID: `9ed5f830-46f3-44f6-a359-3daac0af86fb`
- Status: `FINISHED`
- Build: <https://expo.dev/accounts/keepithub/projects/keepit-cliente/builds/9ed5f830-46f3-44f6-a359-3daac0af86fb>
- APK: <https://expo.dev/artifacts/eas/NFaTPYS3c198GuB02iH5IFB1Z1iI24g4iXE0V49yyVc.apk>
- SHA-256: `d9469711abc80d63d1f956bff2e44da2b2fb176424ea450362b6840e8029e63a`
- Tamanho baixado: `89.882.441` bytes.

Foi produzido exatamente um APK nesta rodada.

## Tentativas sem artefato

1. A primeira invocação falhou localmente, antes do upload/criação de job,
   com `ENOSPC` ao compactar no `/tmp` compartilhado. A recuperação apenas
   redirecionou `TMPDIR` para disco com espaço.
2. O job `39c8d457-6def-40a6-99b6-697ae5752cad`, no SHA antigo `a12ca07`, foi
   iniciado antes da chegada do bloqueio HIGH. Ele foi cancelado imediatamente
   após o pause: status remoto `CANCELED`, `artifacts={}`; nenhum APK foi
   produzido por esse job.

Os incrementos reservados por essas tentativas explicam o salto do
`versionCode` local 4 para o artefato 7. O valor 6 foi preservado em commit
antes do build efetivo, e o EAS aplicou o incremento 7 ao APK.

## Smoke da Task 3

Ainda não executado. Dispositivo/Android, sete cenários agrupados,
acessibilidade rápida, capturas, defeitos e decisão final serão adicionados
sem nova compilação.
