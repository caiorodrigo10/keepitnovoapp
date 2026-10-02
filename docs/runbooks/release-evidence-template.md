# Template redigido de evidência de release

Use uma cópia local deste arquivo para cada candidato de release. O registro
documenta fatos verificáveis e referências de evidência; ele não substitui logs
do build, recibos das lojas, revisão de privacidade ou aprovação jurídica.

Não inclua tokens, chaves, caminhos de credenciais, identificadores de contas,
contatos pessoais, listas de testadores ou URLs privadas. Guarde esses itens no
cofre corporativo e registre aqui somente uma referência interna redigida.

## Estado do registro

- Data/hora UTC: `<AAAA-MM-DDTHH:MM:SSZ>`
- Responsável: `<papel ou equipe; sem contato pessoal>`
- Commit candidato (SHA completo): `<PENDENTE>`
- Branch/tag imutável: `<PENDENTE>`
- Worktree limpo no momento do build: `<PENDENTE: sim/não + evidência>`
- Decisão final: `<PENDENTE: aprovado/reprovado>`

## Configuração local verificada

Preencha com os valores efetivos do commit candidato, sem copiar credenciais.

| Campo | Cliente | Lojista |
|---|---|---|
| Nome/slug | `<PENDENTE>` | `<PENDENTE>` |
| Identificador iOS | `<PENDENTE>` | `<PENDENTE>` |
| Identificador Android | `<PENDENTE>` | `<PENDENTE>` |
| Versão pública | `<PENDENTE>` | `<PENDENTE>` |
| Build number iOS | `<PENDENTE>` | `<PENDENTE>` |
| Version code Android | `<PENDENTE>` | `<PENDENTE>` |
| Fonte de versão EAS | `<PENDENTE>` | `<PENDENTE>` |
| Perfil EAS | `<PENDENTE>` | `<PENDENTE>` |
| Ambiente EAS | `<PENDENTE>` | `<PENDENTE>` |
| Canal de atualização OTA | `<PENDENTE ou não configurado>` | `<PENDENTE ou não configurado>` |
| Datasource público | `<PENDENTE>` | `<PENDENTE>` |
| QA habilitado | `<PENDENTE>` | `<PENDENTE ou não aplicável>` |

Checklist de configuração:

- [ ] O `scheme`, o bundle identifier iOS e o package Android correspondem ao
  aplicativo correto.
- [ ] A versão pública, o build number e o version code são maiores ou válidos
  para o destino pretendido, conforme prova da loja.
- [ ] O perfil de produção resolve `environment=production` e
  `EXPO_PUBLIC_DATA_SOURCE=supabase`.
- [ ] O guard em `packages/core-data/src/data-mode.ts` rejeita fonte ausente ou
  `mock` em produção; os testes dos dois apps exercitam o perfil efetivo.
- [ ] O canal OTA efetivo foi registrado a partir da configuração resolvida. Se
  não houver canal configurado, o registro declara isso expressamente.
- [ ] Nenhum valor secreto ou identificador de conta foi copiado para este
  registro.

## Testes do commit candidato

Registre o comando exato, horário UTC, resultado e uma referência para o log
redigido. Um resultado local não comprova o comportamento do artefato instalado.

| Escopo | Comando exato | Resultado | Horário UTC | Referência do log |
|---|---|---|---|---|
| Guard/config Cliente | `<PENDENTE>` | `<PENDENTE>` | `<PENDENTE>` | `<PENDENTE>` |
| Guard/config Lojista | `<PENDENTE>` | `<PENDENTE>` | `<PENDENTE>` | `<PENDENTE>` |
| Core data | `<PENDENTE>` | `<PENDENTE>` | `<PENDENTE>` | `<PENDENTE>` |
| Typecheck Cliente | `<PENDENTE>` | `<PENDENTE>` | `<PENDENTE>` | `<PENDENTE>` |
| Typecheck Lojista | `<PENDENTE>` | `<PENDENTE>` | `<PENDENTE>` | `<PENDENTE>` |
| Smoke no artefato assinado | `<PENDENTE: exige build real>` | `<PENDENTE>` | `<PENDENTE>` | `<PENDENTE>` |

## Build assinado — evidência externa pendente

Repita o bloco para Cliente/Lojista e iOS/Android.

- Aplicativo/plataforma: `<PENDENTE>`
- Commit embutido no artefato: `<PENDENTE>`
- Versão/build efetivos: `<PENDENTE>`
- Perfil, ambiente e canal efetivos: `<PENDENTE>`
- ID do build: `<PENDENTE; manter redigido neste arquivo>`
- Data/hora UTC de início e conclusão: `<PENDENTE>`
- SHA-256 do artefato: `<PENDENTE>`
- Assinatura/provisionamento válidos: `<PENDENTE>`
- Log do build: `<PENDENTE; referência segura, sem URL privada>`
- Resultado da instalação e smoke: `<PENDENTE>`

Até que esse bloco seja preenchido a partir de um build real, o release não tem
prova de artefato reproduzível ou instalável.

## Submissão e revisão das lojas — evidência externa pendente

Repita o bloco para cada aplicativo e loja.

- Loja e faixa: `<PENDENTE>`
- Versão/build submetidos: `<PENDENTE>`
- Data/hora UTC da submissão: `<PENDENTE>`
- ID da submissão/release: `<PENDENTE; manter redigido neste arquivo>`
- Status de processamento: `<PENDENTE>`
- Status de revisão: `<PENDENTE>`
- Data/hora UTC de disponibilidade: `<PENDENTE>`
- Evidência de disponibilidade: `<PENDENTE; referência segura>`
- Observações/rejeições: `<PENDENTE; sem dados pessoais>`

Configuração local ou um comando de teste verde não comprova submissão,
processamento, aprovação em revisão ou disponibilidade nas lojas.

## Privacidade e exclusão de conta — prova pendente

- Política de Privacidade pública e acessível: `<PENDENTE: URL pública + hash/data>`
- Termos públicos e acessíveis: `<PENDENTE: URL pública + hash/data>`
- Aprovação jurídica/editorial: `<PENDENTE: referência corporativa>`
- URL de exclusão informada em cada loja: `<PENDENTE>`
- Fluxo autenticado de solicitação/cancelamento testado no artefato: `<PENDENTE>`
- Exclusão definitiva e política de retenção aprovadas: `<PENDENTE>`
- Resultado da revisão de privacidade das lojas: `<PENDENTE>`

Os testes locais de autenticação, solicitação e cancelamento sustentam somente o
comportamento do código. Eles não provam deploy, publicação das páginas, exclusão
definitiva, conteúdo jurídico aprovado ou aceite pelas lojas.

## Aprovação

- [ ] Configuração local e testes conferidos.
- [ ] Build assinado e smoke do artefato comprovados.
- [ ] Submissão, processamento e revisão comprovados nas duas lojas.
- [ ] Evidência pública de privacidade e exclusão aprovada.
- [ ] Referências externas foram guardadas em local corporativo autorizado.

Parecer: `<PENDENTE>`
