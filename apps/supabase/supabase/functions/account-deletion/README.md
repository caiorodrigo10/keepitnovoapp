# account-deletion

Edge Function autenticada para o ciclo reversível de exclusão de conta.

- `POST { "action": "status" }` consulta o último estado do usuário do JWT.
- `POST { "action": "schedule", "currentPassword": "..." }` reautentica e agenda para sete dias depois.
- `POST { "action": "cancel" }` cancela atomicamente um agendamento pendente
  somente enquanto `delete_at > now()` no relógio do banco.

## Jornada e prazo

Cliente, Lojista e a página externa autenticada mantêm `schedule/status/cancel`.
O prazo exibido vem do `deleteAt` persistido, nunca de sete dias recalculados no
dispositivo. O botão de recuperação só aparece em `scheduled` antes desse prazo
e é removido quando ele vence com a tela aberta. Esse relógio local serve à
apresentação: o PostgreSQL é a autoridade final, inclusive se o dispositivo
estiver atrasado. Uma recusa de cancelamento nunca libera o acesso normal.

- Antes do vencimento: “Você pode cancelar até {data}.”
- `scheduled` vencida: “O prazo para cancelar terminou. Sua solicitação aguarda
  processamento ou revisão de pendências.” Pendências operacionais não reiniciam
  a carência e não reabrem o cancelamento; Caio as revisa pelos fluxos existentes.
- `processing` ou `failed`: “Sua exclusão está em processamento. Uma falha
  temporária não cancela a solicitação.” O acesso permanece restrito.
- `completed`: apresentar “Exclusão concluída”, somente com o estado persistido.
  Sete dias tornam a solicitação elegível; não garantem conclusão naquele instante.

O fluxo existente encerra a sessão após persistir o agendamento. Falha ao sair
mantém a restrição e permite tentar “Sair” novamente. Não há consulta pública por
e-mail ou UUID: a consulta exige as próprias credenciais e JWT válido. Depois da
remoção de Auth, o login é negado; não oferecer recuperação nem inferir conclusão
apenas porque o login falhou. Contas presentes em `admin_users`, inclusive com
perfil Cliente/Lojista, seguem atendimento manual pelo Caio, fora da exclusão
automática. A página externa informa essa orientação sem criar tela de governança.

## Retenção mínima do piloto

A matriz aprovada `mvp-2026-10-15` limita a retenção financeira a fatos e
referências indispensáveis por cinco anos após o encerramento financeiro,
com acesso restrito aos dados retidos para conciliação/comprovação. Cadastro,
credenciais e tokens são removidos no processamento elegível; não se conservam
tokens como evidência financeira. Auditoria mínima: 180 dias após conclusão ou
cancelamento. Ao vencer o prazo financeiro, remover referências correlacionáveis
e conservar somente totais agregados não identificáveis.

Cópias e logs sob controle da Keepit têm prazo de até 30 dias da criação, sem
renovação ao copiar. Cópias de provedores e registros próprios de fornecedores
seguem as políticas e prazos deles, verificados e registrados pelo Caio antes da
ativação. Excluir a conta Keepit não apaga os registros próprios do Asaas.
Esses são os compromissos da política do piloto, não prova de configuração remota
ou promessa de eliminação instantânea. O procedimento de operação/restore pertence
ao [runbook do processador](../process-account-deletions/README.md).

A função é publicada com `verify_jwt=true`. Ela nunca aceita ID de usuário no
corpo, nunca registra senha/JWT e cria um cliente Auth efêmero para cada
reautenticação. A service role permanece somente no runtime server-side.
O body é estrito e rejeita identificadores de conta ou campos desconhecidos.

Agendar ou cancelar nunca purga cartões antecipadamente. O processador interno
`process-account-deletions` é separado desta API pública: antes de marcar uma
solicitação vencida como concluída, ele chama a RPC exclusiva de `service_role`
`purgar_cartoes_conta`. A RPC falha fechada sem a política de retenção aprovada,
remove cartões, tokens temporários e vínculo reutilizável, e devolve somente uma
prova opaca de ausência — nunca um token. Se essa etapa falhar, a solicitação
não pode ser concluída.

## Operação e restauração

Antes de qualquer lote do processador interno, Caio mantém fora do conjunto
restaurável um registro privado de request ID, UUID, vencimento e estado de
todas as exclusões ativas (`scheduled` e `processing`). O registro não contém
credenciais, PII, tokens, URLs assinadas ou valores financeiros e não prova que
uma exclusão terminou: exportar antes do lote não autoriza marcar conclusão.

Em restauração, banco e blobs sintéticos são recuperados em stack isolada. As
exclusões confirmadas são reaplicadas, as incertas são conciliadas e a ausência
de Auth/sessões/tokens/objetos é comprovada antes de liberar acesso. Sem registro
confiável, o ambiente continua isolado. O registro dura enquanto ativo e por
180 dias depois de conclusão/cancelamento; cópias e logs sob controle Keepit
expiram em no máximo 30 dias da criação, sem extensão por cópia. Admin (mesmo
com perfil Cliente/Lojista) e pendências operacionais permanecem em atendimento
manual; não existe recuperação pública por e-mail ou UUID.
